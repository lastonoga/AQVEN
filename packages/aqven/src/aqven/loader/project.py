import hashlib
import posixpath
import re
from collections.abc import Callable, Mapping
from dataclasses import dataclass, field, replace
from pathlib import Path, PurePosixPath
from typing import Final

from pydantic import TypeAdapter, ValidationError

from aqven.diagnostics import Diagnostic, DiagnosticCode, diagnostic
from aqven.loader.aliases import RESERVED_ALIASES, Alias, AliasScope, reserved_flow, resolve_aliases
from aqven.loader.layout import (
    AQVEN_HEADER,
    EXPERIMENT_FILES,
    EXPERIMENT_NOTES,
    FLOW_FILES,
    LOCK_FILE,
    NODE_ID_SEPARATOR,
    PROJECT_FILE,
    SKIPPED_DIRECTORIES,
    TEXT_SUFFIX,
    ancestors,
    arm_experiment_folder,
    builder_kind,
    declares,
    entity_id,
    entity_stem,
    expanded_node_id,
    expected_kind,
    finding_experiment_folder,
    inference_texts,
    type_id_for,
)
from aqven.loader.strict_yaml import Position, YamlDocument, YamlPath, read_strict_yaml
from aqven.loader.validation import header_diagnostics, spec_kind, validation_diagnostics
from aqven.spec import (
    NAME_PATTERN,
    AgentId,
    AgentSpec,
    ArmId,
    DatasetFile,
    DatasetId,
    ExperimentId,
    ExperimentSpec,
    FindingSpec,
    FlowId,
    FlowSpec,
    InferenceId,
    InferenceSpec,
    LlmNodeSpec,
    McpServerId,
    McpServerSpec,
    NodeId,
    NodeSpec,
    ProjectSpec,
    SpecKind,
    ToolId,
    ToolSpec,
    TypeId,
    TypeSpec,
    inner_nodes,
)

HASH_PREFIX: Final = "sha256-"
NAME: Final = re.compile(NAME_PATTERN)

PROJECT_ADAPTER: Final = TypeAdapter(ProjectSpec)
TYPE_ADAPTER: Final = TypeAdapter[TypeSpec](TypeSpec)
FLOW_ADAPTER: Final = TypeAdapter(FlowSpec)
NODE_ADAPTER: Final = TypeAdapter[NodeSpec](NodeSpec)
DATASET_ADAPTER: Final = TypeAdapter(DatasetFile)
EXPERIMENT_ADAPTER: Final = TypeAdapter(ExperimentSpec)
INFERENCE_ADAPTER: Final = TypeAdapter(InferenceSpec)
AGENT_ADAPTER: Final = TypeAdapter(AgentSpec)
TOOL_ADAPTER: Final = TypeAdapter(ToolSpec)
MCP_SERVER_ADAPTER: Final = TypeAdapter(McpServerSpec)
FINDING_ADAPTER: Final = TypeAdapter(FindingSpec)
UNNAMED_KINDS: Final = frozenset({SpecKind.FINDING})


class ProjectNotFound(Exception):
    def __init__(self, start: Path) -> None:
        super().__init__(f"{PROJECT_FILE} not found in {start} or any parent folder")
        self.start = start


@dataclass(frozen=True, slots=True)
class SourceSpec[T]:
    path: str
    file_hash: str
    spec: T
    positions: Mapping[YamlPath, Position]


@dataclass(frozen=True, slots=True)
class LoadedFlow:
    flow_id: FlowId
    folder: str
    source: SourceSpec[FlowSpec] | None
    builder_path: str | None
    nodes: Mapping[NodeId, SourceSpec[NodeSpec]]


@dataclass(frozen=True, slots=True)
class LoadedInference:
    inference_id: InferenceId
    folder: str
    source: SourceSpec[InferenceSpec] | None
    builder_path: str | None
    texts: Mapping[str, str]

    @property
    def stem(self) -> str:
        return posixpath.join(self.folder, self.inference_id)


