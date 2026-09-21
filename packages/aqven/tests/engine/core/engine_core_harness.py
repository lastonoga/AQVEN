import asyncio
import json
from collections.abc import Generator
from contextlib import contextmanager
from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path
from typing import Final

import httpx2
from engine_core_plan import FIXTURE_ROOT
from pydantic import JsonValue, SecretStr

from aqven.engine import (
    DbosEngineFacade,
    DerivableScope,
    EngineExtensions,
    EngineLifecycle,
    EngineSetup,
    ExtensionsFactory,
)
from aqven.engine.lifecycle import no_extensions
from aqven.engine.runtime import ToolServices
from aqven.ir import CompiledParallelNode, CompiledProject
from aqven.ports.execution import ChildEntry, ExecutionScope, NodeFailed, NodeOutcome, NodeSucceeded, ScopeFrame
from aqven.ports.settings import SettingKey, SettingScope, SettingView
from aqven.runtime.executions import RunError

RELAY_TOKEN_SETTING: Final = "secrets.relay_token"
RELAY_TOKEN: Final = "relay-token-42"
TRACE_ENV: Final = "RELAY_TRACE"
GATE_ENV: Final = "RELAY_GATE"


@dataclass(slots=True)
class MemorySettings:
    secrets: dict[tuple[SettingScope, str], SecretStr] = field(
        default_factory=dict[tuple[SettingScope, str], SecretStr]
    )

    async def list_settings(self, scope: SettingScope) -> tuple[SettingView, ...]:
        return ()

    async def get_setting(self, scope: SettingScope, key: SettingKey) -> SettingView | None:
        return None

    async def set_value(self, scope: SettingScope, key: SettingKey, value: JsonValue) -> SettingView:
        return SettingView(scope=scope, key=key, kind="value", value=value, updated_at=datetime.now(UTC))

    async def set_secret(self, scope: SettingScope, key: SettingKey, secret: SecretStr) -> SettingView:
        self.secrets[(scope, key)] = secret
        return SettingView(scope=scope, key=key, kind="secret", masked="••••", updated_at=datetime.now(UTC))

    async def delete_setting(self, scope: SettingScope, key: SettingKey) -> bool:
        return self.secrets.pop((scope, key), None) is not None

    async def read_secret(self, scope: SettingScope, key: SettingKey) -> SecretStr | None:
        return self.secrets.get((scope, key))


def relay_settings() -> MemorySettings:
    settings = MemorySettings()
    settings.secrets[("project", RELAY_TOKEN_SETTING)] = SecretStr(RELAY_TOKEN)
    return settings


@dataclass(slots=True)
class StampService:
    requests: list[httpx2.Request] = field(default_factory=list[httpx2.Request])

    def handle(self, request: httpx2.Request) -> httpx2.Response:
        self.requests.append(request)
        body = json.loads(request.content)
        return httpx2.Response(200, json={"stamped": f"{body['text']}!"})

    def transport(self) -> httpx2.MockTransport:
        return httpx2.MockTransport(self.handle)


@dataclass(frozen=True, slots=True)
class StaticPlanSource:
    plan: CompiledProject

    def current(self) -> CompiledProject:
        return self.plan


@contextmanager
def launched_facade(
    state: Path, plan_source: StaticPlanSource | None = None, extensions: ExtensionsFactory = no_extensions
) -> Generator[DbosEngineFacade]:
    setup = EngineSetup(settings=relay_settings(), environ={}, extensions=extensions)
    lifecycle = EngineLifecycle(root=FIXTURE_ROOT, setup=setup, state_dir=state)
    runtime = lifecycle.launch()
    try:
        yield DbosEngineFacade(runtime=runtime, plan_source=plan_source)
    finally:
        lifecycle.shutdown()


@dataclass(frozen=True, slots=True)
class GatherParallel:
    async def execute(self, node: CompiledParallelNode, scope: ExecutionScope) -> NodeOutcome:
        keys = tuple(node.branches)
        outcomes = await asyncio.gather(
            *(scope.run_child(node.branches[key], ChildEntry(branch_key=key)) for key in keys)
        )
        branch = {
            key: outcome.output
            for key, outcome in zip(keys, outcomes, strict=True)
            if isinstance(outcome, NodeSucceeded)
        }
        if len(branch) != len(keys) or not isinstance(scope, DerivableScope):
            return NodeFailed(error=RunError(code="BRANCH_FAILED", message="branch failed", address=scope.address))
        joined = scope.derive(ChildEntry(frame=ScopeFrame(branch=branch)))
        return NodeSucceeded(output=joined.bind(node.outputs))


def with_parallel(services: ToolServices) -> EngineExtensions:
    return EngineExtensions(parallel=GatherParallel())


def trace_lines(path: Path) -> list[str]:
    return path.read_text(encoding="utf-8").split() if path.exists() else []
