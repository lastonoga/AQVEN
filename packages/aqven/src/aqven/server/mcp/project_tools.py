import asyncio
from collections.abc import Callable, Iterable, Mapping
from dataclasses import dataclass
from pathlib import Path
from typing import Final, Protocol

from pydantic import BaseModel

from aqven.diagnostics import render_path
from aqven.loader import (
    EntityKey,
    EntityKind,
    LoadedFlow,
    LoadedProject,
    ProjectIndex,
    Reference,
    SourceSpec,
    build_index,
    entity_stem,
    load_project,
    parent_node_id,
)
from aqven.runtime.address import JsonObject, RequestModel, ResourceModel
from aqven.server.errors import ApiFailure, diagnostic_problem, not_found
from aqven.server.mcp.catalog import Operation, ToolHints, ToolRegistration
from aqven.spec import (
    AgentId,
    DatasetId,
    EvalId,
    FlowId,
    InferenceId,
    McpServerId,
    NodeId,
    NodeSpec,
    ToolId,
    TypeId,
)

NODE_QUALIFIER: Final = "."
STEM_SEPARATOR: Final = "."
PROJECT_UNLOADED: Final = "project did not load: aqven.yaml is missing or could not be parsed"

type SpecLookup = Callable[[LoadedProject, str], BaseModel | None]


class ProjectSource(Protocol):
    async def load(self) -> LoadedProject: ...


@dataclass(frozen=True, slots=True)
class LoaderProjectSource:
    root: Path

    async def load(self) -> LoadedProject:
        result = await asyncio.to_thread(load_project, self.root)
        if result.project is None:
            problems = tuple(diagnostic_problem(item) for item in result.diagnostics)
            raise ApiFailure("NOT_RUNNABLE", PROJECT_UNLOADED, problems=problems)
        return result.project


class FileVersion(ResourceModel):
    path: str
    file_hash: str


class FlowListInput(RequestModel):
    pass


class FlowSummary(ResourceModel):
    flow_id: FlowId
    folder: str
    file: FileVersion | None
    builder_path: str | None
    description: str | None
    input: str | None
    output: str | None
    nodes: int


class FlowList(ResourceModel):
    items: tuple[FlowSummary, ...]


class FlowGetInput(RequestModel):
    flow_id: FlowId
    node_id: NodeId | None = None


class NodeSummary(ResourceModel):
    node_id: NodeId
    node: str
    parent: NodeId | None
    description: str
    file: FileVersion


class NodeFocus(ResourceModel):
    node_id: NodeId
    node: str
    file: FileVersion
    spec: JsonObject
    upstream: tuple[str, ...]
    downstream: tuple[str, ...]
    text_files: tuple[str, ...]


class FlowDetail(ResourceModel):
    flow_id: FlowId
    folder: str
    file: FileVersion | None
    builder_path: str | None
    spec: JsonObject | None
    nodes: tuple[NodeSummary, ...]
    focus: NodeFocus | None


class CatalogListInput(RequestModel):
    kind: EntityKind | None = None


class CatalogItem(ResourceModel):
    kind: EntityKind
    id: str
    path: str


class CatalogList(ResourceModel):
    items: tuple[CatalogItem, ...]


class CatalogGetInput(RequestModel):
    kind: EntityKind
    id: str


class ReferenceView(ResourceModel):
    entity: str
    file: str
    field: str
    line: int | None


class CatalogEntry(ResourceModel):
    kind: EntityKind
    id: str
    path: str | None
    spec: JsonObject | None
    incoming: tuple[ReferenceView, ...]
    outgoing: tuple[ReferenceView, ...]


def spec_json(spec: BaseModel) -> JsonObject:
    return spec.model_dump(mode="json", by_alias=True, exclude_none=True)


def file_version[T](source: SourceSpec[T] | None) -> FileVersion | None:
    if source is None:
        return None
    return FileVersion(path=source.path, file_hash=source.file_hash)


def node_key(flow_id: str, node_id: str) -> EntityKey:
    return EntityKey(EntityKind.NODE, f"{flow_id}{NODE_QUALIFIER}{node_id}")