@dataclass(frozen=True, slots=True)
class LoadedExperiment:
    experiment_id: ExperimentId
    folder: str
    source: SourceSpec[ExperimentSpec]
    arms: Mapping[ArmId, LoadedFlow]
    notes: str | None
    findings: Mapping[str, SourceSpec[FindingSpec]] = field(default_factory=dict[str, SourceSpec[FindingSpec]])

    def arm_folder(self, arm_id: ArmId) -> str | None:
        arm = self.arms.get(arm_id)
        return None if arm is None else arm.folder


@dataclass(frozen=True, slots=True)
class LoadedProject:
    root: Path
    project: SourceSpec[ProjectSpec]
    types: Mapping[TypeId, SourceSpec[TypeSpec]]
    inferences: Mapping[InferenceId, LoadedInference]
    agents: Mapping[AgentId, SourceSpec[AgentSpec]]
    tools: Mapping[ToolId, SourceSpec[ToolSpec]]
    mcp_servers: Mapping[McpServerId, SourceSpec[McpServerSpec]]
    flows: Mapping[FlowId, LoadedFlow]
    datasets: Mapping[DatasetId, SourceSpec[DatasetFile]]
    texts: Mapping[str, str]
    invalid_paths: frozenset[str] = frozenset()
    broken_ids: frozenset[str] = frozenset()
    aliases: Mapping[str, Mapping[YamlPath, Alias]] = field(default_factory=dict[str, Mapping[YamlPath, Alias]])
    experiments: Mapping[ExperimentId, LoadedExperiment] = field(default_factory=dict[ExperimentId, LoadedExperiment])


@dataclass(frozen=True, slots=True)
class LoadResult:
    project: LoadedProject | None
    diagnostics: tuple[Diagnostic, ...]


def find_project_root(start: Path) -> Path:
    resolved = start.resolve()
    candidates = (resolved, *resolved.parents)
    root = next((candidate for candidate in candidates if (candidate / PROJECT_FILE).is_file()), None)
    if root is None:
        raise ProjectNotFound(start)
    return root


def load_project(root: Path) -> LoadResult:
    if not (root / PROJECT_FILE).is_file():
        message = f"{root} has no {PROJECT_FILE}: it is not an aqven project root"
        return LoadResult(None, (diagnostic(DiagnosticCode.E_PROJECT_NOT_FOUND, PROJECT_FILE, (), message),))
    files = project_files(root)
    inference_stems = frozenset(entity_stem(path) for path in files if declares(path, SpecKind.INFERENCE))
    flow_folders = tuple(sorted({posixpath.dirname(path) for path in files if _named(path, FLOW_FILES)}))
    experiment_folders = frozenset(posixpath.dirname(path) for path in files if _named(path, EXPERIMENT_FILES))
    collector = _Collector(root, inference_stems, AliasScope(root.name, flow_folders), experiment_folders)
    for relative in files:
        collector.add(relative)
    return collector.result()


def project_files(root: Path) -> tuple[str, ...]:
    files = (path for path in root.rglob("*") if path.is_file())
    relative = (path.relative_to(root) for path in files)
    kept = (path for path in relative if not any(_skipped(part) for part in path.parts))
    return tuple(sorted(path.as_posix() for path in kept))


def file_hash(data: bytes) -> str:
    return f"{HASH_PREFIX}{hashlib.sha256(data).hexdigest()}"


def _read_listed(location: Path) -> bytes | None:
    try:
        return location.read_bytes()
    except OSError:
        return None


def _skipped(part: str) -> bool:
    return part.startswith(".") or part in SKIPPED_DIRECTORIES


def _named(path: str, names: frozenset[str]) -> bool:
    return PurePosixPath(path).name in names


@dataclass(frozen=True, slots=True)
class _File:
    path: str

    @property
    def folder(self) -> str:
        return posixpath.dirname(self.path)

    @property
    def entity(self) -> str:
        return entity_id(self.path)

    @property
    def stem(self) -> str:
        return entity_stem(self.path)


@dataclass(slots=True)
class _Parts[T]:
    folder: str
    name: str
    source: SourceSpec[T] | None = None
    builder_path: str | None = None

    @property
    def path(self) -> str:
        return self.source.path if self.source is not None else self.builder_path or self.folder


type _NodeTable = dict[NodeId, SourceSpec[NodeSpec]]


