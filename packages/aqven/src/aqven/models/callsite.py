from collections.abc import Generator
from contextlib import contextmanager
from contextvars import ContextVar
from dataclasses import dataclass
from typing import Final

from pydantic import JsonValue

from aqven.runtime.address import ExecutionAddress

FIRST_ATTEMPT: Final = 1


@dataclass(frozen=True, slots=True)
class CallSite:
    address: ExecutionAddress | None
    attempt: int = FIRST_ATTEMPT

    def as_json(self) -> JsonValue:
        address = None if self.address is None else self.address.model_dump(mode="json")
        return {"address": address, "attempt": self.attempt}

    @property
    def node_id(self) -> str | None:
        return None if self.address is None else self.address.node_id


UNBOUND_CALL_SITE: Final = CallSite(address=None)

_CURRENT_CALL_SITE: Final[ContextVar[CallSite]] = ContextVar("aqven_call_site", default=UNBOUND_CALL_SITE)


def current_call_site() -> CallSite:
    return _CURRENT_CALL_SITE.get()


@contextmanager
def call_site(address: ExecutionAddress | None, attempt: int = FIRST_ATTEMPT) -> Generator[CallSite]:
    site = CallSite(address=address, attempt=attempt)
    token = _CURRENT_CALL_SITE.set(site)
    try:
        yield site
    finally:
        _CURRENT_CALL_SITE.reset(token)
