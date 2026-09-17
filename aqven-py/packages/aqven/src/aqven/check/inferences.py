from collections.abc import Iterable, Iterator
from typing import Final

from pydantic import JsonValue, TypeAdapter, ValidationError

from aqven.check.bindings import compatible
from aqven.check.context import CheckContext
from aqven.check.scopes import InferenceScope, Resolved, Side, Unresolved
from aqven.check.shapes import Missing, NotList, Opaque, enum_values, is_optional, max_items, step_element, unwrap
from aqven.check.typeinfo import fields_contained_types
from aqven.diagnostics import Diagnostic, DiagnosticCode, diagnostic
from aqven.loader import VARIANTS_FOLDER, LoadedInference, SourceSpec, YamlPath, variant_candidates
from aqven.spec import (
    AllowedSetSpec,
    ExampleSpec,
    IdType,
    InferenceSpec,
    RefRoot,
    RefSyntaxError,
    TypeId,
    VariantSlot,
    parse_ref,
)

DYNAMIC_ALLOWED_SET: Final = "dynamic"
MEDIA_KEY: Final = "$media"
IN_PREFIX: Final = "$in."


def check_inferences(context: CheckContext) -> Iterable[Diagnostic]:
    return tuple(
        item
        for loaded in context.project.inferences.values()
        if loaded.source is not None
        for item in _inference(context, loaded, loaded.source)
    )


def variant_file(context: CheckContext, loaded: LoadedInference, slot: str, variant: str) -> str | None:
    candidates = variant_candidates(loaded.stem, slot, variant)
    return next((path for path in candidates if path in context.project.texts), None)


def variant_refs(slot: str, spec: VariantSlot) -> Iterator[tuple[YamlPath, str]]:
    path: YamlPath = (VARIANTS_FOLDER, slot)
    yield from (((*path, "cases", value), variant) for value, variant in spec.cases.items())
    yield from (((*path, "default"), variant) for variant in (spec.default,) if variant is not None)


def _inference(
    context: CheckContext, loaded: LoadedInference, source: SourceSpec[InferenceSpec]
) -> Iterator[Diagnostic]:
    scope = InferenceScope(loaded.inference_id)
    spec = source.spec
    for index, example in enumerate(spec.examples or ()):
        yield from _example(context, scope, source, index, example)
    for index, allowed in enumerate(spec.allowed_sets or ()):
        yield from _allowed_set(context, scope, source, ("allowed_sets", index), allowed)
    for name, slot in (spec.variants or {}).items():
        yield from _variant_slot(context, loaded, source.path, name, slot)


def _variant_slot(
    context: CheckContext, loaded: LoadedInference, file: str, name: str, slot: VariantSlot
) -> Iterator[Diagnostic]:
    for path, variant in variant_refs(name, slot):
        if variant_file(context, loaded, name, variant) is not None:
            continue
        expected = " or ".join(variant_candidates(loaded.stem, name, variant)) or variant
        message = f"variant {variant} does not exist: expected {expected}"
        yield diagnostic(DiagnosticCode.E_VARIANT_MISSING, file, path, message)
    text = slot.on if slot.on.startswith("$") else f"{IN_PREFIX}{slot.on}"
    resolution = context.refs.resolve_inference(InferenceScope(loaded.inference_id), text)
    path: YamlPath = (VARIANTS_FOLDER, name, "on")
    if isinstance(resolution, Unresolved):
        yield diagnostic(resolution.code, file, path, resolution.message)
        return
    if _root(text) is not RefRoot.IN:
        yield diagnostic(
            DiagnosticCode.E_REF_SCOPE, file, path, f"on {slot.on}: a slot is selected by an inference input"
        )
        return
    if resolution.annotation is not None:
        yield from _variant_cases(file, name, slot, resolution.annotation)


def _variant_cases(file: str, name: str, slot: VariantSlot, annotation: object) -> Iterator[Diagnostic]:
    values = enum_values(annotation)
    if values is None and unwrap(annotation).core is not str:
        message = f"slot {name}: on {slot.on} must be an enum or Text, a variant is selected by value equality"
        yield diagnostic(DiagnosticCode.E_SWITCH_ON_TYPE, file, (VARIANTS_FOLDER, name, "on"), message)
        return
    for value in (value for value in slot.cases if values is not None and value not in values):
        message = f"slot {name}: value {value} is not among {', '.join(values or ())}"
        yield diagnostic(
            DiagnosticCode.E_VARIANT_NOT_EXHAUSTIVE, file, (VARIANTS_FOLDER, name, "cases", value), message
        )
    missing = [value for value in values or () if value not in slot.cases]
    if slot.default is not None or (values is not None and not missing and not is_optional(annotation)):
        return
    uncovered = ", ".join(missing) if missing else "values outside the enum or null"
    message = f"slot {name}: cases do not cover {uncovered} and default is not set"
    yield diagnostic(DiagnosticCode.E_VARIANT_NOT_EXHAUSTIVE, file, (VARIANTS_FOLDER, name), message)


