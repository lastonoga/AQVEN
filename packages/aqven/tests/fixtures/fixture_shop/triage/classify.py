from aqven.policies import EvalContext, NoParams, Verdict
from fixture_shop.types import ClassifyIn, ClassifyOut


def rationale_is_short(value: ClassifyOut, context: EvalContext[ClassifyIn, ClassifyOut], params: NoParams) -> Verdict:
    return Verdict(passed=len(value.rationale) < len(context.inputs.ticket.body) + 100)
