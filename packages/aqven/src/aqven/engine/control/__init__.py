from dataclasses import dataclass

from aqven.engine.control.binding import LOCAL_ROOTS, bind_outputs, resolve_local
from aqven.engine.control.children import (
    ChildLaunch,
    ChildSupervisor,
    ChildTicket,
    InProcessSupervisor,
    InputOverlayScope,
    SupervisorFactory,
    in_process_supervisor,
    run_launch,
)
from aqven.engine.control.loop import LoopExecutor
from aqven.engine.control.mapping import MapExecutor
from aqven.engine.control.outcomes import BUDGET_ERROR_CODES, ControlErrorCode, UsageTally
from aqven.engine.control.parallel import ParallelExecutor
from aqven.engine.policies import PolicyFactory


@dataclass(frozen=True, slots=True)
class ControlExecutors:
    parallel: ParallelExecutor
    map: MapExecutor
    loop: LoopExecutor


def control_executors(
    *,
    policies: PolicyFactory | None = None,
    supervisors: SupervisorFactory = in_process_supervisor,
    budget_codes: frozenset[str] = BUDGET_ERROR_CODES,
) -> ControlExecutors:
    factory = policies if policies is not None else PolicyFactory()
    return ControlExecutors(
        parallel=ParallelExecutor(factory, supervisors),
        map=MapExecutor(factory, supervisors),
        loop=LoopExecutor(factory, budget_codes),
    )


__all__ = [
    "BUDGET_ERROR_CODES",
    "LOCAL_ROOTS",
    "ChildLaunch",
    "ChildSupervisor",
    "ChildTicket",
    "ControlErrorCode",
    "ControlExecutors",
    "InProcessSupervisor",
    "InputOverlayScope",
    "LoopExecutor",
    "MapExecutor",
    "ParallelExecutor",
    "SupervisorFactory",
    "UsageTally",
    "bind_outputs",
    "control_executors",
    "in_process_supervisor",
    "resolve_local",
    "run_launch",
]
