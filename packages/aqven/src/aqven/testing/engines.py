from collections.abc import Iterator, Mapping
from dataclasses import dataclass, field
from pathlib import Path
from typing import Final

import pytest
from pydantic import SecretStr
from pydantic_ai.models import Model
from pydantic_ai.settings import ModelSettings

from aqven.engine import configure_local_engines, shutdown_local_engines
from aqven.engine.assembly import ModelFactories, ProjectModelFactories, standard_engine_setup
from aqven.engine.lifecycle import EngineSetup
from aqven.ir import CompiledProject
from aqven.ports.models import ModelFactory, provider_key_variables
from aqven.ports.prices import NO_PRICES, PriceCache
from aqven.runtime.options import ModelCall, ModelRoute

OFFLINE_KEY: Final = "aqven-offline-key"


def offline_environment(environ: Mapping[str, str] | None = None) -> Mapping[str, str]:
    keys = {name: OFFLINE_KEY for name in provider_key_variables()}
    return {**keys, **(environ or {})}


@dataclass(frozen=True, slots=True)
class FixedModel:
    model: Model

    def build(self, model: str, *, settings: ModelSettings | None, api_key: SecretStr | None) -> Model:
        return self.model


@dataclass(frozen=True, slots=True)
class FixedModels:
    models: Mapping[str, Model]
    fallback: ModelFactories = field(default_factory=ProjectModelFactories)

    def factory(self, project: CompiledProject, route: ModelRoute | None, call: ModelCall) -> ModelFactory:
        fixed = self.models.get(call.model.model)
        if fixed is None:
            return self.fallback.factory(project, route, call)
        return FixedModel(fixed)


@dataclass(slots=True)
class EngineSession:
    state_dir: Path | None = None
    environ: Mapping[str, str] | None = None

    def configure(self, setup: EngineSetup) -> None:
        shutdown_local_engines()
        configure_local_engines(setup)

    def standard(self) -> None:
        self.configure(standard_engine_setup(state_dir=self.state_dir, environ=self.environ))

    def models(self, models: Mapping[str, Model], prices: PriceCache = NO_PRICES) -> None:
        setup = standard_engine_setup(
            factories=FixedModels(models),
            state_dir=self.state_dir,
            environ=offline_environment(self.environ),
            prices=prices,
        )
        self.configure(setup)

    def shutdown(self) -> None:
        shutdown_local_engines()


@pytest.fixture
def aqven_engine(tmp_path_factory: pytest.TempPathFactory) -> Iterator[EngineSession]:
    session = EngineSession(state_dir=tmp_path_factory.mktemp("aqven_engine"))
    session.standard()
    yield session
    session.shutdown()
    session.standard()
