from collections.abc import Iterable, Iterator, Mapping
from dataclasses import dataclass
from pathlib import PurePosixPath
from typing import Final

from aqven.diagnostics import Diagnostic, Severity
from aqven.loader import PROJECT_FILE, LoadedProject, SourceSpec, expected_kind
from aqven.loader.layout import LOCK_FILE
from aqven.server.errors import not_found
from aqven.server.resources import (
    FileDetail,
    FileEntry,
    FileKind,
    FileRef,
    IndexState,
    ParseStatus,
    ProjectInfo,
    SyncState,
)
from aqven.server.views.common import diagnostics_by_file, problem_counts
from aqven.server.workspace import FileStat, WorkspaceState
from aqven.spec import TEXT_SUFFIX, SpecKind

SUFFIX_KINDS: Final[Mapping[str, FileKind]] = {TEXT_SUFFIX: "prompt", ".py": "code"}
PATH_KINDS: Final[Mapping[str, FileKind]] = {LOCK_FILE: "lock"}
SPEC_FILE_KINDS: Final[Mapping[SpecKind, FileKind]] = {
    SpecKind.PROJECT: "Project",
    SpecKind.TYPE: "Type",
    SpecKind.FLOW: "Flow",
    SpecKind.NODE: "Node",
    SpecKind.DATASET: "Dataset",
    SpecKind.EXPERIMENT: "Experiment",
    SpecKind.INFERENCE: "Inference",
    SpecKind.AGENT: "Agent",
    SpecKind.TOOL: "Tool",
    SpecKind.MCP_SERVER: "McpServer",
    SpecKind.FINDING: "Finding",
}


def _paths[T](kind: SpecKind, sources: Iterable[SourceSpec[T] | None]) -> Iterator[tuple[str, SpecKind]]:
    return ((source.path, kind) for source in sources if source is not None)


def spec_paths(project: LoadedProject) -> Iterator[tuple[str, SpecKind]]:
    yield from _paths(SpecKind.PROJECT, (project.project,))
    yield from _paths(SpecKind.TYPE, project.types.values())
    yield from _paths(SpecKind.AGENT, project.agents.values())
    yield from _paths(SpecKind.TOOL, project.tools.values())
    yield from _paths(SpecKind.MCP_SERVER, project.mcp_servers.values())
    yield from _paths(SpecKind.DATASET, project.datasets.values())
    yield from _paths(SpecKind.EXPERIMENT, (experiment.source for experiment in project.experiments.values()))
    yield from _paths(
        SpecKind.FINDING, (item for experiment in project.experiments.values() for item in experiment.findings.values())
    )
    yield from _paths(SpecKind.INFERENCE, (inference.source for inference in project.inferences.values()))
    experiments = tuple(project.experiments.values())
    flows = (*project.flows.values(), *(flow for item in experiments for flow in item.flows.values()))
    alternatives = (source for item in experiments for source in item.alternatives.values())
    yield from _paths(SpecKind.FLOW, (flow.source for flow in flows))
    yield from _paths(SpecKind.NODE, (*(node for flow in flows for node in flow.nodes.values()), *alternatives))


def declared_kinds(project: LoadedProject | None) -> Mapping[str, FileKind]:
    if project is None:
        return {}
    return {path: SPEC_FILE_KINDS[kind] for path, kind in spec_paths(project)}


def file_kind(path: str, declared: Mapping[str, FileKind]) -> FileKind:
    known = declared.get(path) or PATH_KINDS.get(path)
    if known is not None:
        return known
    expected = expected_kind(path)
    if expected is not None:
        return SPEC_FILE_KINDS[expected]
    return SUFFIX_KINDS.get(PurePosixPath(path).suffix, "other")


def parse_status(path: str, invalid: frozenset[str]) -> ParseStatus:
    return "invalid" if path in invalid else "ok"


def sync_state(path: str, invalid: frozenset[str]) -> SyncState:
    return "quarantined" if path in invalid else "ok"


