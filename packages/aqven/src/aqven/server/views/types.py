from aqven.diagnostics import has_errors
from aqven.loader import EntityKey, EntityKind
from aqven.runtime.runs import Page
from aqven.server.errors import not_found
from aqven.server.resources import TypeDetail, TypeSummary
from aqven.server.views.common import diagnostics_by_file, loaded_project, page_of, ref_schema, type_models
from aqven.server.workspace import WorkspaceState
from aqven.spec import EnumType, TypeId


def usage_count(state: WorkspaceState, type_id: str) -> int:
    index = state.index
    return 0 if index is None else len(index.incoming(EntityKey(EntityKind.TYPE, type_id)))


def type_summaries(state: WorkspaceState, cursor: str | None, limit: int) -> Page[TypeSummary]:
    project = loaded_project(state)
    problems = diagnostics_by_file(state)
    rows = [
        TypeSummary(
            type_id=type_id,
            path=source.path,
            kind=source.spec.type,
            usage_count=usage_count(state, type_id),
            status="invalid" if has_errors(problems.get(source.path, ())) else "ok",
        )
        for type_id, source in sorted(project.types.items())
    ]
    return page_of(rows, lambda row: row.type_id, cursor, limit)


def type_detail(state: WorkspaceState, type_id: str) -> TypeDetail:
    project = loaded_project(state)
    source = project.types.get(TypeId(type_id))
    if source is None:
        raise not_found(f"type {type_id} is not in the project registry")
    spec = source.spec
    return TypeDetail(
        type_id=type_id,
        path=source.path,
        file_hash=source.file_hash,
        spec=spec,
        json_schema=ref_schema(type_models(project), type_id),
        enum_values=tuple(spec.values) if isinstance(spec, EnumType) else (),
    )
