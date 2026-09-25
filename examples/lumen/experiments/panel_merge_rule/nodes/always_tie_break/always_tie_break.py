from typing import Annotated

from pydantic import Field

from lumen.experiments.panel_merge_rule.merge import criterion_scores, majority, score_spread
from lumen.types import JudgeVerdict, PanelMergeRuleAlwaysTieBreakOut


def always_tie_break(verdicts: Annotated[list[JudgeVerdict], Field(max_length=3)]) -> PanelMergeRuleAlwaysTieBreakOut:
    _, agreeing = majority(verdicts)
    spread = score_spread(criterion_scores(agreeing))
    return PanelMergeRuleAlwaysTieBreakOut(consensus=verdicts[0], level="split", spread=spread)
