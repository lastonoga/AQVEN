from aqven.engine.failures import run_error
from aqven.ports.execution import NodeFailed, NodeOutcome, NodeSucceeded
from aqven.runtime.address import ExecutionAddress
from aqven.runtime.overrides import NodeOutputOverride


def override_outcome(override: NodeOutputOverride, address: ExecutionAddress) -> NodeOutcome:
    failure = override.error
    if failure is None:
        return NodeSucceeded(output=override.output)
    return NodeFailed(error=run_error(failure.code, failure.message, address))