@dataclass(slots=True)
class _Collector:
    root: Path
    inference_stems: frozenset[str]
    scope: AliasScope
    experiment_folders: frozenset[str]
    diagnostics: list[Diagnostic] = field(default_factory=list[Diagnostic])
    invalid: set[str] = field(default_factory=set[str])
    broken: set[str] = field(default_factory=set[str])
    project: SourceSpec[ProjectSpec] | None = None
    types: dict[TypeId, SourceSpec[TypeSpec]] = field(default_factory=dict[TypeId, SourceSpec[TypeSpec]])
    agents: dict[AgentId, SourceSpec[AgentSpec]] = field(default_factory=dict[AgentId, SourceSpec[AgentSpec]])
    tools: dict[ToolId, SourceSpec[ToolSpec]] = field(default_factory=dict[ToolId, SourceSpec[ToolSpec]])
    mcp_servers: dict[McpServerId, SourceSpec[McpServerSpec]] = field(
        default_factory=dict[McpServerId, SourceSpec[McpServerSpec]]
    )
    datasets: dict[DatasetId, SourceSpec[DatasetFile]] = field(default_factory=dict[DatasetId, SourceSpec[DatasetFile]])
    experiments: dict[ExperimentId, SourceSpec[ExperimentSpec]] = field(
        default_factory=dict[ExperimentId, SourceSpec[ExperimentSpec]]
    )
    flows: dict[str, _Parts[FlowSpec]] = field(default_factory=dict[str, _Parts[FlowSpec]])
    inferences: dict[str, _Parts[InferenceSpec]] = field(default_factory=dict[str, _Parts[InferenceSpec]])
    findings: list[SourceSpec[FindingSpec]] = field(default_factory=list[SourceSpec[FindingSpec]])
    nodes: list[tuple[_File, SourceSpec[NodeSpec]]] = field(default_factory=list[tuple[_File, SourceSpec[NodeSpec]]])
    texts: dict[str, str] = field(default_factory=dict[str, str])
    aliases: dict[str, Mapping[YamlPath, Alias]] = field(default_factory=dict[str, Mapping[YamlPath, Alias]])

    def add(self, relative: str) -> None:
        reader = FILE_READERS.get(PurePosixPath(relative).suffix)
        if reader is not None:
            reader(self, relative)

    def result(self) -> LoadResult:
        owned = self._owned_nodes()
        reserved = (parts for parts in self.flows.values() if parts.name in RESERVED_ALIASES)
        self.diagnostics.extend(reserved_flow(parts.name, parts.path) for parts in reserved)
        for flow in self.flows.values():
            self._check_builder(flow)
        for inference in self.inferences.values():
            self._check_builder(inference)
        project_flows = {
            folder: parts for folder, parts in self.flows.items() if not _is_arm(folder, self.experiment_folders)
        }
        flows = {FlowId(name): _loaded_flow(parts, owned) for name, parts in self._unique(project_flows).items()}
        findings = self._owned_findings()
        experiments = {
            key: LoadedExperiment(
                experiment_id=key,
                folder=posixpath.dirname(source.path),
                source=source,
                arms=_arms(posixpath.dirname(source.path), self.flows, owned),
                notes=self.texts.get(posixpath.join(posixpath.dirname(source.path), EXPERIMENT_NOTES)),
                findings=findings.get(posixpath.dirname(source.path), {}),
            )
            for key, source in self.experiments.items()
        }
        inferences = {
            InferenceId(name): LoadedInference(
                InferenceId(name),
                parts.folder,
                parts.source,
                parts.builder_path,
                inference_texts(posixpath.join(parts.folder, name), self.texts),
            )
            for name, parts in self._unique(self.inferences).items()
        }
        if self.project is None:
            return LoadResult(None, tuple(self.diagnostics))
        project = LoadedProject(
            root=self.root,
            project=self.project,
            types=dict(self.types),
            inferences=inferences,
            agents=dict(self.agents),
            tools=dict(self.tools),
            mcp_servers=dict(self.mcp_servers),
            flows=flows,
            datasets=dict(self.datasets),
            texts=dict(self.texts),
            invalid_paths=frozenset(self.invalid),
            broken_ids=frozenset(self.broken),
            aliases={path: aliases for path, aliases in self.aliases.items() if aliases},
            experiments=experiments,
        )
        return LoadResult(project, tuple(self.diagnostics))

    def read_yaml(self, relative: str) -> None:
        data = _read_listed(self.root / relative)
        if data is None or not _is_spec_file(relative, data):
            return
        file = _File(relative)
        document = self._document(relative, data)
        if document is None:
            self._mark_broken(file)
            return
        header = header_diagnostics(document.data, relative, expected_kind(relative))
        kind = spec_kind(document.data)
        self.diagnostics.extend(header)
        if header or kind is None:
            self._mark_broken(file)
            return
        self._check_name(file, kind)
        aliased = resolve_aliases(self.scope, relative, kind, document.data)
        self.diagnostics.extend(aliased.diagnostics)
        self.aliases[relative] = aliased.aliases
        YAML_HANDLERS[kind](self, file, replace(document, data=aliased.data), file_hash(data))

    def read_text(self, relative: str) -> None:
        try:
            self.texts[relative] = (self.root / relative).read_text(encoding="utf-8")
        except UnicodeDecodeError as error:
            message = f"file is not UTF-8 encoded: {error.reason}"
            self.diagnostics.append(diagnostic(DiagnosticCode.E_PROMPT_SYNTAX, relative, (), message))
        except OSError:
            return

    def read_builder(self, relative: str) -> None:
        kind = builder_kind(relative)
        if kind is None:
            return
        file = _File(relative)
        self._check_name(file, kind)
        BUILDER_HANDLERS[kind](self, file)

    def collect_flow_builder(self, file: _File) -> None:
        self.flows.setdefault(file.folder, _Parts(file.folder, file.entity)).builder_path = file.path

    def collect_inference_builder(self, file: _File) -> None:
        self.inferences.setdefault(file.stem, _Parts(file.folder, file.entity)).builder_path = file.path

    def collect_project(self, file: _File, document: YamlDocument, digest: str) -> None:
        self.project = self._validated(PROJECT_ADAPTER, file, document, digest)

    def collect_type(self, file: _File, document: YamlDocument, digest: str) -> None:
        self._register(self.types, type_id_for(file.entity), self._validated(TYPE_ADAPTER, file, document, digest))

    def collect_flow(self, file: _File, document: YamlDocument, digest: str) -> None:
        parts = self.flows.setdefault(file.folder, _Parts(file.folder, file.entity))
        parts.source = self._validated(FLOW_ADAPTER, file, document, digest)

    def collect_inference(self, file: _File, document: YamlDocument, digest: str) -> None:
        parts = self.inferences.setdefault(file.stem, _Parts(file.folder, file.entity))
        parts.source = self._validated(INFERENCE_ADAPTER, file, document, digest)

    def collect_node(self, file: _File, document: YamlDocument, digest: str) -> None:
        source = self._validated(NODE_ADAPTER, file, document, digest)
        if source is not None:
            self.nodes.append((file, self._with_inference(file, source)))

    def collect_dataset(self, file: _File, document: YamlDocument, digest: str) -> None:
        source = self._validated(DATASET_ADAPTER, file, document, digest)
        self._register(self.datasets, DatasetId(file.entity), source)

    def collect_experiment(self, file: _File, document: YamlDocument, digest: str) -> None:
        source = self._validated(EXPERIMENT_ADAPTER, file, document, digest)
        self._register(self.experiments, ExperimentId(file.entity), source)

    def collect_finding(self, file: _File, document: YamlDocument, digest: str) -> None:
        source = self._validated(FINDING_ADAPTER, file, document, digest)
        if source is not None:
            self.findings.append(source)

    def collect_agent(self, file: _File, document: YamlDocument, digest: str) -> None:
        self._register(self.agents, AgentId(file.entity), self._validated(AGENT_ADAPTER, file, document, digest))

    def collect_tool(self, file: _File, document: YamlDocument, digest: str) -> None:
        self._register(self.tools, ToolId(file.entity), self._validated(TOOL_ADAPTER, file, document, digest))

    def collect_mcp_server(self, file: _File, document: YamlDocument, digest: str) -> None:
        source = self._validated(MCP_SERVER_ADAPTER, file, document, digest)
        self._register(self.mcp_servers, McpServerId(file.entity), source)

    def _document(self, relative: str, data: bytes) -> YamlDocument | None:
        try:
            text = data.decode("utf-8")
        except UnicodeDecodeError as error:
            message = f"file is not UTF-8 encoded: {error.reason}"
            self.diagnostics.append(diagnostic(DiagnosticCode.E_YAML_SYNTAX, relative, (), message))
            return None
        document, problems = read_strict_yaml(text, relative)
        self.diagnostics.extend(problems)
        return document

    def _validated[T](
        self, adapter: TypeAdapter[T], file: _File, document: YamlDocument, digest: str
    ) -> SourceSpec[T] | None:
        try:
            spec = adapter.validate_python(document.data)
        except ValidationError as error:
            self.diagnostics.extend(validation_diagnostics(error, file.path, document.positions, document.data))
            self._mark_broken(file)
            return None
        return SourceSpec(path=file.path, file_hash=digest, spec=spec, positions=document.positions)

    def _mark_broken(self, file: _File) -> None:
        self.invalid.add(file.path)
        self.broken.add(file.entity)

    def _check_name(self, file: _File, kind: SpecKind) -> None:
        if kind in UNNAMED_KINDS:
            return
        name = file.entity
        if NAME.fullmatch(name) is not None and not (kind is SpecKind.NODE and NODE_ID_SEPARATOR in name):
            return
        message = (
            f"id {name!r} from the file or folder name does not match {NAME_PATTERN}; "
            f"a node id must not contain {NODE_ID_SEPARATOR}"
        )
        self.diagnostics.append(diagnostic(DiagnosticCode.E_BAD_NAME, file.path, (), message))

    def _register[K: str, T](self, table: dict[K, SourceSpec[T]], key: K, source: SourceSpec[T] | None) -> None:
        if source is None:
            return
        existing = table.get(key)
        if existing is None:
            table[key] = source
            return
        self._duplicate(key, existing.path, source.path)

    def _duplicate(self, name: str, first: str, second: str) -> None:
        message = f"id {name} is already taken by {first}: the id comes from the file name and is unique per spec kind"
        self.diagnostics.append(diagnostic(DiagnosticCode.E_ID_DUPLICATE, second, (), message))

    def _unique[T](self, table: Mapping[str, _Parts[T]]) -> dict[str, _Parts[T]]:
        unique: dict[str, _Parts[T]] = {}
        for parts in table.values():
            existing = unique.get(parts.name)
            if existing is not None:
                self._duplicate(parts.name, existing.path, parts.path)
                continue
            unique[parts.name] = parts
        return unique

    def _check_builder[T](self, parts: _Parts[T]) -> None:
        if parts.source is None or parts.builder_path is None:
            return
        message = "a spec has exactly one source: YAML or a Python builder"
        self.diagnostics.append(diagnostic(DiagnosticCode.E_SOURCE_CONFLICT, parts.builder_path, (), message))

    def _with_inference(self, file: _File, source: SourceSpec[NodeSpec]) -> SourceSpec[NodeSpec]:
        spec = source.spec
        colocated = file.stem in self.inference_stems
        if not isinstance(spec, LlmNodeSpec) or not colocated:
            return source
        if spec.inference is None:
            return replace(source, spec=spec.model_copy(update={"inference": InferenceId(file.entity)}))
        message = (
            f"the adjacent inference {file.entity}.inference is used without the inference key; "
            "the inference key references an inference with a different name"
        )
        self.diagnostics.append(diagnostic(DiagnosticCode.E_SOURCE_CONFLICT, file.path, ("inference",), message))
        return source

    def _owned_findings(self) -> Mapping[str, Mapping[str, SourceSpec[FindingSpec]]]:
        tables: dict[str, dict[str, SourceSpec[FindingSpec]]] = {
            posixpath.dirname(source.path): {} for source in self.experiments.values()
        }
        for source in self.findings:
            self._own_finding(tables, source)
        return tables

    def _own_finding(
        self, tables: dict[str, dict[str, SourceSpec[FindingSpec]]], source: SourceSpec[FindingSpec]
    ) -> None:
        owner = tables.get(finding_experiment_folder(source.path) or "")
        if owner is None:
            message = "finding outside an experiment: a finding lives in experiments/<id>/findings/<series>.yaml"
            self.diagnostics.append(diagnostic(DiagnosticCode.E_ORPHAN_FILE, source.path, (), message))
            return
        self._register(owner, source.spec.series, source)

    def _owned_nodes(self) -> Mapping[str, _NodeTable]:
        tables: dict[str, _NodeTable] = {folder: {} for folder in self.flows}
        for file, source in self.nodes:
            self._own(tables, file, source)
        return {folder: _expanded(table) for folder, table in tables.items()}

    def _own(self, tables: dict[str, _NodeTable], file: _File, source: SourceSpec[NodeSpec]) -> None:
        owner = next((folder for folder in ancestors(file.folder) if folder in tables), None)
        if owner is None:
            message = "node outside a flow: no flow.yaml or flow.py in the node folder or above"
            self.diagnostics.append(diagnostic(DiagnosticCode.E_ORPHAN_FILE, file.path, (), message))
            return
        self._register(tables[owner], NodeId(file.entity), source)


