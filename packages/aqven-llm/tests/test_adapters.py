import asyncio
from collections.abc import Mapping
from dataclasses import dataclass, field
from importlib.metadata import EntryPoint
from typing import Final

import pytest
from example_adapter import (
    ECHO_PREFIX,
    build_any,
    build_async,
    build_model,
    build_silent,
    build_wrong_parameters,
    build_wrong_return,
)
from llm_wire import API_KEY, Recorder, chat_chunk, data_stream, json_reply, prompt, sse_reply
from pydantic import SecretStr
from pydantic_ai import ModelHTTPError
from pydantic_ai.direct import model_request_stream
from pydantic_ai.messages import TextPart
from pydantic_ai.models import Model

from aqven_llm import (
    ENTRY_POINT_GROUP,
    OPENAI_COMPATIBLE,
    CustomProvider,
    ProviderContext,
    ProviderKeys,
    ProviderMisconfigured,
    ProviderModelFactory,
    ProviderNoStreaming,
    ProviderOptions,
    ProviderRegistry,
    UnknownProvider,
    entry_point_provider,
    factory_signature,
)

ACME: Final = "acme"
ACME_MODEL: Final = "acme:tiny-1"
ACME_KEY_ENV: Final = "ACME_API_KEY"
LOCAL_URL: Final = "http://127.0.0.1:8000/v1"
PACKAGE_ENTRY: Final = EntryPoint(name=ACME, value="example_adapter:build_model", group=ENTRY_POINT_GROUP)
BROKEN_ENTRY: Final = EntryPoint(name=ACME, value="example_adapter:NOT_A_FACTORY", group=ENTRY_POINT_GROUP)


@dataclass(slots=True)
class FactorySpy:
    contexts: list[ProviderContext] = field(default_factory=list[ProviderContext])
    names: list[str] = field(default_factory=list[str])

    def __call__(self, model_name: str, context: ProviderContext) -> Model:
        self.names.append(model_name)
        self.contexts.append(context)
        return build_model(model_name, context)


def custom_factory(
    options: Mapping[str, ProviderOptions],
    *,
    environ: Mapping[str, str] | None = None,
    registry: ProviderRegistry | None = None,
) -> ProviderModelFactory:
    return ProviderModelFactory(providers=options, environ=environ or {}, registry=registry or ProviderRegistry())


async def streamed_text(model: Model, text: str) -> str:
    async with model_request_stream(model, prompt(text)) as stream:
        async for _event in stream:
            continue
        response = stream.get()
    return "".join(part.content for part in response.parts if isinstance(part, TextPart))


def test_project_factory_receives_the_model_name_key_base_url_and_params() -> None:
    spy = FactorySpy()
    options = ProviderOptions(factory=spy, base_url=LOCAL_URL, params={"region": "eu"}, api_key_env=ACME_KEY_ENV)
    models = custom_factory({ACME: options}, environ={ACME_KEY_ENV: "secret-value"})

    model = models.build(ACME_MODEL, settings=None)
    context = spy.contexts[0]

    assert spy.names == ["tiny-1"]
    assert context.provider == ACME
    assert context.base_url == LOCAL_URL
    assert context.params == {"region": "eu"}
    assert context.key == "secret-value"
    assert model.model_name == "acme:tiny-1"


def test_a_custom_model_streams_text_deltas() -> None:
    models = custom_factory({ACME: ProviderOptions(factory=build_model)})

    text = asyncio.run(streamed_text(models.build(ACME_MODEL, settings=None), "hello"))

    assert text == f"{ECHO_PREFIX}hello"


def test_an_explicit_api_key_wins_over_the_environment() -> None:
    spy = FactorySpy()
    models = custom_factory({ACME: ProviderOptions(factory=spy, api_key_env=ACME_KEY_ENV)}, environ={ACME_KEY_ENV: "a"})

    models.build(ACME_MODEL, settings=None, api_key=SecretStr("b"))

    assert spy.contexts[0].key == "b"


def test_the_project_factory_wins_over_an_installed_package() -> None:
    project = FactorySpy()
    installed = FactorySpy()
    registry = ProviderRegistry(installed={ACME: CustomProvider(ACME, installed, source="package")})
    models = custom_factory({ACME: ProviderOptions(factory=project)}, registry=registry)

    models.build(ACME_MODEL, settings=None)

    assert project.names == ["tiny-1"]
    assert installed.names == []


def test_an_installed_package_wins_over_the_built_in_catalog() -> None:
    installed = FactorySpy()
    registry = ProviderRegistry(installed={"openrouter": CustomProvider("openrouter", installed, source="package")})
    models = custom_factory({}, registry=registry)

    models.build("openrouter:openai/gpt-oss-20b", settings=None)

    assert installed.names == ["openai/gpt-oss-20b"]


