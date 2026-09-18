import tomllib
from pathlib import Path
from typing import Final

import aqven_llm.factory
from aqven_llm import PROVIDERS

PACKAGE_ROOT: Final = Path(__file__).resolve().parents[1]
WORKSPACE_ROOT: Final = PACKAGE_ROOT.parents[1]
PROVIDER_MESSAGE: Final = "Provider imports live only in aqven_llm (ADR-0025)."

type BanTable = dict[str, dict[str, str]]


def _root_bans() -> BanTable:
    document = tomllib.loads((WORKSPACE_ROOT / "pyproject.toml").read_text())
    return document["tool"]["ruff"]["lint"]["flake8-tidy-imports"]["banned-api"]


def _package_bans() -> BanTable:
    document = tomllib.loads((PACKAGE_ROOT / "src" / "aqven_llm" / "ruff.toml").read_text())
    return document["lint"]["flake8-tidy-imports"]["banned-api"]


def test_package_bans_repeat_every_shared_ban() -> None:
    shared = {name: entry for name, entry in _root_bans().items() if entry["msg"] != PROVIDER_MESSAGE}

    assert _package_bans() == shared


PROVIDER_SDKS: Final = frozenset(
    {
        "openai",
        "anthropic",
        "google.genai",
        "groq",
        "mistralai",
        "cohere",
        "boto3",
        "botocore",
        "xai_sdk",
        "huggingface_hub",
    }
)


def test_root_bans_cover_provider_modules() -> None:
    provider_modules = {name for name, entry in _root_bans().items() if entry["msg"] == PROVIDER_MESSAGE}

    assert provider_modules >= PROVIDER_SDKS
    assert provider_modules >= {"pydantic_ai.providers", "pydantic_ai.models.openrouter"}


def test_root_bans_cover_every_catalog_model_module() -> None:
    banned = {name for name, entry in _root_bans().items() if entry["msg"] == PROVIDER_MESSAGE}
    modules = {entry.model_class.module for entry in PROVIDERS.values()}

    assert modules <= banned


def test_factory_module_imports() -> None:
    assert aqven_llm.factory.__name__ == "aqven_llm.factory"
