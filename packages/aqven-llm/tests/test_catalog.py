import importlib
from typing import Final

import pytest
from llm_wire import API_KEY
from pydantic_ai.models import Model, infer_model

from aqven_llm import (
    MODEL_BUILDERS,
    PROVIDERS,
    ClassRef,
    ProviderModelFactory,
    ProviderOptions,
    Readiness,
    provider_support,
)
from aqven_llm.support import imported_streams, module_available, source_streams

LOCAL_BASE_URL: Final = "http://127.0.0.1:9/v1"
BASE_URL_ENV: Final = {"ollama": "OLLAMA_BASE_URL", "vllm": "VLLM_BASE_URL", "litellm": "LITELLM_API_BASE"}
MODEL_NAMES: Final = {"openrouter": "openai/gpt-oss-20b"}
DEFAULT_MODEL_NAME: Final = "some-model"
STREAMING_PROVIDERS: Final = tuple(name for name in PROVIDERS if name != "cohere")


def installed(name: str) -> bool:
    extra = PROVIDERS[name].extra
    return extra is None or module_available(extra.module)


def model_class(ref: ClassRef) -> type:
    loaded: object = getattr(importlib.import_module(ref.module), ref.name)
    assert isinstance(loaded, type)
    assert Model in loaded.__mro__
    return loaded


def model_string(name: str) -> str:
    return f"{name}:{MODEL_NAMES.get(name, DEFAULT_MODEL_NAME)}"


def test_every_streaming_provider_has_a_builder() -> None:
    assert set(MODEL_BUILDERS) == set(STREAMING_PROVIDERS)


def test_cohere_is_reported_as_not_streaming() -> None:
    support = provider_support("cohere")

    assert support is not None
    assert support.readiness is Readiness.NO_STREAMING


def test_unknown_provider_has_no_support_entry() -> None:
    assert provider_support("mystery") is None


@pytest.mark.parametrize("name", list(PROVIDERS))
def test_source_probe_agrees_with_the_imported_class(name: str) -> None:
    ref = PROVIDERS[name].model_class
    if not installed(name):
        pytest.skip(f"{name} extra is not installed")

    assert source_streams(ref) is imported_streams(ref)


@pytest.mark.parametrize("name", [name for name in PROVIDERS if PROVIDERS[name].extra is not None])
def test_missing_extra_is_reported_with_its_install_hint(name: str) -> None:
    if installed(name) or name == "cohere":
        pytest.skip(f"{name} is installed or never streams")

    support = provider_support(name)

    assert support is not None
    assert support.readiness is Readiness.EXTRA_MISSING
    assert support.hint == f'uv add "aqven[{name}]"'


@pytest.mark.parametrize("name", STREAMING_PROVIDERS)
def test_catalog_model_class_matches_the_pydantic_ai_registry(name: str, monkeypatch: pytest.MonkeyPatch) -> None:
    if not installed(name):
        pytest.skip(f"{name} extra is not installed")
    entry = PROVIDERS[name]
    for env_var in entry.key.env:
        monkeypatch.setenv(env_var, API_KEY.get_secret_value())
    if name in BASE_URL_ENV:
        monkeypatch.setenv(BASE_URL_ENV[name], LOCAL_BASE_URL)
    declared = model_class(entry.model_class)
    options = {name: ProviderOptions(base_url=LOCAL_BASE_URL)} if name in BASE_URL_ENV else {}

    registry = infer_model(model_string(name))
    built = ProviderModelFactory(providers=options, environ={}).build(
        model_string(name), settings=None, api_key=API_KEY
    )

    assert type(registry) is declared
    assert isinstance(built, declared)
