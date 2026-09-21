from typing import Annotated

from pydantic import StringConstraints
from standard_shop.code.text import squash
from standard_shop.types import Note


def trim(text: Annotated[str, StringConstraints(max_length=200)]) -> Note:
    return Note(text=squash(text))
