from collections import Counter
from typing import Annotated

from pydantic import BaseModel, Field

from aqven.policies import POLICY_CONFIG, Done, Fail, JoinDecision, JoinState, Wait
from lumen.types import JudgeVerdict


class AgreementParams(BaseModel):
    model_config = POLICY_CONFIG

    min_agree: Annotated[int, Field(ge=2, le=3)]


def agreeing_verdicts(state: JoinState[JudgeVerdict], params: AgreementParams) -> JoinDecision[JudgeVerdict]:
    votes = Counter(verdict.best_index for verdict in state.values)
    if max(votes.values(), default=0) >= params.min_agree:
        return Done(state.values)
    if state.pending:
        return Wait()
    if len(state.values) < params.min_agree:
        return Fail(f"judges that answered: {len(state.values)}, but the decision needs {params.min_agree}")
    return Done(state.values)
