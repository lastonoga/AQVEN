from collections.abc import Iterable, Iterator, Mapping, Sequence
from dataclasses import dataclass
from typing import Final

from pydantic import TypeAdapter, ValidationError
from pydantic_core import ErrorDetails

from aqven.check.context import CheckContext
from aqven.check.dataset_media import dataset_media
from aqven.check.registry import known
from aqven.check.subjects import flow_spec
from aqven.datasets import with_media_placeholders
from aqven.diagnostics import Diagnostic, DiagnosticCode, diagnostic, templated_diagnostic
from aqven.loader import SourceSpec, YamlPath
from aqven.spec import DatasetFile, DatasetId

MISSING_ERROR: Final = "missing"
STRICT: Final[frozenset[str]] = frozenset()
PARTIAL: Final = frozenset({MISSING_ERROR})


@dataclass(frozen=True, slots=True)
class CaseModel:
    type_ref: str
    adapter: TypeAdapter[object]
    tolerated: frozenset[str]


def check_datasets(context: CheckContext) -> Iterable[Diagnostic]:
    return tuple(
        item
        for dataset_id, source in context.project.datasets.items()
        for item in _dataset(context, dataset_id, source)
    )


def selected_cases(dataset: DatasetFile, tags: Mapping[str, str] | None) -> tuple[int, ...]:
    wanted = tuple((tags or {}).items())
    return tuple(
        index
        for index, case in enumerate(dataset.cases)
        if all((case.tags or {}).get(name) == value for name, value in wanted)
    )


def repeated(names: Sequence[str]) -> Iterator[tuple[int, int]]:
    return ((index, names.index(name)) for index, name in enumerate(names) if names.index(name) != index)


def input_model(context: CheckContext, type_ref: str, tolerated: frozenset[str]) -> CaseModel | None:
    annotation = context.refs.type_annotation(type_ref)
    if annotation is None:
        return None
    return CaseModel(type_ref, TypeAdapter[object](annotation), tolerated)


def case_inputs(
    source: SourceSpec[DatasetFile], model: CaseModel | None, indexes: Iterable[int]
) -> Iterator[Diagnostic]:
    if model is None:
        return
    cases = source.spec.cases
    problems = (
        (index, first_problem(model.adapter, with_media_placeholders(cases[index].inputs), model.tolerated))
        for index in indexes
    )
    for index, problem in problems:
        if problem is None:
            continue
        message = f"case {cases[index].name}: inputs do not pass input type {model.type_ref}: {problem}"
        yield diagnostic(DiagnosticCode.E_SPEC_INVALID, source.path, ("cases", index, "inputs"), message)


def first_problem(adapter: TypeAdapter[object], value: object, tolerated: frozenset[str]) -> str | None:
    try:
        adapter.validate_python(value)
    except ValidationError as error:
        problems = [item for item in error.errors() if item["type"] not in tolerated]
        return _problem(problems[0]) if problems else None
    return None


def _problem(item: ErrorDetails) -> str:
    location = ".".join(str(part) for part in item["loc"])
    return f"{location}: {item['msg']}" if location else item["msg"]


def _dataset(context: CheckContext, dataset_id: DatasetId, source: SourceSpec[DatasetFile]) -> Iterator[Diagnostic]:
    yield from _duplicates(dataset_id, source)
    yield from dataset_media(context.project.root, dataset_id, source)
    flow_id = source.spec.flow
    if flow_id is None:
        return
    flow = context.project.flows.get(flow_id)
    if flow is None and not known(context, context.project.flows, flow_id):
        message = f"flow {flow_id} does not exist in the project"
        yield diagnostic(DiagnosticCode.E_FLOW_UNKNOWN, source.path, ("flow",), message)
    spec = flow_spec(flow)
    if spec is None:
        return
    model = input_model(context, spec.input, PARTIAL)
    yield from case_inputs(source, model, range(len(source.spec.cases)))


def _duplicates(dataset_id: DatasetId, source: SourceSpec[DatasetFile]) -> Iterator[Diagnostic]:
    names = [case.name for case in source.spec.cases]
    for index, first in repeated(names):
        values = {"name": names[index], "first": str(first), "dataset": dataset_id}
        path: YamlPath = ("cases", index, "name")
        yield templated_diagnostic(DiagnosticCode.E_CASE_DUPLICATE, source.path, path, values)
