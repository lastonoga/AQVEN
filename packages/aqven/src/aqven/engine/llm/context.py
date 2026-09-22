from dataclasses import dataclass, field

from pydantic import BaseModel

from aqven.engine.llm.allowed import ShapedOutput
from aqven.engine.llm.failures import GuardFailure
from aqven.ir import CompiledInference
from aqven.ports.execution import ExecutionScope
from aqven.runtime.address import JsonObject
from aqven.runtime.executions import CheckOutcome


@dataclass(slots=True)
class RunDeps:
    scope: ExecutionScope
    inference: CompiledInference
    inputs: BaseModel
    document: JsonObject
    shaped: ShapedOutput
    attempt_offset: int = 0
    checks: list[CheckOutcome] = field(default_factory=list[CheckOutcome])
    guard_failures: dict[int, GuardFailure] = field(default_factory=dict[int, GuardFailure])

    def attempt(self, run_step: int) -> int:
        return self.attempt_offset + run_step
