from typing import Annotated, Final

from pydantic import Field

from lumen.experiments.panel_merge_rule.merge import criterion_scores, majority, merged_verdict, score_spread
from lumen.types import JudgeVerdict, PanelMergeRuleMajorityOnlyOut

AGREEMENT_VOTES: Final = 2


def majority_only(verdicts: Annotated[list[JudgeVerdict], Field(max_length=3)]) -> PanelMergeRuleMajorityOnlyOut:
    best_index, agreeing = majority(verdicts)
    criteria = criterion_scores(agreeing)
    spread = score_spread(criteria)
    if len(agreeing) < AGREEMENT_VOTES:
        return PanelMergeRuleMajorityOnlyOut(consensus=verdicts[0], level="split", spread=spread)
    consensus = merged_verdict(agreeing, best_index, criteria)
    return PanelMergeRuleMajorityOnlyOut(consensus=consensus, level="agreed", spread=spread)
