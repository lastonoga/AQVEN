from collections import Counter
from statistics import mean
from typing import Annotated, Final

from pydantic import Field

from lumen.types import CaseIntent, IntentBallot, SupportCaseTallyOut

MIN_BALLOTS: Final = 2
AGREEMENT_CONFIDENCE: Final = 0.6


def tally(ballots: Annotated[list[IntentBallot], Field(max_length=3)]) -> SupportCaseTallyOut:
    if not ballots:
        return SupportCaseTallyOut(intent="question", agreement="split", confidence=0)
    counts: Counter[CaseIntent] = Counter(ballot.intent for ballot in ballots)
    intent, votes = counts.most_common(1)[0]
    confidence = mean(ballot.confidence for ballot in ballots if ballot.intent == intent)
    unanimous = votes == len(ballots) >= MIN_BALLOTS
    if unanimous and confidence >= AGREEMENT_CONFIDENCE:
        return SupportCaseTallyOut(intent=intent, agreement="agreed", confidence=confidence)
    strongest = max(ballots, key=lambda ballot: ballot.confidence)
    return SupportCaseTallyOut(intent=strongest.intent, agreement="split", confidence=strongest.confidence)
