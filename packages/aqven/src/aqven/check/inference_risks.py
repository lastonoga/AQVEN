from collections.abc import Iterable, Iterator, Mapping
from dataclasses import dataclass

from aqven.check.bindings import compatible
from aqven.check.context import CheckContext
from aqven.check.scopes import InferenceScope, Resolved
from aqven.check.shapes import Missing, NotList, Opaque, step_element
from aqven.check.value_paths import Side, ValuePath, walk_inference
from aqven.diagnostics import Diagnostic, DiagnosticCode, diagnostic
from aqven.loader import SourceSpec
from aqven.spec import MEDIA_TYPES, IdType, InferenceId, InferenceSpec, TypeId, TypeSpec

ALLOWED_SET_HINT = (
    "for an allowed set, mark the IdType allowed_set: dynamic and declare allowed_sets.from with one compatible "
    "$in list; deterministic pass-through/generation or a reviewed custom guard are alternatives"
)

type Types = Mapping[TypeId, TypeSpec]


def check_inference_risks(context: CheckContext) -> Iterable[Diagnostic]:
    types = {type_id: source.spec for type_id, source in context.project.types.items()}
    return tuple(
        item
        for loaded in context.project.inferences.values()
        if loaded.source is not None
        for item in _inference(context, loaded.inference_id, loaded.source, types)
    )


def _inference(
    context: CheckContext,
    inference_id: InferenceId,
    source: SourceSpec[InferenceSpec],
    types: Types,
) -> tuple[Diagnostic, ...]:
    paths = walk_inference(types, source.spec)
    return (
        *_allowed_sets(context, inference_id, source, types, paths),
        *_coverage(source, types, paths),
        *_capacity(source, types, paths),
        *_nested_media(source, paths),
    )


def _allowed_sets(
    context: CheckContext,
    inference_id: InferenceId,
    source: SourceSpec[InferenceSpec],
    types: Types,
    paths: tuple[ValuePath, ...],
) -> Iterator[Diagnostic]:
    declared = {allowed.type for allowed in source.spec.allowed_sets or ()}
    output_types = {
        item.type_id
        for item in paths
        if item.side == "out" and isinstance(types.get(item.type_id), IdType)
    }
    for type_id in sorted(output_types - declared):
        occurrence = next(item for item in paths if item.side == "out" and item.type_id == type_id)
        candidates = _candidates(context, inference_id, type_id, paths)
        if candidates:
            message = (
                f"Output uses `{type_id}` without an allowed set. Matching input candidates exist at "
                f"{', '.join(f'`{path}`' for path in candidates)}; if the model selects input entities, "
                "constrain the output or attach IDs deterministically."
            )
        else:
            message = (
                f"Output uses `{type_id}` without an allowed set or a matching input list. "
                "If the model selects existing entities, provide a candidate set; if this is a new identifier, "
                "generate it in code rather than asking the model to invent it."
            )
        yield diagnostic(
            DiagnosticCode.W_ID_ALLOWED_SET_MISSING,
            source.path,
            occurrence.type_anchor,
            message,
            hint=ALLOWED_SET_HINT,
        )


def _candidates(
    context: CheckContext,
    inference_id: InferenceId,
    type_id: TypeId,
    paths: tuple[ValuePath, ...],
) -> tuple[str, ...]:
    target = context.refs.type_annotation(type_id)
    if target is None:
        return ()
    scope = InferenceScope(inference_id)
    found: set[str] = set()
    for item in paths:
        if item.side != "in" or item.type_id != type_id or item.list_count != 1:
            continue
        text = f"$in.{item.path}"
        resolution = context.refs.resolve_inference(scope, text)
        if not isinstance(resolution, Resolved) or resolution.annotation is None:
            continue
        element = step_element(resolution.annotation)
        if not isinstance(element, Missing | Opaque | NotList) and compatible(context, target, element) is not False:
            found.add(item.path)
    return tuple(sorted(found))


@dataclass(frozen=True, slots=True)
class KeyedList:
    path: str
    key: str
    type_id: TypeId
    occurrence: ValuePath


