from collections.abc import Iterable, Iterator, Mapping
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


def file_entry(
    stat: FileStat,
    declared: Mapping[str, FileKind],
    invalid: frozenset[str],
    problems: Mapping[str, tuple[Diagnostic, ...]],
) -> FileEntry:
    return FileEntry(
        path=stat.path,
        kind=file_kind(stat.path, declared),
        file_hash=stat.file_hash,
        size_bytes=stat.size_bytes,
        mtime_ns=stat.mtime_ns,
        parse_status=parse_status(stat.path, invalid),
        sync_state=sync_state(stat.path, invalid),
        problems_count=len(problems.get(stat.path, ())),
        last_good_content_hash=None,
    )


def file_entries(state: WorkspaceState) -> tuple[FileEntry, ...]:
    declared = declared_kinds(state.report.project)
    invalid = invalid_paths(state)
    problems = diagnostics_by_file(state)
    stats = sorted(state.snapshot.files.values(), key=lambda stat: stat.path)
    return tuple(file_entry(stat, declared, invalid, problems) for stat in stats)


def file_detail(state: WorkspaceState, path: str) -> FileDetail:
    stat = state.snapshot.get(path)
    if stat is None:
        raise not_found(f"file {path} is not in the project")
    problems = diagnostics_by_file(state)
    entry = file_entry(stat, declared_kinds(state.report.project), invalid_paths(state), problems)
    return FileDetail(**entry.model_dump(), problems=problems.get(path, ()))


def file_ref(state: WorkspaceState, path: str) -> FileRef | None:
    stat = state.snapshot.get(path)
    return None if stat is None else FileRef(path=path, file_hash=stat.file_hash)


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
