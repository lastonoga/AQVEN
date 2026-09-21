from typing import Annotated

from layout_shop.types import Note
from pydantic import StringConstraints

from aqven.runtime import ToolContext


async def stamp(ctx: ToolContext, text: Annotated[str, StringConstraints(max_length=200)]) -> Note:
    return Note(text=f"{ctx.run_id}: {text}"[:200])
