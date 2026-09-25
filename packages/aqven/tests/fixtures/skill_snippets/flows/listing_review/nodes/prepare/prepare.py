from collections.abc import Mapping
from typing import Annotated, Final

from pydantic import StringConstraints
from skill_snippets.types import Aspect, Category, ListingReviewPrepareOut

ASPECTS: Final[Mapping[Category, list[Aspect]]] = {
    "furniture": ["condition", "completeness"],
    "electronics": ["condition", "completeness", "safety"],
    "clothing": ["condition"],
}


def prepare(title: Annotated[str, StringConstraints(max_length=120)], category: Category) -> ListingReviewPrepareOut:
    return ListingReviewPrepareOut(title=" ".join(title.split()), aspects=ASPECTS[category])
