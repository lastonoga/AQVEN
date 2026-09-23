from collections.abc import Callable, Mapping
from typing import Final

from aqven.policies import control, evaluators
from aqven.policies.contracts import (
    POLICY_CONFIG,
    BranchResult,
    Continue,
    Default,
    Done,
    EvalContext,
    Evaluator,
    Fail,
    ItemDecision,
    ItemErrorPolicy,
    JoinDecision,
    JoinPolicy,
    JoinState,
    LoopState,
    NoParams,
    RefPath,
    SelectPolicy,
    Skip,
    Slot,
    Stop,
    StopDecision,
    StopPolicy,
    Verdict,
    Wait,
)

BUILTINS: Final[Mapping[Slot, Mapping[str, Callable[..., object]]]] = {
    Slot.JOIN: {
        "all": control.join_all,
        "any": control.join_any,
        "first_success": control.first_success,
        "quorum": control.quorum,
    },
    Slot.STOP: {"threshold": control.threshold, "stagnation": control.stagnation},
    Slot.SELECT: {"last": control.last, "best": control.best},
    Slot.ITEM_ERROR: {"skip": control.skip, "fail": control.fail, "default": control.default},
    Slot.EVALUATOR: {
        "not_empty": evaluators.not_empty,
        "max_words": evaluators.max_words,
        "language": evaluators.language,
        "no_pii": evaluators.no_pii,
        "regex": evaluators.regex,
        "unique_items": evaluators.unique_items,
        "ids_in_allowed_set": evaluators.ids_in_allowed_set,
        "citations_in_sources": evaluators.citations_in_sources,
        evaluators.EXPECTED_CHECK: evaluators.expected,
        "cost_usd": evaluators.cost_usd,
        "latency_ms": evaluators.latency_ms,
    },
}


def builtin(slot: Slot, policy_id: str) -> Callable[..., object] | None:
    return BUILTINS[slot].get(policy_id)


__all__ = [
    "BUILTINS",
    "POLICY_CONFIG",
    "BranchResult",
    "Continue",
    "Default",
    "Done",
    "EvalContext",
    "Evaluator",
    "Fail",
    "ItemDecision",
    "ItemErrorPolicy",
    "JoinDecision",
    "JoinPolicy",
    "JoinState",
    "LoopState",
    "NoParams",
    "RefPath",
    "SelectPolicy",
    "Skip",
    "Slot",
    "Stop",
    "StopDecision",
    "StopPolicy",
    "Verdict",
    "Wait",
    "builtin",
    "control",
    "evaluators",
]
