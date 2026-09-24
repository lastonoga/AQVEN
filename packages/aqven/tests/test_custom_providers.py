import asyncio
from collections.abc import AsyncIterator, Sequence
from dataclasses import dataclass, field
from pathlib import Path
from typing import Final

import httpx2
import pytest
from pydantic import SecretStr
from pydantic_ai.direct import model_request_stream
from pydantic_ai.messages import ModelMessage, ModelRequest, ModelResponse, TextPart
from pydantic_ai.models import Model
from pydantic_ai.models.function import AgentInfo, DeltaToolCalls, FunctionModel

from aqven.check import build_context, check_project
from aqven.check import providers as providers_rule
from aqven.check.context import CheckContext
from aqven.check.output_modes import resolved_agent_modes
from aqven.check.resolver import CodeResolver
from aqven.diagnostics import Diagnostic, DiagnosticCode
from aqven.engine.assembly.models import KeyRequirement, key_requirement, provider_options
from aqven.ir import CompiledProject
from aqven.loader import load_project
from aqven.models import CallPolicy, cassette_policy, chain_links, guard_model
from aqven.models.providers import custom_options, declared_capabilities, key_variable
from aqven.ports.models import provider_env_var
from aqven.runtime import CassetteConfig, CassetteMode
from aqven.spec import AgentId, ProviderName, ProviderSpec
from aqven.testing import copy_project
from aqven_llm import OPENAI_COMPATIBLE, CustomProvider, ProviderContext, ProviderModelFactory, ProviderOptions

FIXTURE: Final = Path(__file__).parent / "fixtures" / "fixture_shop"
PROJECT_FILE: Final = "aqven.yaml"
WRITER: Final = "shared/writer.yaml"
ADAPTER_FILE: Final = "adapters.py"
ACME_MODEL: Final = "acme:tiny-1"
ACME_KEY: Final = "ref:env/ACME_API_KEY"
PROMPT: Final = "hello"
ANSWER: Final = "tiny answer"
PROVIDER_CODES: Final = {
    DiagnosticCode.E_PROVIDER_FACTORY_INVALID,
    DiagnosticCode.E_PROVIDER_ID_RESERVED,
    DiagnosticCode.E_PROVIDER_NO_STREAMING,
    DiagnosticCode.E_PROVIDER_UNKNOWN,
    DiagnosticCode.E_PROVIDER_EXTRA_MISSING,
}

ADAPTER_SOURCE: Final = """from collections.abc import AsyncIterator
from typing import Final

from pydantic_ai.messages import ModelMessage, ModelResponse, TextPart
from pydantic_ai.models import Model, ModelRequestParameters
from pydantic_ai.models.function import AgentInfo, DeltaToolCalls, FunctionModel
from pydantic_ai.settings import ModelSettings

from aqven_llm import ProviderContext

ANSWER: Final = "tiny answer"


async def stream(messages: list[ModelMessage], info: AgentInfo) -> AsyncIterator[str | DeltaToolCalls]:
    yield ANSWER


def reply(messages: list[ModelMessage], info: AgentInfo) -> ModelResponse:
    return ModelResponse(parts=[TextPart(ANSWER)])


def build_model(model_name: str, context: ProviderContext) -> FunctionModel:
    return FunctionModel(reply, stream_function=stream, model_name=model_name)


def build_wrong(name: str, context: ProviderContext) -> Model:
    return build_model(name, context)


class Silent(Model):
    @property
    def model_name(self) -> str:
        return "silent"

    @property
    def system(self) -> str:
        return "fixture"

    async def request(
        self,
        messages: list[ModelMessage],
        model_settings: ModelSettings | None,
        model_request_parameters: ModelRequestParameters,
    ) -> ModelResponse:
        return ModelResponse(parts=[TextPart(ANSWER)])


def build_silent(model_name: str, context: ProviderContext) -> Silent:
    return Silent()
"""

CODE_PROVIDER: Final = f'''- id: "acme"
  kind: "code"
  run: "fixture_shop.adapters:build_model"
  api_key: "{ACME_KEY}"
  params:
    region: "eu"
  capabilities:
    tools: false
    json_schema_output: false
  data_policy:
    allows_pii: false
    allows_sensitive: false
    retention: "unknown"
'''

LOCAL_PROVIDER: Final = """- id: "local"
  kind: "openai_compatible"
  base_url: "http://127.0.0.1:8000/v1"
  api_key: "ref:env/LOCAL_API_KEY"
  data_policy:
    allows_pii: false
    allows_sensitive: false
    retention: "unknown"
"""


def project_with(tmp_path: Path, entry: str, *, model: str | None = ACME_MODEL) -> Path:
    root = copy_project(FIXTURE, tmp_path)
    (root / ADAPTER_FILE).write_text(ADAPTER_SOURCE, encoding="utf-8")
    project = root / PROJECT_FILE
    project.write_text(f"{project.read_text(encoding='utf-8')}{entry}", encoding="utf-8")
    if model is not None:
        writer = root / WRITER
        source = writer.read_text(encoding="utf-8")
        writer.write_text(source.replace('model: "openai:gpt-5.4-mini"', f'model: "{model}"'), encoding="utf-8")
    return root


