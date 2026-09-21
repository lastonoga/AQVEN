from typing import Final

from aqven.engine.addressing import address_key, child_workflow_id
from aqven.runtime.address import ExecutionAddress

HUMAN_EVENT: Final = "human"
HUMAN_TOPIC_PREFIX: Final = "human:"
FIRST_ATTEMPT: Final = 1


def wait_topic(address: ExecutionAddress, attempt: int) -> str:
    return f"{HUMAN_TOPIC_PREFIX}{address_key(address)}:{attempt}"


def wait_event_key(address: ExecutionAddress) -> str:
    return f"{HUMAN_TOPIC_PREFIX}{address_key(address)}"


__all__ = [
    "FIRST_ATTEMPT",
    "HUMAN_EVENT",
    "HUMAN_TOPIC_PREFIX",
    "address_key",
    "child_workflow_id",
    "wait_event_key",
    "wait_topic",
]
