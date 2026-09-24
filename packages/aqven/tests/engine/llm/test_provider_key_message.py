import asyncio
from typing import Final

import pytest

from aqven.engine.assembly import ProviderKeys
from aqven.engine.llm.errors import LlmFailureCode, LlmNodeError

MODEL: Final = "openrouter:qwen/qwen3.8-max-0902"
BASE_MESSAGE: Final = (
    f"no API key for provider openrouter ({MODEL}): set OPENROUTER_API_KEY in the project .env or the environment"
)


def missing_key(environ: dict[str, str]) -> LlmNodeError:
    with pytest.raises(LlmNodeError) as caught:
        asyncio.run(ProviderKeys(None, environ).key(MODEL, replay=False))
    return caught.value


def test_an_empty_key_variable_is_named_in_the_error() -> None:
    error = missing_key({"OPENROUTER_API_KEY": ""})

    assert error.code == LlmFailureCode.PROVIDER_KEY_MISSING
    assert str(error) == (
        f"{BASE_MESSAGE}; OPENROUTER_API_KEY is set to an empty string in the environment, which counts as unset, "
        "and the project .env has no value for it"
    )


def test_an_absent_key_variable_keeps_the_plain_error() -> None:
    assert str(missing_key({})) == BASE_MESSAGE
