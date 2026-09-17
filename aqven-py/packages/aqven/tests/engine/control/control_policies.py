from collections import Counter
from typing import Annotated

from pydantic import BaseModel, Field

from aqven.policies import (
    POLICY_CONFIG,
    Continue,
    Default,
    Done,
    Fail,
    ItemDecision,
    JoinDecision,
    JoinState,
    LoopState,
    NoParams,
    RefPath,
    Skip,
    Stop,
    StopDecision,
    Wait,
)
from aqven.spec import MapItemError


class Verdict(BaseModel):
    model_config = POLICY_CONFIG

    best_index: int
    rationale: str


class Ballot(BaseModel):
    model_config = POLICY_CONFIG

    perspective: str


class Vote(BaseModel):
    model_config = POLICY_CONFIG

    intent: str
    confidence: float


class AgreementParams(BaseModel):
    model_config = POLICY_CONFIG

    min_agree: Annotated[int, Field(ge=2, le=3)]


class EmptyListParams(BaseModel):
    model_config = POLICY_CONFIG

    path: RefPath


class AbstainParams(BaseModel):
    model_config = POLICY_CONFIG

    intent: str


SEEN_TYPES: list[str] = []


def agreeing_verdicts(state: JoinState[Verdict], params: AgreementParams) -> JoinDecision[Verdict]:
    SEEN_TYPES.extend(type(verdict).__name__ for verdict in state.values)
    votes = Counter(verdict.best_index for verdict in state.values)
    if max(votes.values(), default=0) >= params.min_agree:
        return Done(state.values)
    if state.pending:
        return Wait()
    return Fail(f"fewer judges agree than {params.min_agree}")


def never_decides(state: JoinState[Verdict], params: NoParams) -> JoinDecision[Verdict]:
    return Wait()


def explodes(state: JoinState[Verdict], params: NoParams) -> JoinDecision[Verdict]:
    raise RuntimeError("policy broke")


def no_issues(state: LoopState, params: EmptyListParams) -> StopDecision:
    found = state.read(params.path)
    return Stop(f"{params.path} is empty") if isinstance(found, list) and not found else Continue()


def abstain(item: Ballot, error: MapItemError, params: AbstainParams) -> ItemDecision[Vote]:
    SEEN_TYPES.append(type(item).__name__)
    if error.code == "fatal":
        return Fail(error.message)
    return Default(Vote(intent=f"{params.intent}:{item.perspective}", confidence=0.0))


def skip_everything(item: Ballot, error: MapItemError, params: NoParams) -> ItemDecision[Vote]:
    return Skip()


def out_of_range(state: LoopState, params: NoParams) -> int:
    return len(state.iterations) + 5


def one_argument(state: LoopState) -> int:
    return 0


def plain_params(state: LoopState, params: dict[str, str]) -> int:
    return 0


NOT_A_FUNCTION = 42