def _is_arm(flow_folder: str, experiment_folders: frozenset[str]) -> bool:
    owner = arm_experiment_folder(flow_folder)
    return owner is not None and owner in experiment_folders


def _loaded_flow(parts: _Parts[FlowSpec], owned: Mapping[str, _NodeTable]) -> LoadedFlow:
    return LoadedFlow(FlowId(parts.name), parts.folder, parts.source, parts.builder_path, owned[parts.folder])


def _arms(
    experiment_folder: str, flows: Mapping[str, _Parts[FlowSpec]], owned: Mapping[str, _NodeTable]
) -> Mapping[ArmId, LoadedFlow]:
    return {
        ArmId(parts.name): _loaded_flow(parts, owned)
        for folder, parts in sorted(flows.items())
        if arm_experiment_folder(folder) == experiment_folder
    }


def _is_spec_file(relative: str, data: bytes) -> bool:
    return relative == PROJECT_FILE or relative != LOCK_FILE and AQVEN_HEADER.search(data) is not None


def _expanded(table: _NodeTable) -> _NodeTable:
    parents = {inner: local for local, source in table.items() for inner in inner_nodes(source.spec)}
    return {expanded_node_id(local, parents): source for local, source in table.items()}


type _FileReader = Callable[[_Collector, str], None]
type _YamlHandler = Callable[[_Collector, _File, YamlDocument, str], None]
type _BuilderHandler = Callable[[_Collector, _File], None]

