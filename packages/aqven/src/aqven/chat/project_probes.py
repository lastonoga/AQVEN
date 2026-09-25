import asyncio
import hashlib
import json
import sys
from collections.abc import Callable, Iterator
from dataclasses import dataclass
from pathlib import Path, PurePosixPath
from typing import Final, Protocol

from pydantic import BaseModel, ConfigDict, ValidationError

from aqven.compiler import CompileError, compile_project
from aqven.diagnostics import Diagnostic
from aqven.ir import CompiledLlmNode, CompiledProject
from aqven.loader import LoadedFlow, load_project
from aqven.preview import PreviewError, PromptPreview, PromptPreviewRequest, preview_prompt
from aqven.spec import ExperimentId, FactorKind, FlowId, LlmNodeSpec, NodeId, VariantSpec

CHECK_TIMEOUT_SECONDS: Final = 60.0
FAILURE_TAIL: Final = 400
SKIPPED_FOLDERS: Final = frozenset({".aqven", ".git", ".venv", "__pycache__", "node_modules", ".pytest_cache"})

type FileStamp = tuple[str, int, int]
type TreeFingerprint = frozenset[FileStamp]


@dataclass(frozen=True, slots=True)
class CheckOutcome:
    diagnostics: tuple[Diagnostic, ...] = ()
    failure: str | None = None


class ProjectCheck(Protocol):
    async def static(self) -> CheckOutcome: ...


class CheckDocument(BaseModel):
    model_config = ConfigDict(extra="ignore")
    diagnostics: tuple[Diagnostic, ...]


def parsed_check(stdout: bytes, stderr: bytes) -> CheckOutcome:
    try:
        return CheckOutcome(CheckDocument.model_validate_json(stdout).diagnostics)
    except ValidationError:
        detail = stderr.decode(errors="replace").strip()[-FAILURE_TAIL:] or "it printed no report"
        return CheckOutcome(failure=detail)


async def stopped(process: asyncio.subprocess.Process) -> None:
    if process.returncode is not None:
        return
    process.kill()
    await process.wait()