def test_an_entry_point_registers_a_packaged_adapter() -> None:
    registry = ProviderRegistry(installed={ACME: entry_point_provider(PACKAGE_ENTRY)})
    models = custom_factory({}, registry=registry)

    text = asyncio.run(streamed_text(models.build(ACME_MODEL, settings=None), "hi"))

    assert registry.names() == (ACME,)
    assert text == f"{ECHO_PREFIX}hi"


def test_an_entry_point_that_is_not_a_factory_reports_a_clear_error() -> None:
    registry = ProviderRegistry(installed={ACME: entry_point_provider(BROKEN_ENTRY)})
    models = custom_factory({}, registry=registry)

    with pytest.raises(ProviderMisconfigured) as error:
        models.build(ACME_MODEL, settings=None)

    assert "not a provider factory" in str(error.value)


def test_openai_compatible_streams_through_our_http_client_with_the_declared_base_url() -> None:
    recorder = Recorder([sse_reply(data_stream([chat_chunk({"content": "ok"}), chat_chunk({}, "stop")]))])
    options = ProviderOptions(factory=OPENAI_COMPATIBLE, base_url=LOCAL_URL, api_key_env=ACME_KEY_ENV)
    models = ProviderModelFactory(
        providers={ACME: options}, http_client=recorder.client, environ={ACME_KEY_ENV: API_KEY.get_secret_value()}
    )

    text = asyncio.run(streamed_text(models.build(ACME_MODEL, settings=None), "hi"))
    request = recorder.requests[0]

    assert text == "ok"
    assert str(request.url) == f"{LOCAL_URL}/chat/completions"
    assert request.headers["authorization"] == f"Bearer {API_KEY.get_secret_value()}"
    assert recorder.bodies()[0]["model"] == "tiny-1"


def test_openai_compatible_needs_a_base_url() -> None:
    models = custom_factory({ACME: ProviderOptions(factory=OPENAI_COMPATIBLE)})

    with pytest.raises(ProviderMisconfigured) as error:
        models.build(ACME_MODEL, settings=None)

    assert "base_url" in str(error.value)


def test_openai_compatible_does_not_retry_a_failed_request() -> None:
    recorder = Recorder([json_reply(429, {"error": "slow down"})])
    options = ProviderOptions(factory=OPENAI_COMPATIBLE, base_url=LOCAL_URL)
    models = ProviderModelFactory(providers={ACME: options}, http_client=recorder.client, environ={})

    with pytest.raises(ModelHTTPError):
        asyncio.run(streamed_text(models.build(ACME_MODEL, settings=None, api_key=API_KEY), "hi"))

    assert len(recorder.requests) == 1


def test_a_model_without_streaming_is_refused_when_it_is_built() -> None:
    models = custom_factory({ACME: ProviderOptions(factory=build_silent)})

    with pytest.raises(ProviderNoStreaming) as error:
        models.build(ACME_MODEL, settings=None)

    assert "aqven streams every model request" in str(error.value)


def test_an_unknown_provider_lists_the_known_names() -> None:
    models = custom_factory({ACME: ProviderOptions(factory=build_model)})

    with pytest.raises(UnknownProvider) as error:
        models.build("nowhere:model-1", settings=None)

    assert ACME in str(error.value)
    assert "openrouter" in str(error.value)


def test_keys_of_a_custom_provider_come_from_the_store_then_the_environment() -> None:
    keys = ProviderKeys(environ={ACME_KEY_ENV: "from-env"}, custom={ACME: ACME_KEY_ENV})
    keyless = ProviderKeys(environ={}, custom={ACME: None})

    assert asyncio.run(keys.key(ACME_MODEL)) == SecretStr("from-env")
    assert asyncio.run(keyless.key(ACME_MODEL)) is None


def test_a_valid_factory_passes_the_signature_check_and_reports_streaming() -> None:
    signature = factory_signature(build_model)

    assert signature.valid
    assert signature.streams is True


@pytest.mark.parametrize(
    ("value", "text"),
    [
        (build_async, "async"),
        (build_wrong_parameters, "parameters name, context"),
        (build_wrong_return, "the return type is str"),
        ("aqven", "not callable"),
    ],
)
def test_a_broken_factory_is_reported_with_a_hint(value: object, text: str) -> None:
    signature = factory_signature(value)

    assert not signature.valid
    assert text in signature.problems[0].message
    assert signature.problems[0].hint


def test_streaming_is_read_from_the_annotated_model_class() -> None:
    assert factory_signature(build_silent).streams is False
    assert factory_signature(build_any).streams is None
