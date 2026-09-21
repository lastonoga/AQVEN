from typing import Annotated

from pydantic import StringConstraints
from standard_shop.code.text import squash
from standard_shop.types import Note

from aqven.runtime import ToolContext


async def stamp(ctx: ToolContext, text: Annotated[str, StringConstraints(max_length=200)]) -> Note:
    return Note(text=squash(f"{ctx.run_id}: {text}"))
