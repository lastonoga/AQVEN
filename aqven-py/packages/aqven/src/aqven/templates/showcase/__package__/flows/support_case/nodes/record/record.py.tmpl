from pydantic import BaseModel

from aqven.policies import POLICY_CONFIG, Continue, LoopState, RefPath, Stop, StopDecision


class EmptyListParams(BaseModel):
    model_config = POLICY_CONFIG

    path: RefPath


def no_issues(state: LoopState, params: EmptyListParams) -> StopDecision:
    found = state.read(params.path)
    return Stop(f"{params.path} пуст") if isinstance(found, list) and not found else Continue()