def errors_of(root: Path, code: DiagnosticCode) -> tuple[Diagnostic, ...]:
    return tuple(item for item in check_project(root).diagnostics if item.code is code)


def provider_codes(root: Path) -> set[DiagnosticCode]:
    return {item.code for item in check_project(root).diagnostics} & PROVIDER_CODES


def context_of(root: Path) -> CheckContext:
    loaded = load_project(root)
    assert loaded.project is not None
    resolver = CodeResolver(root)
    with resolver.session():
        return build_context(loaded.project, resolver)


def provider_spec(root: Path, provider: str) -> ProviderSpec:
    loaded = load_project(root)
    assert loaded.project is not None
    return next(item for item in loaded.project.project.spec.providers if item.id == provider)


def test_a_code_provider_and_its_agent_pass_the_check(tmp_path: Path) -> None:
    root = project_with(tmp_path, CODE_PROVIDER)
    report = check_project(root)

    assert {item.code for item in report.diagnostics} & PROVIDER_CODES == set()
    assert report.project is not None


def test_an_openai_compatible_provider_passes_the_check(tmp_path: Path) -> None:
    root = project_with(tmp_path, LOCAL_PROVIDER, model="local:qwen-tiny")

    assert provider_codes(root) == set()


def test_a_factory_that_does_not_resolve_is_reported(tmp_path: Path) -> None:
    entry = CODE_PROVIDER.replace("adapters:build_model", "adapters:nowhere")
    root = project_with(tmp_path, entry)

    found = errors_of(root, DiagnosticCode.E_PROVIDER_FACTORY_INVALID)

    assert len(found) == 1
    assert "does not resolve" in found[0].message
    assert found[0].hint is not None
    assert found[0].file == PROJECT_FILE
    assert found[0].path == ("providers", 2, "run")


def test_a_factory_with_the_wrong_signature_is_reported(tmp_path: Path) -> None:
    entry = CODE_PROVIDER.replace("adapters:build_model", "adapters:build_wrong")
    root = project_with(tmp_path, entry)

    found = errors_of(root, DiagnosticCode.E_PROVIDER_FACTORY_INVALID)

    assert [item.message for item in found] == [
        "provider acme: parameters name, context do not match (model_name: str, context: ProviderContext)"
    ]
    assert found[0].hint is not None and "ProviderContext" in found[0].hint


def test_a_factory_that_returns_a_model_without_streaming_is_reported(tmp_path: Path) -> None:
    entry = CODE_PROVIDER.replace("adapters:build_model", "adapters:build_silent")
    root = project_with(tmp_path, entry)

    found = errors_of(root, DiagnosticCode.E_PROVIDER_NO_STREAMING)

    assert len(found) == 1
    assert "has no request_stream" in found[0].message


def test_kind_code_without_run_is_reported(tmp_path: Path) -> None:
    entry = CODE_PROVIDER.replace('  run: "fixture_shop.adapters:build_model"\n', "")
    root = project_with(tmp_path, entry)

    found = errors_of(root, DiagnosticCode.E_PROVIDER_FACTORY_INVALID)

    assert [item.message for item in found] == ["provider acme: kind code needs run"]


def test_kind_openai_compatible_without_base_url_is_reported(tmp_path: Path) -> None:
    entry = LOCAL_PROVIDER.replace('  base_url: "http://127.0.0.1:8000/v1"\n', "")
    root = project_with(tmp_path, entry, model="local:qwen-tiny")

    found = errors_of(root, DiagnosticCode.E_PROVIDER_FACTORY_INVALID)

    assert [item.message for item in found] == ["provider local: kind openai_compatible needs base_url"]


def test_run_outside_kind_code_is_reported(tmp_path: Path) -> None:
    entry = LOCAL_PROVIDER.replace("  base_url:", '  run: "fixture_shop.adapters:build_model"\n  base_url:')
    root = project_with(tmp_path, entry, model="local:qwen-tiny")

    found = errors_of(root, DiagnosticCode.E_PROVIDER_FACTORY_INVALID)

    assert "run is only read with kind: code" in found[0].message


def test_a_custom_provider_cannot_take_a_built_in_id(tmp_path: Path) -> None:
    entry = CODE_PROVIDER.replace('- id: "acme"', '- id: "mistral"').replace("acme:tiny-1", "mistral:tiny-1")
    root = project_with(tmp_path, entry, model="mistral:tiny-1")

    found = errors_of(root, DiagnosticCode.E_PROVIDER_ID_RESERVED)

    assert len(found) == 1
    assert found[0].hint is not None and "mistral_custom" in found[0].hint


def test_a_catalog_provider_without_an_adapter_is_unknown(tmp_path: Path) -> None:
    entry = CODE_PROVIDER.replace('  kind: "code"\n', "").replace('  run: "fixture_shop.adapters:build_model"\n', "")
    root = project_with(tmp_path, entry)

    found = errors_of(root, DiagnosticCode.E_PROVIDER_UNKNOWN)

    assert [item.path for item in found] == [("providers", 2, "id")]
    assert found[0].hint is not None and "openai_compatible" in found[0].hint


