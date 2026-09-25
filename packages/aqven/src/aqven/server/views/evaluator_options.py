import inspect
from collections.abc import Callable, Mapping
from typing import Final

from pydantic import BaseModel

from aqven.check.code import hints_of
from aqven.policies import BUILTINS, Slot
from aqven.policies.evaluators import EXPECTED_CHECK
from aqven.runtime.address import ResourceModel
from aqven.spec import MetricKind

type EvaluatorFunction = Callable[..., object]

EVALUATOR_TEXTS: Final[Mapping[str, str]] = {
    EXPECTED_CHECK: "The output equals the case expected_output, whole or on the listed fields",
    "not_empty": "A field of the output or the input is not empty",
    "max_words": "A text field has at most max words",
    "language": "A text field is written in the language of a locale field",
    "no_pii": "Text fields carry no e-mails, phone numbers, card numbers, IBANs or IP addresses",
    "regex": "A text field matches a regular expression",
    "unique_items": "The items of a list field differ by key",
    "ids_in_allowed_set": "Every id in a field is in an allowed list",
    "citations_in_sources": "Every quoted citation is found in its source text",
    "cost_usd": "The cost of the attempt in USD, as a score",
    "latency_ms": "The latency of the attempt in milliseconds, as a score",
}
SCORE_EVALUATORS: Final = frozenset({"cost_usd", "latency_ms"})


class EvaluatorParamView(ResourceModel):
    name: str
    required: bool


class EvaluatorOptionView(ResourceModel):
    use: str
    needs_params: bool
    description: str
    kind: MetricKind
    params: tuple[EvaluatorParamView, ...]


def params_model(function: EvaluatorFunction) -> type[BaseModel] | None:
    names = tuple(inspect.signature(function).parameters)
    hints = hints_of(function) or {}
    found = hints.get(names[-1]) if names else None
    if isinstance(found, type) and issubclass(found, BaseModel):
        return found
    return None


def param_views(model: type[BaseModel] | None) -> tuple[EvaluatorParamView, ...]:
    if model is None:
        return ()
    return tuple(
        EvaluatorParamView(name=info.alias or name, required=info.is_required())
        for name, info in model.model_fields.items()
    )


def evaluator_kind(use: str) -> MetricKind:
    return MetricKind.CONTINUOUS if use in SCORE_EVALUATORS else MetricKind.BINARY


def evaluator_option(use: str, function: EvaluatorFunction) -> EvaluatorOptionView:
    params = param_views(params_model(function))
    return EvaluatorOptionView(
        use=use,
        needs_params=any(param.required for param in params),
        description=EVALUATOR_TEXTS.get(use, use),
        kind=evaluator_kind(use),
        params=params,
    )


def evaluator_options() -> tuple[EvaluatorOptionView, ...]:
    builtins = BUILTINS[Slot.EVALUATOR]
    ordered = (EXPECTED_CHECK, *(use for use in builtins if use != EXPECTED_CHECK))
    return tuple(evaluator_option(use, builtins[use]) for use in ordered)