def node_name(key: EntityKey) -> str:
    return key.id.partition(NODE_QUALIFIER)[2]


def flow_summary(flow: LoadedFlow) -> FlowSummary:
    spec = flow.source.spec if flow.source is not None else None
    return FlowSummary(
        flow_id=flow.flow_id,
        folder=flow.folder,
        file=file_version(flow.source),
        builder_path=flow.builder_path,
        description=spec.description if spec is not None else None,
        input=spec.input if spec is not None else None,
        output=spec.output if spec is not None else None,
        nodes=len(flow.nodes),
    )


def node_summary(node_id: NodeId, source: SourceSpec[NodeSpec]) -> NodeSummary:
    return NodeSummary(
        node_id=node_id,
        node=source.spec.node,
        parent=parent_node_id(node_id),
        description=source.spec.description,
        file=FileVersion(path=source.path, file_hash=source.file_hash),
    )


def node_focus(project: LoadedProject, flow: LoadedFlow, node_id: NodeId) -> NodeFocus:
    source = flow.nodes.get(node_id)
    if source is None:
        raise not_found(f"node {node_id} is not in flow {flow.flow_id}")
    index = build_index(project)
    key = node_key(flow.flow_id, node_id)
    stem = f"{entity_stem(source.path)}{STEM_SEPARATOR}"
    return NodeFocus(
        node_id=node_id,
        node=source.spec.node,
        file=FileVersion(path=source.path, file_hash=source.file_hash),
        spec=spec_json(source.spec),
        upstream=_node_names(reference.target for reference in index.outgoing(key)),
        downstream=_node_names(reference.source for reference in index.incoming(key)),
        text_files=tuple(sorted(path for path in project.texts if path.startswith(stem))),
    )


def _node_names(keys: Iterable[EntityKey]) -> tuple[str, ...]:
    return tuple(sorted({node_name(key) for key in keys if key.kind is EntityKind.NODE}))


def reference_view(reference: Reference, other: EntityKey) -> ReferenceView:
    return ReferenceView(
        entity=str(other), file=reference.file, field=render_path(reference.field), line=reference.line
    )


def _registry_spec[K: str, T: BaseModel](
    table: Callable[[LoadedProject], Mapping[K, SourceSpec[T]]], wrap: Callable[[str], K]
) -> SpecLookup:
    def lookup(project: LoadedProject, entity_id: str) -> BaseModel | None:
        source = table(project).get(wrap(entity_id))
        return source.spec if source is not None else None

    return lookup


def _project_spec(project: LoadedProject, entity_id: str) -> BaseModel | None:
    return project.project.spec


def _inference_spec(project: LoadedProject, entity_id: str) -> BaseModel | None:
    inference = project.inferences.get(InferenceId(entity_id))
    source = inference.source if inference is not None else None
    return source.spec if source is not None else None


def _flow_spec(project: LoadedProject, entity_id: str) -> BaseModel | None:
    flow = project.flows.get(FlowId(entity_id))
    source = flow.source if flow is not None else None
    return source.spec if source is not None else None


def _node_spec(project: LoadedProject, entity_id: str) -> BaseModel | None:
    flow_id, _, node_id = entity_id.partition(NODE_QUALIFIER)
    flow = project.flows.get(FlowId(flow_id))
    source = flow.nodes.get(NodeId(node_id)) if flow is not None else None
    return source.spec if source is not None else None


def _no_spec(project: LoadedProject, entity_id: str) -> BaseModel | None:
    return None


SPEC_LOOKUPS: Final[Mapping[EntityKind, SpecLookup]] = {
    EntityKind.PROJECT: _project_spec,
    EntityKind.AGENT: _registry_spec(lambda project: project.agents, AgentId),
    EntityKind.TOOL: _registry_spec(lambda project: project.tools, ToolId),
    EntityKind.MCP_SERVER: _registry_spec(lambda project: project.mcp_servers, McpServerId),
    EntityKind.TYPE: _registry_spec(lambda project: project.types, TypeId),
    EntityKind.INFERENCE: _inference_spec,
    EntityKind.FLOW: _flow_spec,
    EntityKind.NODE: _node_spec,
    EntityKind.DATASET: _registry_spec(lambda project: project.datasets, DatasetId),
    EntityKind.EVAL: _registry_spec(lambda project: project.evals, EvalId),
    EntityKind.CODE: _no_spec,
}


