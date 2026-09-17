import uuid
from collections.abc import Sequence
from dataclasses import dataclass
from typing import Final

from dbos import DBOS, SetWorkflowID, StepInfo
from pydantic import JsonValue, TypeAdapter, ValidationError

from aqven.engine.addressing import CHILD_WORKFLOW_SEPARATOR
from aqven.engine.protocol import EXECUTOR_PROTOCOL_VERSION, NODE_BOUNDARY_STEP, RUN_BRANCH_WORKFLOW
from aqven.runtime.address import ExecutionAddress, RunId

JOIN_STEPS: Final = frozenset({"DBOS.getResult", "DBOS.waitFirst"})
BOUNDARY_OUTPUT: Final[TypeAdapter[dict[str, JsonValue]]] = TypeAdapter(dict[str, JsonValue])


def root_run_id(workflow_id: str) -> RunId:
    return RunId(workflow_id.partition(CHILD_WORKFLOW_SEPARATOR)[0])


def forked_child_id(forked_parent_id: str, child_workflow_id: str) -> str:
    return f"{forked_parent_id}{CHILD_WORKFLOW_SEPARATOR}{child_workflow_id.rpartition(CHILD_WORKFLOW_SEPARATOR)[2]}"


def boundary_address(output: object) -> JsonValue:
    try:
        return BOUNDARY_OUTPUT.validate_python(output).get("address")
    except ValidationError:
        return None


def boundary_function_id(steps: Sequence[StepInfo], address: ExecutionAddress) -> int | None:
    wanted: JsonValue = address.model_dump(mode="json")
    matches = [
        step["function_id"]
        for step in steps
        if step["function_name"] == NODE_BOUNDARY_STEP and boundary_address(step["output"]) == wanted
    ]
    return min(matches) if matches else None


def branch_starts(steps: Sequence[StepInfo]) -> tuple[StepInfo, ...]:
    return tuple(
        step for step in steps if step["function_name"] == RUN_BRANCH_WORKFLOW and step["child_workflow_id"] is not None
    )


def first_join_after(steps: Sequence[StepInfo], function_id: int) -> int | None:
    joins = [step["function_id"] for step in steps if step["function_name"] in JOIN_STEPS]
    return next((join for join in sorted(joins) if join > function_id), None)


@dataclass(frozen=True, slots=True)
class ForkPoint:
    workflow_id: str
    start_step: int
    child: ForkPoint | None = None


async def locate_fork(workflow_id: str, address: ExecutionAddress) -> ForkPoint | None:
    steps = await DBOS.list_workflow_steps_async(workflow_id)
    start = boundary_function_id(steps, address)
    if start is not None:
        return ForkPoint(workflow_id, start)
    for step in branch_starts(steps):
        nested = await locate_branch_fork(workflow_id, steps, step, address)
        if nested is not None:
            return nested
    return None


async def locate_branch_fork(
    workflow_id: str, steps: Sequence[StepInfo], start: StepInfo, address: ExecutionAddress
) -> ForkPoint | None:
    child_id = start["child_workflow_id"]
    join = first_join_after(steps, start["function_id"])
    if child_id is None or join is None:
        return None
    nested = await locate_fork(child_id, address)
    if nested is None:
        return None
    return ForkPoint(workflow_id, join, nested)


async def perform_fork(point: ForkPoint, forked_id: str) -> str:
    replacements: dict[str, str] | None = None
    child = point.child
    if child is not None:
        replacements = {child.workflow_id: await perform_fork(child, forked_child_id(forked_id, child.workflow_id))}
    with SetWorkflowID(forked_id):
        handle = await DBOS.fork_workflow_async(
            point.workflow_id,
            point.start_step,
            application_version=EXECUTOR_PROTOCOL_VERSION,
            replacement_children=replacements,
        )
    return handle.workflow_id


def new_run_id() -> RunId:
    return RunId(str(uuid.uuid7()))