def invalid_paths(state: WorkspaceState) -> frozenset[str]:
    project = state.report.project
    return frozenset() if project is None else project.invalid_paths


@dataclass(frozen=True, slots=True)
class FileQuery:
    prefix: str | None = None
    kind: FileKind | None = None
    sync: SyncState | None = None

    def matches(self, stat: FileStat, declared: Mapping[str, FileKind], invalid: frozenset[str]) -> bool:
        if self.prefix is not None and not stat.path.startswith(self.prefix):
            return False
        if self.kind is not None and file_kind(stat.path, declared) != self.kind:
            return False
        return self.sync is None or sync_state(stat.path, invalid) == self.sync


def stat_path(stat: FileStat) -> str:
    return stat.path


def listed_files(state: WorkspaceState, query: FileQuery) -> tuple[FileStat, ...]:
    declared = declared_kinds(state.report.project)
    invalid = invalid_paths(state)
    stats = sorted(state.snapshot.files.values(), key=stat_path)
    return tuple(stat for stat in stats if query.matches(stat, declared, invalid))


def listed_file(state: WorkspaceState, path: str) -> FileStat:
    stat = state.snapshot.get(path)
    if stat is None:
        raise not_found(f"file {path} is not in the project")
    return stat


def file_entry(
    stat: FileStat,
    digest: str,
    declared: Mapping[str, FileKind],
    invalid: frozenset[str],
    problems: Mapping[str, tuple[Diagnostic, ...]],
) -> FileEntry:
    return FileEntry(
        path=stat.path,
        kind=file_kind(stat.path, declared),
        file_hash=digest,
        size_bytes=stat.size_bytes,
        mtime_ns=stat.mtime_ns,
        parse_status=parse_status(stat.path, invalid),
        sync_state=sync_state(stat.path, invalid),
        problems_count=len(problems.get(stat.path, ())),
        last_good_content_hash=None,
    )


def file_entries(state: WorkspaceState, stats: Iterable[FileStat], digests: Mapping[str, str]) -> tuple[FileEntry, ...]:
    declared = declared_kinds(state.report.project)
    invalid = invalid_paths(state)
    problems = diagnostics_by_file(state)
    hashed = ((stat, digests.get(stat.path)) for stat in stats)
    return tuple(file_entry(stat, digest, declared, invalid, problems) for stat, digest in hashed if digest is not None)


def file_detail(state: WorkspaceState, stat: FileStat, digest: str) -> FileDetail:
    problems = diagnostics_by_file(state)
    entry = file_entry(stat, digest, declared_kinds(state.report.project), invalid_paths(state), problems)
    return FileDetail(**entry.model_dump(), problems=problems.get(stat.path, ()))


def file_ref(state: WorkspaceState, path: str) -> FileRef | None:
    stat = state.snapshot.get(path)
    if stat is None or stat.file_hash is None:
        return None
    return FileRef(path=path, file_hash=stat.file_hash)


def project_info(state: WorkspaceState, engine_version: str, spec_seq: int, mcp_url: str | None) -> ProjectInfo:
    project = state.report.project
    invalid = invalid_paths(state)
    has_errors = any(item.severity is Severity.ERROR for item in state.report.diagnostics)
    return ProjectInfo(
        root=str(state.root),
        package=None if project is None else project.project.spec.package,
        engine_version=engine_version,
        tree_hash=state.snapshot.tree_hash,
        project_file=file_ref(state, PROJECT_FILE),
        lock_file=file_ref(state, LOCK_FILE),
        index=IndexState(
            status="degraded" if has_errors else "ready",
            generation=state.generation,
            indexed_at=state.indexed_at,
            pending_files=0,
        ),
        problems=problem_counts(state.report.diagnostics),
        quarantined_files=tuple(sorted(invalid)),
        spec_seq=spec_seq,
        mcp_url=mcp_url,
    )
