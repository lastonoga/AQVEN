from collections.abc import Sequence
from dataclasses import dataclass
from itertools import batched
from typing import Final

from dbos import DBOS, WorkflowStatus
from pydantic import ValidationError

from aqven.engine.protocol import RUN_FLOW_WORKFLOW
from aqven.engine.request import RUN_CALL_ARGUMENTS, RunCall, RunSpec
from aqven.engine.summaries.model import ObservedRun, ObservedStatus
from aqven.runtime.address import RunId

OBSERVE_BATCH: Final = 500


def run_call_of(status: WorkflowStatus) -> RunCall | None:
    inputs = status.input
    if inputs is None:
        return None
    try:
        ir_hash, flow_input, spec = RUN_CALL_ARGUMENTS.validate_python(tuple(inputs["args"]))
        return RunCall(ir_hash=ir_hash, flow_input=flow_input, spec=RunSpec.model_validate(spec))
    except ValidationError, KeyError:
        return None


def observed_status(status: WorkflowStatus) -> ObservedStatus:
    return ObservedStatus(
        run_id=RunId(status.workflow_id),
        dbos_status=str(status.status),
        closed_at=status.updated_at or status.created_at or 0,
    )


def observed_run(status: WorkflowStatus) -> ObservedRun:
    return ObservedRun(
        status=observed_status(status),
        created_at=status.created_at or 0,
        forked_from=RunId(status.forked_from) if status.forked_from else None,
        call=run_call_of(status),
    )


@dataclass(frozen=True, slots=True)
class DbosWorkflowCatalog:
    async def run_ids(self) -> tuple[RunId, ...]:
        statuses = await DBOS.list_workflows_async(name=RUN_FLOW_WORKFLOW, load_input=False, load_output=False)
        return tuple(RunId(status.workflow_id) for status in statuses)

    async def observe(self, run_ids: Sequence[RunId], *, with_call: bool) -> tuple[ObservedRun, ...]:
        found: list[ObservedRun] = []
        for chunk in batched(run_ids, OBSERVE_BATCH, strict=False):
            statuses = await DBOS.list_workflows_async(
                name=RUN_FLOW_WORKFLOW, workflow_ids=list(chunk), load_input=with_call, load_output=False
            )
            found.extend(observed_run(status) for status in statuses)
        return tuple(found)
