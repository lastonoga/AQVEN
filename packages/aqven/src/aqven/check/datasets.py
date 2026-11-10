from collections.abc import Iterable, Iterator, Mapping, Sequence
from dataclasses import dataclass
from typing import Final

from pydantic import JsonValue, TypeAdapter, ValidationError
from pydantic_core import ErrorDetails
from rfc8785 import CanonicalizationError

from aqven.check.context import CheckContext
from aqven.check.dataset_media import dataset_media
from aqven.check.registry import known
from aqven.check.subjects import flow_spec
from aqven.datasets import (
    MediaFileError,
    locate_media_file,
    media_file_path,
    parse_media_file_ref,
    with_media_placeholders,
)
from aqven.diagnostics import Diagnostic, DiagnosticCode, diagnostic, templated_diagnostic
from aqven.ir.hashing import HashDomain, IrHash, hash_of
from aqven.loader import SourceSpec, YamlPath
from aqven.spec import MEDIA_FILE_KEY, MEDIA_KEY, DatasetFile, DatasetId, MediaValue, SeriesSplit

MISSING_ERROR: Final = "missing"
STRICT: Final[frozenset[str]] = frozenset()
PARTIAL: Final = frozenset({MISSING_ERROR})


@dataclass(frozen=True, slots=True)
class CaseModel:
    type_ref: str
    adapter: TypeAdapter[object]
    tolerated: frozenset[str]


def check_datasets(context: CheckContext) -> Iterable[Diagnostic]:
    found = tuple(
        item
        for dataset_id, source in context.project.datasets.items()
        for item in _dataset(context, dataset_id, source)
    )
    return (*found, *_input_reuse(context))


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


@dataclass(frozen=True, slots=True)
class ReuseCase:
    dataset_id: DatasetId
    case_name: str
    index: int
    source: SourceSpec[DatasetFile]
    split: SeriesSplit


def _input_reuse(context: CheckContext) -> Iterator[Diagnostic]:
    from aqven.series.split import HOLDOUT_SHARE, split_of, split_salt

    salt = split_salt(context.spec.package)
    groups: dict[IrHash, list[ReuseCase]] = {}
    for dataset_id, source in context.project.datasets.items():
        for index, case in enumerate(source.spec.cases):
            fingerprint = _fingerprint(context, source, case.inputs)
            if fingerprint is None:
                continue
            split = split_of(salt, dataset_id, case.name, HOLDOUT_SHARE)
            groups.setdefault(fingerprint, []).append(ReuseCase(dataset_id, case.name, index, source, split))
    for fingerprint in sorted(groups):
        cases = groups[fingerprint]
        identities = {(item.dataset_id, item.case_name) for item in cases}
        if len(identities) < 2 or {item.split for item in cases} != {SeriesSplit.DEV, SeriesSplit.HOLDOUT}:
            continue
        occurrences = sorted(
            {(item.dataset_id, item.case_name, item.split) for item in cases},
            key=lambda item: (item[0], item[1]),
        )
        listed = ", ".join(f"`{dataset_id}/{name}` ({split.value})" for dataset_id, name, split in occurrences)
        holdout = min(
            (item for item in cases if item.split is SeriesSplit.HOLDOUT),
            key=lambda item: (item.dataset_id, item.case_name, item.source.path, item.index),
        )
        message = (
            f"The same input occurs as {listed}; tuning and held-out evaluation can receive the same stimulus. "
            "Consolidate the duplicate identity or review the intentional overlap."
        )
        yield diagnostic(
            DiagnosticCode.W_DATASET_INPUT_REUSED,
            holdout.source.path,
            ("cases", holdout.index, "inputs"),
            message,
            hint=(
                "consolidate the duplicate identity or review the intentional overlap; "
                "renaming a case only rerolls the split"
            ),
        )


def _fingerprint(context: CheckContext, source: SourceSpec[DatasetFile], inputs: JsonValue) -> IrHash | None:
    try:
        normalized = _normalized(context, source.path, inputs)
        return hash_of(HashDomain.DATASET_INPUT, normalized)
    except (MediaFileError, ValidationError, OSError, CanonicalizationError):
        return None


def _normalized(context: CheckContext, dataset_path: str, value: JsonValue) -> JsonValue:
    if isinstance(value, dict) and MEDIA_KEY in value:
        if MEDIA_FILE_KEY in value:
            reference = parse_media_file_ref(value)
            locate_media_file(context.project.root, reference.file, dataset_path)
            return {
                "media_type": reference.media_type,
                "path": media_file_path(reference.file, dataset_path),
            }
        media = MediaValue.model_validate({"name": None, **value})
        return {"media_type": media.media_type, "blob_id": media.blob_id}
    if isinstance(value, dict):
        return {key: _normalized(context, dataset_path, item) for key, item in value.items()}
    if isinstance(value, list):
        return [_normalized(context, dataset_path, item) for item in value]
    return value
