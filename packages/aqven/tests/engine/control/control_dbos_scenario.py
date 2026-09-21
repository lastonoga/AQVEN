import asyncio
import json
import sys
from collections.abc import Mapping
from typing import Final

from control_fakes import FakeScope, failed, succeeded
from dbos import DBOS, DBOSConfig, SetWorkflowID
from pydantic import JsonValue

from aqven.engine.control import ChildLaunch, MapExecutor, ParallelExecutor
from aqven.engine.control.durable import ChildHandle, durable_supervisors, outcome_json
from aqven.engine.policies import PolicyFactory
from aqven.ir import BuiltinPolicy, CompiledMapNode, CompiledParallelNode, RefBinding
from aqven.ports.execution import ChildEntry, ExecutionScope, NodeOutcome
from aqven.spec import NodeId

SLOW_TICKS: Final = 60
TICK_SEC: Final = 0.05
BRANCH_DELAYS: Final[Mapping[str, float]] = {"a": 0.0, "b": 0.1, "c": 0.25}
FAILING_ITEM: Final = 3
FORK_STEP: Final = 6

PARALLEL = CompiledParallelNode(
    node_id=NodeId("drafts"),
    description="drafts",
    branches={key: NodeId(f"drafts__{key}") for key in ("a", "b", "c", "d")},
    join=BuiltinPolicy(use="quorum", params={"min_ok": 2, "on_error": "skip"}),
    outputs=(RefBinding(name="candidates", ref="$ok[*].reply"),),
    output_schema={"type": "object"},
)
MAP = CompiledMapNode(
    node_id=NodeId("vote"),
    description="votes",
    over="$prepare.out.items",
    body=NodeId("vote__ballot"),
    concurrency=2,
    on_item_error=BuiltinPolicy(use="skip"),
    outputs=(RefBinding(name="ballots", ref="$ok"), RefBinding(name="errors", ref="$failed[*].index")),
    output_schema={"type": "object"},
)

active: list[int] = [0, 0]


@DBOS.workflow()
async def branch_workflow(node_id: str, entry_json: str) -> JsonValue:
    entry = ChildEntry.model_validate_json(entry_json)
    key = entry.branch_key or ""
    if key == "d":
        for _ in range(SLOW_TICKS):
            await DBOS.sleep_async(TICK_SEC)
        return outcome_json(succeeded({"reply": "d"}))
    await asyncio.sleep(BRANCH_DELAYS[key])
    if key == "a":
        return outcome_json(failed("refusal", "no"))
    return outcome_json(succeeded({"reply": key}))


@DBOS.workflow()
async def item_workflow(node_id: str, entry_json: str) -> JsonValue:
    entry = ChildEntry.model_validate_json(entry_json)
    active[0] += 1
    active[1] = max(active[0], active[1])
    await asyncio.sleep(0.05 * (5 - (entry.item_index or 0)))
    active[0] -= 1
    if entry.item_index == FAILING_ITEM:
        return outcome_json(failed("schema_invalid", "bad vote"))
    return outcome_json(succeeded({"item": entry.frame.item}))


async def start_branch(scope: ExecutionScope, launch: ChildLaunch) -> ChildHandle:
    with SetWorkflowID(f"{DBOS.workflow_id}::{launch.entry.branch_key}"):
        return await DBOS.start_workflow_async(branch_workflow, launch.node_id, launch.entry.model_dump_json())


async def start_item(scope: ExecutionScope, launch: ChildLaunch) -> ChildHandle:
    with SetWorkflowID(f"{DBOS.workflow_id}::{launch.entry.item_index}"):
        return await DBOS.start_workflow_async(item_workflow, launch.node_id, launch.entry.model_dump_json())


@DBOS.workflow()
async def parallel_workflow() -> JsonValue:
    scope = FakeScope(PARALLEL, {})
    outcome: NodeOutcome = await ParallelExecutor(PolicyFactory(), durable_supervisors(start_branch)).execute(
        PARALLEL, scope
    )
    return outcome_json(outcome)


@DBOS.workflow()
async def map_workflow() -> JsonValue:
    items: list[JsonValue] = [f"p{index}" for index in range(5)]
    scope = FakeScope(MAP, {}, outputs={NodeId("prepare"): {"items": items}})
    outcome: NodeOutcome = await MapExecutor(PolicyFactory(), durable_supervisors(start_item)).execute(MAP, scope)
    return outcome_json(outcome)


async def steps_of(workflow_id: str) -> list[JsonValue]:
    steps = await DBOS.list_workflow_steps_async(workflow_id, load_output=False)
    return [f"{step['function_id']}:{step['function_name']}" for step in steps]


async def forked(workflow_id: str, start_step: int) -> JsonValue:
    handle = await DBOS.fork_workflow_async(workflow_id, start_step)
    return await handle.get_result(polling_interval_sec=0.05)


async def scenario() -> JsonValue:
    with SetWorkflowID("parallel-run"):
        parallel = await (await DBOS.start_workflow_async(parallel_workflow)).get_result(polling_interval_sec=0.05)
    with SetWorkflowID("map-run"):
        mapped = await (await DBOS.start_workflow_async(map_workflow)).get_result(polling_interval_sec=0.05)
    slow = await DBOS.get_workflow_status_async("parallel-run::d")
    return {
        "parallel": parallel,
        "parallel_steps": await steps_of("parallel-run"),
        "slow_status": slow.status if slow is not None else None,
        "map": mapped,
        "map_steps": await steps_of("map-run"),
        "map_peak": active[1],
        "map_fork": await forked("map-run", FORK_STEP),
        "parallel_fork": await forked("parallel-run", FORK_STEP),
    }


def main(database: str) -> None:
    config: DBOSConfig = {
        "name": "aqven-control-scenario",
        "system_database_url": f"sqlite:///{database}",
        "use_listen_notify": False,
        "notification_listener_polling_interval_sec": 0.05,
        "log_level": "WARNING",
        "application_version": "aqven-control-scenario-v1",
    }
    DBOS(config=config)
    DBOS.launch()
    try:
        print(json.dumps(asyncio.run(scenario())))
    finally:
        DBOS.destroy()


if __name__ == "__main__":
    main(sys.argv[1])
