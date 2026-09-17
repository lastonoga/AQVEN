from typing import Annotated

from layout_shop.types import Note
from pydantic import StringConstraints


def clean(text: Annotated[str, StringConstraints(max_length=200)]) -> Note:
    return Note(text=" ".join(text.split()))
