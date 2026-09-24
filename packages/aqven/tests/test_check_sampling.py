from pathlib import Path
from typing import Final

import pytest

from aqven.check import check_project
from aqven.check.sampling import ignored_sampling
from aqven.codegen import generate_types
from aqven.diagnostics import Diagnostic, DiagnosticCode, Severity, format_text
from aqven.spec import ModelSettingsSpec
from aqven.testing import copy_project

FIXTURE: Final = Path(__file__).parent / "fixtures" / "fixture_shop"
WRITER: Final = "shared/writer.yaml"
WRITER_MODEL: Final = 'model: "openai:gpt-5.4-mini"'
EVERY_SETTING: Final = ModelSettingsSpec(temperature=0.1, top_p=0.9, max_tokens=4000, seed=7)


@pytest.fixture
def shop(tmp_path: Path) -> Path:
    root = copy_project(FIXTURE, tmp_path)
    generate_types(root)
    return root


def replace(root: Path, relative: str, old: str, new: str) -> None:
    target = root / relative
    source = target.read_text(encoding="utf-8")
    assert source.count(old) == 1, old
    target.write_text(source.replace(old, new), encoding="utf-8")


def ignored(root: Path) -> list[Diagnostic]:
    return [item for item in check_project(root).diagnostics if item.code is DiagnosticCode.W_SAMPLING_IGNORED]


@pytest.mark.parametrize(
    ("model", "expected"),
    [
        ("openrouter:openai/gpt-5-nano", ("temperature", "top_p")),
        ("openai:o3-mini", ("temperature", "top_p")),
        ("openai:gpt-5.1", ()),
        ("openai:gpt-4o", ()),
        ("openrouter:openai/gpt-oss-20b", ()),
        ("openrouter:google/gemini-2.5-flash-lite", ()),
        ("openrouter:no-vendor-prefix", ()),
    ],
)
def test_the_pydantic_ai_profile_decides_which_sampling_settings_are_dropped(
    model: str, expected: tuple[str, ...]
) -> None:
    assert ignored_sampling(model, EVERY_SETTING) == expected


def test_an_agent_without_settings_has_nothing_to_drop() -> None:
    assert ignored_sampling("openrouter:openai/gpt-5-nano", None) == ()


def test_check_warns_when_a_reasoning_model_ignores_the_temperature(shop: Path) -> None:
    replace(shop, WRITER, WRITER_MODEL, 'model: "openai:gpt-5-nano"')

    report = check_project(shop)
    (warning,) = [item for item in report.diagnostics if item.code is DiagnosticCode.W_SAMPLING_IGNORED]

    assert (warning.file, warning.path, warning.severity) == (WRITER, ("settings", "temperature"), Severity.WARNING)
    assert warning.message == "temperature is ignored by openai:gpt-5-nano (reasoning model); remove it"
    assert warning.hint is not None and "temperature" in warning.hint
    assert warning.line is not None
    head = f"{WRITER}:{warning.line}:{warning.column}: warning W_SAMPLING_IGNORED settings.temperature"
    assert format_text((warning,)).splitlines()[0] == f"{head}: {warning.message}"


def test_check_keeps_quiet_for_a_model_that_reasons_only_on_request(shop: Path) -> None:
    assert ignored(shop) == []


def test_check_names_the_fallback_model_that_ignores_the_settings(shop: Path) -> None:
    replace(shop, WRITER, WRITER_MODEL, 'model: "openai:gpt-4o"\nfallback_models:\n- "openai:o3-mini"')
    replace(shop, WRITER, "  temperature: 0.2", "  temperature: 0.2\n  top_p: 0.9")

    found = sorted((item.path, item.message) for item in ignored(shop))

    assert found == [
        (("settings", "temperature"), "temperature is ignored by openai:o3-mini (reasoning model); remove it"),
        (("settings", "top_p"), "top_p is ignored by openai:o3-mini (reasoning model); remove it"),
    ]