@dataclass(frozen=True, slots=True)
class SubprocessCheck:
    root: Path
    python: str = sys.executable
    timeout_seconds: float = CHECK_TIMEOUT_SECONDS

    def command(self) -> tuple[str, ...]:
        return (self.python, "-P", "-m", "aqven", "check", "--format", "json", "--static", str(self.root))

    async def static(self) -> CheckOutcome:
        process = await asyncio.create_subprocess_exec(
            *self.command(),
            cwd=self.root,
            stdin=asyncio.subprocess.DEVNULL,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        try:
            async with asyncio.timeout(self.timeout_seconds):
                stdout, stderr = await process.communicate()
        except TimeoutError:
            return CheckOutcome(failure=f"it did not finish in {self.timeout_seconds:g} s")
        finally:
            await stopped(process)
        return parsed_check(stdout, stderr)


def project_files(root: Path) -> Iterator[Path]:
    for folder, folders, names in root.walk():
        folders[:] = [name for name in folders if name not in SKIPPED_FOLDERS]
        yield from (folder / name for name in names)


def file_stamp(path: Path, relative: PurePosixPath) -> FileStamp | None:
    try:
        stat = path.stat()
    except OSError:
        return None
    return (relative.as_posix(), stat.st_mtime_ns, stat.st_size)


def any_file(path: PurePosixPath) -> bool:
    return True


def tree_fingerprint(root: Path, keep: Callable[[PurePosixPath], bool] = any_file) -> TreeFingerprint:
    files = ((path, PurePosixPath(path.relative_to(root).as_posix())) for path in project_files(root))
    stamps = (file_stamp(path, relative) for path, relative in files if keep(relative))
    return frozenset(stamp for stamp in stamps if stamp is not None)


def counted(count: int, noun: str) -> str:
    return f"{count:,} {noun}" if count == 1 else f"{count:,} {noun}s"


@dataclass(frozen=True, slots=True)
class NodePreview:
    node: str
    messages: int
    characters: int
    attachments: tuple[str, ...]
    mode: str
    schema_characters: int
    digest: str

    @classmethod
    def of(cls, preview: PromptPreview) -> NodePreview:
        texts = (preview.instructions or "", *(message.text for message in preview.messages))
        return cls(
            node=f"{preview.flow_id}.{preview.node_id}",
            messages=len(preview.messages),
            characters=sum(len(text) for text in texts),
            attachments=tuple(str(attachment.type) for attachment in preview.attachments),
            mode=str(preview.output.mode),
            schema_characters=len(json.dumps(preview.output.json_schema)),
            digest=hashlib.sha256(preview.model_dump_json(exclude={"notes"}).encode()).hexdigest(),
        )

    def line(self) -> str:
        attached = ", ".join(self.attachments) or "none"
        return (
            f"- {self.node}: {counted(self.messages, 'message')}, {counted(self.characters, 'character')}, "
            f"attachments: {attached}, output {self.mode} with a {self.schema_characters:,}-character schema"
        )


class PromptPreviews(Protocol):
    async def previews(self) -> tuple[NodePreview, ...] | None: ...


def node_preview(project: CompiledProject, flow_id: FlowId, node_id: NodeId) -> NodePreview | None:
    request = PromptPreviewRequest(flow_id=flow_id, node_id=node_id)
    try:
        return NodePreview.of(preview_prompt(project, request))
    except PreviewError:
        return None


def project_previews(root: Path) -> tuple[NodePreview, ...] | None:
    loaded = load_project(root).project
    if loaded is None:
        return None
    try:
        project = compile_project(loaded)
    except CompileError:
        return None
    llm_nodes = (
        (flow.flow_id, node.node_id)
        for flow in project.flows.values()
        for node in flow.nodes.values()
        if isinstance(node, CompiledLlmNode)
    )
    previews = (node_preview(project, flow_id, node_id) for flow_id, node_id in llm_nodes)
    return tuple(preview for preview in previews if preview is not None)


@dataclass(frozen=True, slots=True)
class CompiledPreviews:
    root: Path

    async def previews(self) -> tuple[NodePreview, ...] | None:
        return await asyncio.to_thread(project_previews, self.root)


class ExperimentAgents(Protocol):
    async def factor_agents(self, experiment_id: str) -> tuple[str, ...]: ...


def written_agent(flow: LoadedFlow | None, node_id: NodeId) -> str | None:
    source = None if flow is None else flow.nodes.get(node_id)
    if source is None or not isinstance(source.spec, LlmNodeSpec):
        return None
    return source.spec.agent


def variant_agent(variant: VariantSpec, node_id: NodeId, written: dict[NodeId, str | None]) -> str | None:
    chosen = (variant.nodes or {}).get(node_id)
    return chosen if chosen is not None else written.get(node_id)


def agent_factor_agents(root: Path, experiment_id: str) -> tuple[str, ...]:
    loaded = load_project(root).project
    experiment = None if loaded is None else loaded.experiments.get(ExperimentId(experiment_id))
    if loaded is None or experiment is None:
        return ()
    spec = experiment.source.spec
    if spec.varies is None or spec.varies.what is not FactorKind.AGENT:
        return ()
    flow = experiment.flows.get(spec.subject.flow) or loaded.flows.get(spec.subject.flow)
    written = {node_id: written_agent(flow, node_id) for node_id in spec.varies.nodes}
    chosen = (variant_agent(variant, node_id, written) for variant in spec.variants for node_id in written)
    return tuple(sorted({agent for agent in chosen if agent is not None}))


@dataclass(frozen=True, slots=True)
class LoadedExperimentAgents:
    root: Path

    async def factor_agents(self, experiment_id: str) -> tuple[str, ...]:
        return await asyncio.to_thread(agent_factor_agents, self.root, experiment_id)
