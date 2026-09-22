import pytest

from aqven.console.new_wizard import PROVIDER_SHORTLIST, WizardAnswers, ask_provider, should_run_wizard


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
    provider_id, env_var, api_key = ask_provider()
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
