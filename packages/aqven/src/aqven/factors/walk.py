from collections.abc import Callable, Hashable, Iterable


def walk[K: Hashable](roots: Iterable[K], expand: Callable[[K], Iterable[K] | None]) -> tuple[K, ...]:
    reached: dict[K, None] = {}
    pending = list(roots)
    while pending:
        key = pending.pop(0)
        children = None if key in reached else expand(key)
        if children is None:
            continue
        reached[key] = None
        pending.extend(children)
    return tuple(reached)