def _example(
    context: CheckContext, scope: InferenceScope, source: SourceSpec[InferenceSpec], index: int, example: ExampleSpec
) -> Iterator[Diagnostic]:
    sides: tuple[tuple[Side, dict[str, JsonValue]], ...] = (("in", example.in_), ("out", example.out))
    for side, values in sides:
        path: YamlPath = ("examples", index, side)
        if _has_media(values):
            message = f"example {example.name}: media values are not allowed in examples"
            yield diagnostic(DiagnosticCode.E_EXAMPLE_INVALID, source.path, path, message)
            continue
        record = context.refs.inference_record(scope.inference_id, side)
        yield from _example_values(record, source.path, path, example, values)


def _has_media(value: JsonValue) -> bool:
    match value:
        case dict():
            return MEDIA_KEY in value or any(_has_media(item) for item in value.values())
        case list():
            return any(_has_media(item) for item in value)
        case _:
            return False


def _example_values(
    record: object | None, file: str, path: YamlPath, example: ExampleSpec, values: dict[str, JsonValue]
) -> Iterator[Diagnostic]:
    if record is None:
        return
    try:
        TypeAdapter[object](record).validate_python(values)
    except ValidationError as error:
        first = error.errors()[0]
        location = ".".join(str(part) for part in first["loc"])
        message = f"example {example.name}: value does not pass the model: {location}: {first['msg']}"
        yield diagnostic(DiagnosticCode.E_EXAMPLE_INVALID, file, path, message)


def _allowed_set(
    context: CheckContext,
    scope: InferenceScope,
    source: SourceSpec[InferenceSpec],
    path: YamlPath,
    allowed: AllowedSetSpec,
) -> Iterator[Diagnostic]:
    declared = context.project.types.get(allowed.type)
    if declared is None or not isinstance(declared.spec, IdType) or declared.spec.allowed_set != DYNAMIC_ALLOWED_SET:
        message = f"allowed_sets.type {allowed.type} must be an id type with allowed_set: dynamic"
        yield diagnostic(DiagnosticCode.E_ALLOWED_SET_TYPE, source.path, (*path, "type"), message)
        return
    types = {type_id: item.spec for type_id, item in context.project.types.items()}
    if TypeId(allowed.type) not in fields_contained_types(source.spec.out, types):
        message = f"allowed_sets.type {allowed.type} does not occur in the inference out: the set constrains nothing"
        yield diagnostic(DiagnosticCode.E_ALLOWED_SET_TYPE, source.path, (*path, "type"), message)
    target = context.refs.type_annotation(allowed.type)
    values = _in_path(context, scope, allowed.from_)
    if values is None or not _values_of(context, values.annotation, target):
        message = f"allowed_sets.from {allowed.from_} must be a $in path to a list of {allowed.type} values"
        yield diagnostic(DiagnosticCode.E_ALLOWED_SET_TYPE, source.path, (*path, "from"), message)
    if allowed.labels_from is None:
        return
    labels = _in_path(context, scope, allowed.labels_from)
    if labels is not None and _labels_fit(labels.annotation, values):
        return
    message = f"labels_from {allowed.labels_from} must be a $in path to a Text list of the same length as from"
    yield diagnostic(DiagnosticCode.E_ALLOWED_SET_TYPE, source.path, (*path, "labels_from"), message)


def _in_path(context: CheckContext, scope: InferenceScope, text: str) -> Resolved | None:
    resolution = context.refs.resolve_inference(scope, text)
    if _root(text) is not RefRoot.IN or isinstance(resolution, Unresolved):
        return None
    return resolution


def _values_of(context: CheckContext, annotation: object | None, target: object | None) -> bool:
    if annotation is None or target is None:
        return True
    element = step_element(annotation)
    return not isinstance(element, Missing | Opaque | NotList) and compatible(context, target, element) is not False


def _labels_fit(annotation: object | None, values: Resolved | None) -> bool:
    if annotation is None:
        return True
    element = step_element(annotation)
    texts = not isinstance(element, Missing | Opaque | NotList) and unwrap(element).core is str
    unknown = values is None or values.annotation is None
    return texts and (unknown or max_items(annotation) == max_items(values.annotation if values else None))


def _root(text: str) -> RefRoot | None:
    try:
        return parse_ref(text).root
    except RefSyntaxError:
        return None
