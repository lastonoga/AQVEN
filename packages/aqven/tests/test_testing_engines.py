import asyncio
from pathlib import Path
from typing import Final

from pydantic import BaseModel, SecretStr
from pydantic_ai.messages import ModelMessage, ModelResponse, TextPart
from pydantic_ai.models.function import AgentInfo, FunctionModel

from aqven.ir import AgentModel, CompiledProject
from aqven.runtime import CallMedia, ModelCall, Project, RunResult
from aqven.spec import ModelString, ProviderName
from aqven.testing.engines import EngineSession, FixedModels

ALIAS_SHOP: Final = Path(__file__).parent / "fixtures" / "alias_shop"
SCRIPTED_MODEL: Final = "openai:gpt-5.4-mini"
OTHER_MODEL: Final = "openrouter:openai/gpt-oss-20b"
PROJECT: Final = CompiledProject(package="shop", description="engine fixture project")


def reply(messages: list[ModelMessage], info: AgentInfo) -> ModelResponse:
    return ModelResponse(parts=[TextPart("scripted")])


def choice(model: str) -> ModelCall:
    agent_model = AgentModel(model=ModelString(model), provider=ProviderName("openai"))
    return ModelCall(model=agent_model, uses_tools=False, media=CallMedia())


def audit() -> RunResult[BaseModel]:
    handle = Project.load(ALIAS_SHOP).flow("audit")

    async def scenario() -> RunResult[BaseModel]:
        run = await handle.start(handle.input_model.model_validate({"text": "  note  "}))
        return await run.result()

    return asyncio.run(scenario())


def test_the_engine_fixture_runs_a_flow(aqven_engine: EngineSession) -> None:
    assert audit().status == "completed"


def test_a_second_engine_test_reuses_the_process(aqven_engine: EngineSession) -> None:
    assert audit().status == "completed"


def test_a_third_engine_test_still_starts_its_own_engine(aqven_engine: EngineSession) -> None:
    assert aqven_engine.state_dir is not None
    assert audit().status == "completed"


def test_fixed_models_answer_for_the_declared_model() -> None:
    scripted = FunctionModel(reply)
    factories = FixedModels({SCRIPTED_MODEL: scripted})

    factory = factories.factory(PROJECT, None, choice(SCRIPTED_MODEL))

    assert factory.build(SCRIPTED_MODEL, settings=None, api_key=None) is scripted


def test_fixed_models_fall_back_to_the_provider_factory() -> None:
    factories = FixedModels({SCRIPTED_MODEL: FunctionModel(reply)})

    factory = factories.factory(PROJECT, None, choice(OTHER_MODEL))

    assert factory.build(OTHER_MODEL, settings=None, api_key=SecretStr("k")).model_name == "openai/gpt-oss-20b"
