from dataclasses import dataclass
from typing import Final

from dbos import DBOS

from aqven.engine.runtime import RUNTIME_SLOT

PROBE_WORKFLOW_ID: Final = "aqven-status-probe"


@dataclass(frozen=True, slots=True)
class DbosStatusProbe:
    async def ping(self) -> None:
        RUNTIME_SLOT.require()
        await DBOS.list_workflows_async(workflow_ids=[PROBE_WORKFLOW_ID], load_input=False, load_output=False)
