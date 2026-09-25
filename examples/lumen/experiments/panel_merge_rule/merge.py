from collections import Counter
from collections.abc import Sequence
from statistics import median

from lumen.types import CriterionScore, JudgeVerdict, ReplyCriterion

type CriterionScores = dict[ReplyCriterion, list[int]]


def majority(verdicts: Sequence[JudgeVerdict]) -> tuple[int, list[JudgeVerdict]]:
    best_index, _ = Counter(verdict.best_index for verdict in verdicts).most_common(1)[0]
    return best_index, [verdict for verdict in verdicts if verdict.best_index == best_index]


def criterion_scores(verdicts: Sequence[JudgeVerdict]) -> CriterionScores:
    scores = [item for verdict in verdicts for item in verdict.scores]
    return {item.criterion: [other.score for other in scores if other.criterion == item.criterion] for item in scores}


def score_spread(criteria: CriterionScores) -> int:
    return max((max(values) - min(values) for values in criteria.values()), default=0)


def merged_verdict(verdicts: Sequence[JudgeVerdict], best_index: int, criteria: CriterionScores) -> JudgeVerdict:
    return JudgeVerdict(
        rationale=verdicts[0].rationale,
        scores=[CriterionScore(criterion=key, score=round(median(values))) for key, values in criteria.items()],
        best_index=best_index,
    )
