from pydantic import BaseModel

from aqven.policies import (
    Continue,
    Done,
    JoinDecision,
    JoinState,
    LoopState,
    NoParams,
    RefPath,
    Stop,
    StopDecision,
    Wait,
)
from aqven.spec import GENERATED_CONFIG
from fixture_shop.types import TriageCategory, TriageSummarizeOut, TriageTicket


def summarize(ticket: TriageTicket, category: TriageCategory) -> TriageSummarizeOut:
    return TriageSummarizeOut(summary=f"{category}: {ticket.subject}"[:200])


class PathParams(BaseModel):
    model_config = GENERATED_CONFIG
    path: RefPath


def summary_written(state: LoopState, params: PathParams) -> StopDecision:
    return Stop("краткое содержание готово") if state.iterations else Continue()


def first_summary(state: JoinState[TriageSummarizeOut], params: NoParams) -> JoinDecision[TriageSummarizeOut]:
    return Done(state.values[:1]) if state.values else Wait()