def test_a_provider_shipped_as_a_package_is_known_to_the_check(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    entry = CODE_PROVIDER.replace('  kind: "code"\n', "").replace('  run: "fixture_shop.adapters:build_model"\n', "")
    root = project_with(tmp_path, entry)
    packaged = {"acme": CustomProvider("acme", OPENAI_COMPATIBLE, source="package")}
    monkeypatch.setattr(providers_rule, "installed_providers", lambda: packaged)

    assert DiagnosticCode.E_PROVIDER_UNKNOWN not in {item.code for item in check_project(root).diagnostics}


def test_declared_capabilities_resolve_the_output_mode(tmp_path: Path) -> None:
    root = project_with(tmp_path, CODE_PROVIDER)
    context = context_of(root)

    resolution = resolved_agent_modes(context.agents[AgentId("writer")]).resolve()

    assert resolution.mode == "prompted"


def test_the_engine_reads_the_factory_params_and_key_variable_of_a_code_provider(tmp_path: Path) -> None:
    root = project_with(tmp_path, CODE_PROVIDER)
    spec = provider_spec(root, "acme")

    with CodeResolver(root).session():
        options = provider_options(spec, None)

    assert options.factory is not None
    assert options.params == {"region": "eu"}
    assert options.api_key_env == "ACME_API_KEY"
    assert options.capabilities is not None and not options.capabilities.tools


def test_a_provider_without_an_api_key_needs_no_key(tmp_path: Path) -> None:
    entry = LOCAL_PROVIDER.replace('  api_key: "ref:env/LOCAL_API_KEY"\n', "")
    root = project_with(tmp_path, entry, model="local:qwen-tiny")
    spec = provider_spec(root, "local")
    compiled = CompiledProject(package="fixture_shop", description="fixture", providers=(spec,))

    assert key_variable(spec.api_key) is None
    assert custom_options(spec).factory is not None
    assert declared_capabilities(spec.capabilities) is None
    assert key_requirement(compiled, "local") == KeyRequirement(env_var=None, required=False)


def test_a_custom_provider_key_comes_from_its_declared_variable(tmp_path: Path) -> None:
    root = project_with(tmp_path, CODE_PROVIDER)
    spec = provider_spec(root, "acme")
    compiled = CompiledProject(package="fixture_shop", description="fixture", providers=(spec,))

    assert key_requirement(compiled, "acme") == KeyRequirement(env_var="ACME_API_KEY", required=True)
    assert key_requirement(compiled, "openai") == KeyRequirement(env_var="OPENAI_API_KEY", required=True)


@pytest.mark.parametrize(("provider", "expected"), [("openai", "OPENAI_API_KEY"), ("mistral", "MISTRAL_API_KEY")])
def test_catalog_providers_keep_their_key_variable(provider: str, expected: str) -> None:
    assert provider_env_var(ProviderName(provider)) == expected


async def echo_stream(messages: list[ModelMessage], info: AgentInfo) -> AsyncIterator[str | DeltaToolCalls]:
    yield "tiny "
    yield "answer"


def echo_reply(messages: list[ModelMessage], info: AgentInfo) -> ModelResponse:
    return ModelResponse(parts=[TextPart(ANSWER)])


@dataclass(slots=True)
class EchoFactory:
    names: list[str] = field(default_factory=list[str])

    def __call__(self, model_name: str, context: ProviderContext) -> Model:
        self.names.append(model_name)
        return FunctionModel(echo_reply, stream_function=echo_stream, model_name=model_name)


def custom_model(factory: EchoFactory) -> Model:
    models = ProviderModelFactory(
        providers={"acme": ProviderOptions(factory=factory)}, environ={}, http_client=httpx2.AsyncClient
    )
    return models.build(ACME_MODEL, settings=None, api_key=SecretStr("acme-key"))


async def streamed(model: Model) -> str:
    async with model_request_stream(model, [ModelRequest.user_text_prompt(PROMPT)]) as stream:
        async for _event in stream:
            continue
        response = stream.get()
    return "".join(part.content for part in response.parts if isinstance(part, TextPart))


async def guarded_run(directory: Path, mode: CassetteMode, factory: EchoFactory) -> tuple[str, Sequence[type[Model]]]:
    policy = CallPolicy(cassettes=cassette_policy(CassetteConfig(directory=directory, mode=mode)))
    model = guard_model(custom_model(factory), model_ref=ACME_MODEL, policy=policy)
    return await streamed(model), chain_links(model)


def test_a_custom_model_runs_through_the_guarantee_chain_and_records_a_cassette(tmp_path: Path) -> None:
    factory = EchoFactory()
    directory = tmp_path / "cassettes"

    recorded, links = asyncio.run(guarded_run(directory, CassetteMode.RECORD, factory))
    replayed, _ = asyncio.run(guarded_run(directory, CassetteMode.REPLAY_STRICT, factory))

    assert recorded == replayed == ANSWER
    assert len(links) == 5
    assert factory.names == ["tiny-1", "tiny-1"]
    assert list(directory.rglob("*.json")) != []