def catalog_entry(project: LoadedProject, index: ProjectIndex, key: EntityKey) -> CatalogEntry:
    spec = SPEC_LOOKUPS[key.kind](project, key.id)
    return CatalogEntry(
        kind=key.kind,
        id=key.id,
        path=index.definitions.get(key),
        spec=spec_json(spec) if spec is not None else None,
        incoming=tuple(reference_view(item, item.source) for item in index.incoming(key)),
        outgoing=tuple(reference_view(item, item.target) for item in index.outgoing(key)),
    )


@dataclass(frozen=True, slots=True)
class ProjectTools:
    source: ProjectSource

    async def flow_list(self, request: FlowListInput) -> FlowList:
        project = await self.source.load()
        return FlowList(items=tuple(flow_summary(flow) for flow in project.flows.values()))

    async def flow_get(self, request: FlowGetInput) -> FlowDetail:
        project = await self.source.load()
        flow = project.flows.get(request.flow_id)
        if flow is None:
            raise not_found(f"flow {request.flow_id} is not in the project")
        focus = node_focus(project, flow, request.node_id) if request.node_id is not None else None
        return FlowDetail(
            flow_id=flow.flow_id,
            folder=flow.folder,
            file=file_version(flow.source),
            builder_path=flow.builder_path,
            spec=spec_json(flow.source.spec) if flow.source is not None else None,
            nodes=tuple(node_summary(node_id, source) for node_id, source in flow.nodes.items()),
            focus=focus,
        )

    async def catalog_list(self, request: CatalogListInput) -> CatalogList:
        index = build_index(await self.source.load())
        keys = sorted(key for key in index.definitions if request.kind is None or key.kind is request.kind)
        return CatalogList(
            items=tuple(CatalogItem(kind=key.kind, id=key.id, path=index.definitions[key]) for key in keys)
        )

    async def catalog_get(self, request: CatalogGetInput) -> CatalogEntry:
        project = await self.source.load()
        index = build_index(project)
        keys = index.find(request.kind, request.id)
        if not keys:
            raise not_found(f"{request.kind.value}:{request.id} is neither defined nor referenced")
        return catalog_entry(project, index, keys[0])

    def operations(self) -> tuple[ToolRegistration, ...]:
        return (
            Operation(
                name="flow_list",
                description="Project flows: folder, file with hash, description, input and output types, node count.",
                input_model=FlowListInput,
                output_model=FlowList,
                surface="rest_and_mcp",
                hints=ToolHints(title="Project flows", read_only=True, idempotent=True),
                use_case=self.flow_list,
            ),
            Operation(
                name="flow_get",
                description=(
                    "Flow spec: flow.yaml and nodes with paths and file_hash for CAS. With node_id it adds focus: "
                    "the node spec, the nodes it references (upstream), the nodes that reference it (downstream), "
                    "and the node text files (prompts, variants)."
                ),
                input_model=FlowGetInput,
                output_model=FlowDetail,
                surface="rest_and_mcp",
                hints=ToolHints(title="Flow spec", read_only=True, idempotent=True),
                use_case=self.flow_get,
            ),
            Operation(
                name="catalog_list",
                description=(
                    "Project entities by kind (agent, tool, mcp_server, type, inference, flow, node, dataset, eval) "
                    "with file paths; without kind, all of them."
                ),
                input_model=CatalogListInput,
                output_model=CatalogList,
                surface="rest_and_mcp",
                hints=ToolHints(title="Entity catalog", read_only=True, idempotent=True),
                use_case=self.catalog_list,
            ),
            Operation(
                name="catalog_get",
                description=(
                    "One project entity: definition file, spec, what references it and what it references. "
                    "A node is given as <flow_id>.<node_id> or by its local name."
                ),
                input_model=CatalogGetInput,
                output_model=CatalogEntry,
                surface="rest_and_mcp",
                hints=ToolHints(title="Project entity", read_only=True, idempotent=True),
                use_case=self.catalog_get,
            ),
        )
