import pkgutil
from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Protocol

type PolicyFunction = Callable[..., object]


class CodeLoader(Protocol):
    def load(self, ref: str) -> object: ...


@dataclass(slots=True)
class ImportCodeLoader:
    cache: dict[str, object] = field(default_factory=dict[str, object])

    def load(self, ref: str) -> object:
        if ref not in self.cache:
            self.cache[ref] = pkgutil.resolve_name(ref)
        return self.cache[ref]
