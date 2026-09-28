from importlib.util import find_spec
from pathlib import Path
from typing import Final

import pytest
from pydantic import JsonValue

from aqven.check import check_project
from aqven.check.provider_options import ignored_options
from aqven.codegen import generate_types
from aqven.diagnostics import Diagnostic, DiagnosticCode, Severity, format_text
from aqven.testing import copy_project

FIXTURE: Final = Path(__file__).parent / "fixtures" / "fixture_shop"
WRITER: Final = "shared/writer.yaml"
WRITER_MODEL: Final = 'model: "openai:gpt-5.4-mini"'
WRITER_SETTINGS: Final = "  temperature: 0.2"
GOOGLE_PROVIDER: Final = """- id: "google"
  data_policy:
    allows_pii: true
    allows_sensitive: false
    retention: "zero"
"""
PROVIDERS_HEAD: Final = "providers:\n"


@pytest.fixture
def shop(tmp_path: Path) -> Path:
    root = copy_project(FIXTURE, tmp_path)
    generate_types(root)
    replace(root, "aqven.yaml", PROVIDERS_HEAD, PROVIDERS_HEAD + GOOGLE_PROVIDER)
    return root


def replace(root: Path, relative: str, old: str, new: str) -> None:
    target = root / relative
    source = target.read_text(encoding="utf-8")
    assert source.count(old) == 1, old
    target.write_text(source.replace(old, new), encoding="utf-8")


def ignored(root: Path) -> list[Diagnostic]:
    return [item for item in check_project(root).diagnostics if item.code is DiagnosticCode.W_PROVIDER_OPTIONS_IGNORED]


def with_options(root: Path, *lines: str) -> None:
    block = "\n".join(("  provider_options:", *(f"    {line}" for line in lines)))
    replace(root, WRITER, WRITER_SETTINGS, f"{WRITER_SETTINGS}\n{block}")


@pytest.mark.parametrize(
    ("model", "options", "keys"),
    [
        ("google:gemini-2.5-flash", {"thinking_config": {"thinking_budget": 0}}, None),
        ("google:gemini-2.5-flash", {"reasoning_effort": "low", "top_k": 20}, ("reasoning_effort",)),
        ("google:gemini-2.5-flash", {"logprobs": 3}, ("logprobs",)),
        pytest.param(
            "mistral:mistral-small-latest",
            {"reasoning_effort": "none"},
            None,
            marks=pytest.mark.skipif(
                find_spec("mistralai") is None,
                reason="the adjustable reasoning of mistral-small comes from the mistral provider profile, "
                "which needs the mistral extra",
            ),
        ),
        ("mistral:mistral-small-latest", {"reasoning_effort": "low"}, ("reasoning_effort",)),
        ("mistral:magistral-medium-latest", {"reasoning_effort": "high"}, ("reasoning_effort",)),
        ("xai:grok-4.3", {"reasoning_effort": "low", "search_parameters": {}}, ("search_parameters",)),
        ("bedrock:us.anthropic.claude-sonnet-5-v1:0", {"thinking": {"type": "disabled"}}, None),
        ("cohere:command-a", {"thinking": {"type": "disabled"}}, ("thinking",)),
        ("openai-chat:gpt-5-mini", {"anything": True}, None),
        ("local:served-model", {"anything": True}, None),
    ],
)
def test_the_provider_decides_which_options_reach_the_request(
    model: str, options: dict[str, JsonValue], keys: tuple[str, ...] | None
) -> None:
    found = ignored_options(model, options)

    assert (None if found is None else found.keys) == keys


def test_no_options_means_nothing_to_ignore() -> None:
    assert ignored_options("cohere:command-a", {}) is None


def test_check_warns_when_google_does_not_send_a_key(shop: Path) -> None:
    replace(shop, WRITER, WRITER_MODEL, 'model: "google:gemini-2.5-flash"')
    with_options(shop, 'reasoning_effort: "low"', "thinking_config:", "  thinking_budget: 0")

    (warning,) = ignored(shop)

    assert (warning.file, warning.path, warning.severity) == (
        WRITER,
        ("settings", "provider_options"),
        Severity.WARNING,
    )
    assert warning.message.startswith(
        "agent writer: model google:gemini-2.5-flash does not send settings.provider_options reasoning_effort: "
        "provider google takes only thinking_config, "
    )
    assert warning.hint is not None and "google" in warning.hint
    assert warning.line is not None
    head = f"{WRITER}:{warning.line}:{warning.column}: warning W_PROVIDER_OPTIONS_IGNORED settings.provider_options"
    assert format_text((warning,)).splitlines()[0].startswith(head)


def test_check_keeps_quiet_when_every_key_reaches_the_request(shop: Path) -> None:
    with_options(shop, 'reasoning_effort: "minimal"')

    assert ignored(shop) == []


def test_check_names_the_fallback_model_that_does_not_send_the_options(shop: Path) -> None:
    replace(shop, WRITER, WRITER_MODEL, f'{WRITER_MODEL}\nfallback_models:\n- "google:gemini-2.5-flash"')
    with_options(shop, 'reasoning_effort: "minimal"')

    (warning,) = ignored(shop)

    assert warning.path == ("fallback_models", 0)
    assert "model google:gemini-2.5-flash does not send settings.provider_options reasoning_effort" in warning.message
