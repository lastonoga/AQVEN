import pytest

from aqven.console.new_wizard import (
    PROVIDER_SHORTLIST,
    ask_budget_usd_micros,
    ask_pii,
    ask_provider,
    computed_max_parallel,
    run_wizard,
    should_run_wizard,
)


def test_should_run_wizard_requires_a_real_tty(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr("sys.stdin.isatty", lambda: False)
    assert should_run_wizard(explicit_provider=None) is False


def test_should_run_wizard_skips_when_provider_flag_given(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr("sys.stdin.isatty", lambda: True)
    assert should_run_wizard(explicit_provider="openrouter") is False


def test_should_run_wizard_fires_on_a_real_tty_with_no_provider_flag(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr("sys.stdin.isatty", lambda: True)
    assert should_run_wizard(explicit_provider=None) is True


def test_provider_shortlist_are_all_real_catalog_entries() -> None:
    from aqven_llm.catalog import PROVIDERS

    for provider_id in PROVIDER_SHORTLIST:
        assert provider_id in PROVIDERS


def test_ask_provider_picks_shortlist_entry_by_number(monkeypatch: pytest.MonkeyPatch) -> None:
    answers = iter(["1", ""])
    monkeypatch.setattr("builtins.input", lambda _prompt="": next(answers))
    provider_id, _, api_key = ask_provider()
    assert provider_id == PROVIDER_SHORTLIST[0]
    assert api_key is None


def test_ask_provider_accepts_a_pasted_key(monkeypatch: pytest.MonkeyPatch) -> None:
    answers = iter(["1", "sk-test-123"])
    monkeypatch.setattr("builtins.input", lambda _prompt="": next(answers))
    _, _, api_key = ask_provider()
    assert api_key == "sk-test-123"


def test_ask_provider_other_takes_a_typed_catalog_id(monkeypatch: pytest.MonkeyPatch) -> None:
    answers = iter([str(len(PROVIDER_SHORTLIST) + 1), "cerebras", ""])
    monkeypatch.setattr("builtins.input", lambda _prompt="": next(answers))
    provider_id, env_var, _ = ask_provider()
    assert provider_id == "cerebras"
    assert env_var == "CEREBRAS_API_KEY"


def test_ask_pii_yes(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr("builtins.input", lambda _prompt="": "y")
    assert ask_pii() is True


def test_ask_pii_default_is_no(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr("builtins.input", lambda _prompt="": "")
    assert ask_pii() is False


def test_ask_budget_skip_means_no_limit(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr("builtins.input", lambda _prompt="": "")
    assert ask_budget_usd_micros() is None


def test_ask_budget_converts_dollars_to_micros(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr("builtins.input", lambda _prompt="": "2.50")
    assert ask_budget_usd_micros() == 2_500_000


def test_computed_max_parallel_uses_cpu_count(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr("os.cpu_count", lambda: 8)
    assert computed_max_parallel() == 8


def test_computed_max_parallel_falls_back_when_cpu_count_is_none(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr("os.cpu_count", lambda: None)
    assert computed_max_parallel() == 4


def test_run_wizard_bundles_every_answer(monkeypatch: pytest.MonkeyPatch) -> None:
    answers = iter(["1", "", "n", ""])
    monkeypatch.setattr("builtins.input", lambda _prompt="": next(answers))
    monkeypatch.setattr("os.cpu_count", lambda: 4)
    result = run_wizard()
    assert result.provider_id == "openrouter"
    assert result.api_key is None
    assert result.allows_pii is False
    assert result.budget_usd_micros is None
    assert result.max_parallel == 4