def _coverage(
    source: SourceSpec[InferenceSpec],
    types: Types,
    paths: tuple[ValuePath, ...],
) -> Iterator[Diagnostic]:
    if any(check.run is not None for check in source.spec.checks or ()):
        return
    for input_list, output_list in _pairs(types, paths):
        input_noun = _entry_noun(input_list)
        if _unique_items(source, output_list):
            output_noun = _entry_noun(output_list)
            message = (
                f"Input `{input_list.path}` and output `{output_list.path}` share key type `{input_list.type_id}`. "
                "Duplicates are checked, but exact coverage is not; if every input "
                f"{input_noun} must produce a {output_noun}, add a coverage check."
            )
        else:
            message = (
                f"Input `{input_list.path}` and output `{output_list.path}` share key type `{input_list.type_id}`, "
                "but exact coverage and duplicate protection are not statically guarded. If each input "
                f"{input_noun} must be represented in the output, "
                "add coverage and uniqueness checks appropriate to the contract."
            )
        yield diagnostic(
            DiagnosticCode.W_ID_COVERAGE_UNCHECKED,
            source.path,
            output_list.occurrence.type_anchor,
            message,
            hint=(
                "declare whether the contract needs exact one-to-one coverage, subset coverage or uniqueness only; "
                "allowed_sets proves membership, not coverage"
            ),
        )


def _pairs(types: Types, paths: tuple[ValuePath, ...]) -> Iterator[tuple[KeyedList, KeyedList]]:
    inputs = _keyed(types, paths, "in")
    outputs = _keyed(types, paths, "out")
    seen: set[tuple[str, str, TypeId]] = set()
    for input_list in inputs:
        for output_list in outputs:
            identity = (input_list.path, output_list.path, input_list.type_id)
            if (
                input_list.key == output_list.key
                and input_list.type_id == output_list.type_id
                and identity not in seen
            ):
                seen.add(identity)
                yield input_list, output_list


def _keyed(types: Types, paths: tuple[ValuePath, ...], side: Side) -> tuple[KeyedList, ...]:
    found: list[KeyedList] = []
    for item in paths:
        if (
            item.side == side
            and item.key_name is not None
            and item.list_path is not None
            and item.key_required
            and isinstance(types.get(item.type_id), IdType)
            and (side == "in" or (item.required and item.container_required))
        ):
            found.append(KeyedList(item.list_path, item.key_name, item.type_id, item))
    return tuple(sorted(found, key=lambda item: (item.path, item.key, item.type_id)))


def _unique_items(source: SourceSpec[InferenceSpec], output: KeyedList) -> bool:
    field = f"$out.{output.path.removesuffix('[*]')}"
    return any(
        check.use == "unique_items"
        and check.with_ is not None
        and check.with_.get("field") == field
        and check.with_.get("key") == output.key
        for check in source.spec.checks or ()
    )


def _entry_noun(item: KeyedList) -> str:
    name = item.path.removesuffix("[*]").rsplit(".", maxsplit=1)[-1]
    return name.removesuffix("s")


def _capacity(
    source: SourceSpec[InferenceSpec],
    types: Types,
    paths: tuple[ValuePath, ...],
) -> Iterator[Diagnostic]:
    for input_list, output_list in _pairs(types, paths):
        input_capacity = input_list.occurrence.capacity
        output_capacity = output_list.occurrence.capacity
        if (
            input_capacity is None
            or output_capacity is None
            or input_capacity <= 0
            or output_capacity >= input_capacity
        ):
            continue
        factors = input_list.occurrence.capacity_factors
        assert factors is not None
        message = (
            f"Input `{input_list.path}` can contain {input_capacity} `{input_list.type_id}`-keyed entries "
            f"({'×'.join(str(factor) for factor in factors)}), but output `{output_list.path}` has capacity "
            f"{output_capacity}. If every input entry requires its own output record, coverage is impossible "
            "for schema-allowed inputs."
        )
        yield diagnostic(
            DiagnosticCode.W_ID_COVERAGE_CAP,
            source.path,
            output_list.occurrence.capacity_anchor,
            message,
            hint=(
                "raise or rebalance the output caps, narrow the declared input, "
                "or review the intentional subset/truncation contract"
            ),
        )


def _nested_media(
    source: SourceSpec[InferenceSpec],
    paths: tuple[ValuePath, ...],
) -> Iterator[Diagnostic]:
    for index, decl in enumerate(source.spec.in_):
        found = sorted(
            {
                f"{item.path}: {item.type_id}"
                for item in paths
                if item.side == "in" and item.index == index and item.nested and item.type_id in MEDIA_TYPES
            }
        )
        if not found:
            continue
        message = (
            f"Input `{decl.name}` contains nested media at {', '.join(f'`{path}`' for path in found)}; "
            "nested media is never attached to the model. Hoist it to a top-level inference input "
            "if the model must read it."
        )
        yield diagnostic(
            DiagnosticCode.W_NESTED_MEDIA_NOT_ATTACHED,
            source.path,
            ("in", index, "type"),
            message,
            hint=(
                "hoist the media to a top-level input, or retain it only as metadata when model access is not intended"
            ),
        )
