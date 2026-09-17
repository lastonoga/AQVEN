from collections.abc import Callable, Iterable
from dataclasses import dataclass
from typing import Protocol

from aqven.chat.builders import ChatEventBuilders


class Router(Protocol):
    def apply(self, value: object) -> ChatEventBuilders | None: ...


@dataclass(frozen=True, slots=True)
class Route[M]:
    kind: type[M]
    handle: Callable[[M], ChatEventBuilders]

    def apply(self, value: object) -> ChatEventBuilders | None:
        if not isinstance(value, self.kind):
            return None
        return self.handle(value)


def dispatch(routes: Iterable[Router], value: object) -> ChatEventBuilders:
    return next((events for route in routes if (events := route.apply(value)) is not None), ())


def ignore(*_: object) -> ChatEventBuilders:
    return ()


def first_match[T](rules: Iterable[tuple[bool, T]], default: T) -> T:
    return next((value for matched, value in rules if matched), default)