FILE_READERS: Final[Mapping[str, _FileReader]] = {
    ".yaml": _Collector.read_yaml,
    ".yml": _Collector.read_yaml,
    TEXT_SUFFIX: _Collector.read_text,
    ".liquid": _Collector.read_text,
    ".py": _Collector.read_builder,
}

YAML_HANDLERS: Final[Mapping[SpecKind, _YamlHandler]] = {
    SpecKind.PROJECT: _Collector.collect_project,
    SpecKind.TYPE: _Collector.collect_type,
    SpecKind.FLOW: _Collector.collect_flow,
    SpecKind.NODE: _Collector.collect_node,
    SpecKind.DATASET: _Collector.collect_dataset,
    SpecKind.EXPERIMENT: _Collector.collect_experiment,
    SpecKind.INFERENCE: _Collector.collect_inference,
    SpecKind.AGENT: _Collector.collect_agent,
    SpecKind.TOOL: _Collector.collect_tool,
    SpecKind.MCP_SERVER: _Collector.collect_mcp_server,
    SpecKind.FINDING: _Collector.collect_finding,
}

BUILDER_HANDLERS: Final[Mapping[SpecKind, _BuilderHandler]] = {
    SpecKind.FLOW: _Collector.collect_flow_builder,
    SpecKind.INFERENCE: _Collector.collect_inference_builder,
}
