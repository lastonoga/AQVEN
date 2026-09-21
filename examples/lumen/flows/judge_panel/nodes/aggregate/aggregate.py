from collections import Counter
from statistics import median
from typing import Annotated, Final

from pydantic import Field

from lumen.types import CriterionScore, JudgePanelAggregateOut, JudgeVerdict, ReplyCriterion

AGREEMENT_VOTES: Final = 2
AGREEMENT_SPREAD: Final = 2


def aggregate(verdicts: Annotated[list[JudgeVerdict], Field(max_length=3)]) -> JudgePanelAggregateOut:
    best_index, votes = Counter(verdict.best_index for verdict in verdicts).most_common(1)[0]
    majority = [verdict for verdict in verdicts if verdict.best_index == best_index]
    scores = [item for verdict in majority for item in verdict.scores]
    criteria: dict[ReplyCriterion, list[int]] = {
        item.criterion: [other.score for other in scores if other.criterion == item.criterion] for item in scores
    }
    spread = max((max(values) - min(values) for values in criteria.values()), default=0)
    if votes < AGREEMENT_VOTES or spread > AGREEMENT_SPREAD:
        return JudgePanelAggregateOut(consensus=verdicts[0], level="split", spread=spread)
    consensus = JudgeVerdict(
        rationale=majority[0].rationale,
        scores=[CriterionScore(criterion=key, score=round(median(values))) for key, values in criteria.items()],
        best_index=best_index,
    )
    return JudgePanelAggregateOut(consensus=consensus, level="agreed", spread=spread)
