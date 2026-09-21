from functools import partial
from pathlib import Path
from typing import Final

import pytest

from aqven.check import RULES, check_project
from aqven.check.providers import check_providers, model_diagnostics, provider_diagnostics
from aqven.diagnostics import DiagnosticCode, Severity
from aqven.loader import load_project
from aqven.testing import copy_project
from aqven_llm import PROVIDERS, ClassRef, ProviderSupport, Readiness, provider_support

FIXTURE: Final = Path(__file__).parent / "fixtures" / "fixture_shop"
WRITER: Final = "shared/writer.yaml"
AGENT_FILE: Final = "agents/assistant.yaml"
PROVIDER_CODES: Final = frozenset({DiagnosticCode.E_PROVIDER_EXTRA_MISSING, DiagnosticCode.E_PROVIDER_NO_STREAMING})
FAKE_CLASS: Final = ClassRef("pydantic_ai.models.fake", "FakeModel")


def missing(_: str) -> bool:
    return False


def scripted(provider: str) -> ProviderSupport | None:
    readiness = {"anthropic": Readiness.EXTRA_MISSING, "google": Readiness.NO_STREAMING}.get(provider, Readiness.READY)
    extra = provider if readiness is Readiness.EXTRA_MISSING else None
    return ProviderSupport(provider, readiness, FAKE_CLASS, extra)


def test_rule_runs_in_the_check_pipeline() -> None:
    assert check_providers in RULES


def test_clean_fixture_has_no_provider_diagnostics() -> None:
    report = check_project(FIXTURE)

    assert not {item.code for item in report.diagnostics} & PROVIDER_CODES


def test_every_model_and_fallback_model_is_checked(tmp_path: Path) -> None:
    root = copy_project(FIXTURE, tmp_path)
    writer = root / WRITER
    source = writer.read_text(encoding="utf-8")
    fallbacks = (
        'model: "anthropic:claude-sonnet-5"\nfallback_models:\n- "openai:gpt-5.4-mini"\n- "google:gemini-3.8-flash"\n'
    )
    writer.write_text(source.replace('model: "openai:gpt-5.4-mini"\n', fallbacks), encoding="utf-8")
    loaded = load_project(root).project
    assert loaded is not None

    found = [(item.code, item.file, item.path, item.hint) for item in provider_diagnostics(loaded, scripted)]

    assert found == [
        (DiagnosticCode.E_PROVIDER_EXTRA_MISSING, WRITER, ("model",), 'install the extra: uv add "aqven[anthropic]"'),
        (
            DiagnosticCode.E_PROVIDER_NO_STREAMING,
            WRITER,
            ("fallback_models", 1),
            "choose a model of a provider with streaming support",
        ),
    ]


def test_cohere_is_reported_as_a_provider_without_streaming() -> None:
    found = model_diagnostics(
        AGENT_FILE, ("model",), "cohere:command-a-03-2025", partial(provider_support, finder=missing)
    )

    assert [(item.code, item.severity) for item in found] == [(DiagnosticCode.E_PROVIDER_NO_STREAMING, Severity.ERROR)]
    assert "cohere" in found[0].message


@pytest.mark.parametrize("provider", [name for name, entry in PROVIDERS.items() if entry.extra and name != "cohere"])
def test_missing_extra_names_the_install_command(provider: str) -> None:
    extra = PROVIDERS[provider].extra
    assert extra is not None

    found = model_diagnostics(
        AGENT_FILE, ("fallback_models", 0), f"{provider}:some-model", partial(provider_support, finder=missing)
    )

    assert [item.code for item in found] == [DiagnosticCode.E_PROVIDER_EXTRA_MISSING]
    assert found[0].hint is not None
    assert f"aqven[{extra.name}]" in found[0].hint
    assert found[0].path == ("fallback_models", 0)


def test_unknown_provider_is_left_to_the_registry_rule() -> None:
    assert model_diagnostics(AGENT_FILE, ("model",), "mystery:model", provider_support) == ()


def test_check_builds_no_model_client(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    def refuse(*_: object, **__: object) -> None:
        raise AssertionError("aqven check must not build model clients")

    monkeypatch.setattr("aqven_llm.factory.ProviderModelFactory.build", refuse)
    monkeypatch.setattr("aqven_llm.factory.default_http_client", refuse)

    report = check_project(copy_project(FIXTURE, tmp_path))

    assert report.ok
