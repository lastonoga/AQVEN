from aqven.ports.execution import EventBuilder, EventStamp
from aqven.runtime.address import ExecutionAddress
from aqven.runtime.events import LoopExited, LoopIterationFinished, MapItemRecovered, NodeProgress, RunEvent
from aqven.runtime.executions import ItemRecovery
from aqven.spec import LoopStopReason


def progress(address: ExecutionAddress, done: int, total: int) -> EventBuilder:
    def build(stamp: EventStamp) -> RunEvent:
        return NodeProgress(seq=stamp.seq, at=stamp.at, run_id=stamp.run_id, address=address, done=done, total=total)

    return build


def item_recovered(address: ExecutionAddress, recovery: ItemRecovery) -> EventBuilder:
    def build(stamp: EventStamp) -> RunEvent:
        return MapItemRecovered(seq=stamp.seq, at=stamp.at, run_id=stamp.run_id, address=address, recovery=recovery)

    return build


def iteration_finished(
    address: ExecutionAddress, score: float | None, stop_reason: LoopStopReason | None
) -> EventBuilder:
    def build(stamp: EventStamp) -> RunEvent:
        return LoopIterationFinished(
            seq=stamp.seq,
            at=stamp.at,
            run_id=stamp.run_id,
            address=address,
            score=score,
            stop_reason=stop_reason,
        )

    return build


def loop_exited(address: ExecutionAddress, reason: LoopStopReason, selected: int | None) -> EventBuilder:
    def build(stamp: EventStamp) -> RunEvent:
        return LoopExited(
            seq=stamp.seq,
            at=stamp.at,
            run_id=stamp.run_id,
            address=address,
            reason=reason,
            selected_iteration=selected,
        )

    return build
