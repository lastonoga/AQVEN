from typing import Final

from dbos import DBOS, SetWorkflowID, WorkflowHandleAsync
from dbos import error as dbos_errors

from aqven.engine.interpreter import run_flow
from aqven.engine.protocol import POLLING_INTERVAL_SECONDS
from aqven.engine.request import RunRecord, RunSpec
from aqven.ir import IrHash
from aqven.runtime.address import JsonObject, RunId
from aqven.runtime.executions import RunError

INTERNAL_CODE: Final = "INTERNAL"


async def start_run_workflow(
    run_id: RunId, ir_hash: IrHash, flow_input: JsonObject, spec: RunSpec
) -> WorkflowHandleAsync[JsonObject]:
    with SetWorkflowID(run_id):
        return await DBOS.start_workflow_async(run_flow, ir_hash, flow_input, spec.model_dump(mode="json"))


async def settled_record(handle: WorkflowHandleAsync[JsonObject]) -> RunRecord:
    try:
        raw = await handle.get_result(polling_interval_sec=POLLING_INTERVAL_SECONDS)
    except dbos_errors.DBOSAwaitedWorkflowCancelledError:
        return RunRecord(status="cancelled")
    except Exception as error:
        return RunRecord(status="failed", error=RunError(code=INTERNAL_CODE, message=str(error), address=None))
    return RunRecord.model_validate(raw)
