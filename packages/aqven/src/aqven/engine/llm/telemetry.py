import json
import logging
from collections.abc import Mapping
from typing import Final

from opentelemetry import trace
from opentelemetry.util.types import AttributeValue

from aqven.runtime.address import ExecutionAddress
from aqven.runtime.executions import ModelErrorDetails

LOGGER: Final = logging.getLogger("aqven.engine.llm")
ATTEMPT_EVENT: Final = "aqven.model_output.attempt_failed"
NODE_EVENT: Final = "aqven.model_output.node_failed"


def error_attributes(
    address: ExecutionAddress, code: str, message: str, hint: str | None, details: ModelErrorDetails | None
) -> dict[str, AttributeValue]:
    base: dict[str, AttributeValue] = {
        "aqven.node.id": address.node_id,
        "aqven.error.code": code,
        "aqven.error.message": message,
    }
    optional: Mapping[str, AttributeValue | None] = {
        "aqven.error.hint": hint,
        "aqven.agent.id": None if details is None else details.agent,
        "gen_ai.request.model": None if details is None else details.model,
        "aqven.output.mode": None if details is None else details.output_mode,
        "aqven.attempt": None if details is None else details.attempt,
        "aqven.error.raw_excerpt": None if details is None else details.raw_excerpt,
        "aqven.error.violations": None if details is None else _violations(details),
    }
    return {**base, **{key: value for key, value in optional.items() if value is not None}}


def report_attempt_failure(
    address: ExecutionAddress, code: str, message: str, hint: str | None, details: ModelErrorDetails | None
) -> None:
    attributes = error_attributes(address, code, message, hint, details)
    LOGGER.warning("%s: %s; hint: %s", code, message, hint, extra=attributes)
    trace.get_current_span().add_event(ATTEMPT_EVENT, attributes)


def report_node_failure(
    address: ExecutionAddress, code: str, message: str, hint: str | None, details: ModelErrorDetails | None
) -> None:
    attributes = error_attributes(address, code, message, hint, details)
    LOGGER.error("%s: %s; hint: %s", code, message, hint, extra=attributes)
    span = trace.get_current_span()
    span.set_attributes(attributes)
    span.add_event(NODE_EVENT, attributes)


def _violations(details: ModelErrorDetails) -> str | None:
    if not details.violations:
        return None
    return json.dumps([item.model_dump(mode="json") for item in details.violations], ensure_ascii=False)
