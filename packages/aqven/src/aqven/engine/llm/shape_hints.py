from collections.abc import Mapping, Sequence
from typing import Final

from pydantic_core import ErrorDetails

from aqven.engine.llm.failure_context import FailureContext
from aqven.engine.llm.output_shape import shape_summary
from aqven.ir.nodes import OutputMode
from aqven.runtime.executions import OutputShape

PATH_SEPARATOR: Final = "."
LISTED_PATHS: Final = 5
MISSING_TYPE: Final = "missing"

MODE_ALTERNATIVES: Final[Mapping[OutputMode, str]] = {
    "tool": "native or prompted",
    "native": "tool or prompted",
    "prompted": "tool or native",
}
OBJECT_EXPECTED: Final = "expected an object"
LIST_EXPECTED: Final = "expected a list"
VALUE_EXPECTED: Final = "wrong value type"
MIS_SHAPE_REASONS: Final[Mapping[str, str]] = {
    MISSING_TYPE: "missing",
    "model_type": OBJECT_EXPECTED,
    "model_attributes_type": OBJECT_EXPECTED,
    "dict_type": OBJECT_EXPECTED,
    "dataclass_type": OBJECT_EXPECTED,
    "list_type": LIST_EXPECTED,
    "tuple_type": LIST_EXPECTED,
    "set_type": LIST_EXPECTED,
    "frozen_set_type": LIST_EXPECTED,
    "extra_forbidden": "unexpected field, possibly nested at the wrong level",
    "union_tag_invalid": "unknown variant",
    "union_tag_not_found": "variant tag missing",
    "string_type": VALUE_EXPECTED,
    "int_type": VALUE_EXPECTED,
    "float_type": VALUE_EXPECTED,
    "bool_type": VALUE_EXPECTED,
    "none_required": VALUE_EXPECTED,
}


def rejection_hint(context: FailureContext, shape: OutputShape) -> str:
    summary = shape_summary(shape)
    lead = f"{context.output_type} is too complex for the structured output of this model"
    stated = f"{lead}: {summary}" if summary else lead
    first = f"lower those limits or flatten the type in {context.inference_location} and the types it uses"
    return f"{stated}. {_sentence(shape_actions(context, first, retry_note=True))}"


def mis_shape_hint(context: FailureContext, errors: Sequence[ErrorDetails], shape: OutputShape) -> str | None:
    shaped = [error for error in errors if error["type"] in MIS_SHAPE_REASONS]
    if not shaped:
        return None
    listed = ", ".join(_described(error) for error in shaped[:LISTED_PATHS])
    more = len(shaped) - LISTED_PATHS
    tail = f" and {more} more" if more > 0 else ""
    summary = shape_summary(shape)
    measured = f" (the type: {summary})" if summary else ""
    missing = any(error["type"] == MISSING_TYPE for error in shaped)
    optional = ", make the missing fields optional" if missing else ""
    location = context.inference_location
    first = f"tighten the prompt{optional}, lower the limits or flatten the type in {location}{measured}"
    lead = f"the model returned an incomplete or mis-shaped answer at {listed}{tail}"
    return f"{_sentence(lead)}. {_sentence(shape_actions(context, first, retry_note=False))}"


def shape_actions(context: FailureContext, first: str, *, retry_note: bool) -> str:
    agent = context.agent_location
    note = " (a retry to the same model gets the same answer)" if retry_note else ""
    parts = (
        first,
        f"or set output.mode: {MODE_ALTERNATIVES[context.mode]} in {agent} ({context.models_check()} shows which work)",
        f"or add fallback_models from another model family in {agent}{note}",
        f"measure the real limits with {context.models_shapes()}",
    )
    return "; ".join(parts)


def path_text(path: Sequence[int | str]) -> str:
    return PATH_SEPARATOR.join(str(segment) for segment in path) or "output"


def _described(error: ErrorDetails) -> str:
    return f"{path_text(tuple(error['loc']))} ({MIS_SHAPE_REASONS[error['type']]})"


def _sentence(text: str) -> str:
    return text[:1].upper() + text[1:]
