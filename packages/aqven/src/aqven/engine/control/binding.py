from collections.abc import Callable, Mapping, Sequence
from typing import Final

from pydantic import JsonValue

from aqven.ir import RefBinding
from aqven.policies.paths import pick
from aqven.ports.execution import ExecutionScope, ScopeFrame
from aqven.runtime.address import JsonObject
from aqven.spec import Ref, RefRoot, parse_ref

type LocalRoot = Callable[[ScopeFrame, Ref], JsonValue]


def _listed(values: tuple[JsonValue, ...] | None) -> JsonValue:
    return list(values) if values is not None else None


def _branch(frame: ScopeFrame, ref: Ref) -> JsonValue:
    branches = frame.branch or {}
    return branches.get(ref.key or "")


LOCAL_ROOTS: Final[Mapping[RefRoot, LocalRoot]] = {
    RefRoot.OK: lambda frame, ref: _listed(frame.ok),
    RefRoot.FAILED: lambda frame, ref: _listed(frame.failed),
    RefRoot.BRANCH: _branch,
    RefRoot.ITER: lambda frame, ref: frame.iter,
    RefRoot.LOOP: lambda frame, ref: frame.loop,
}


def resolve_local(scope: ExecutionScope, frame: ScopeFrame, text: str) -> JsonValue:
    ref = parse_ref(text)
    root = LOCAL_ROOTS.get(ref.root)
    if root is None:
        return scope.resolve(text)
    return pick(root(frame, ref), ref.steps)


def bind_outputs(scope: ExecutionScope, bindings: Sequence[RefBinding], frame: ScopeFrame) -> JsonObject:
    return {binding.name: resolve_local(scope, frame, binding.ref) for binding in bindings}
