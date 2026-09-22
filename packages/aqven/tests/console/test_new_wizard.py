import pytest

from aqven.console.new_wizard import WizardAnswers, should_run_wizard


def test_should_run_wizard_requires_a_real_tty(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr("sys.stdin.isatty", lambda: False)
    assert should_run_wizard(explicit_provider=None) is False


def test_should_run_wizard_skips_when_provider_flag_given(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr("sys.stdin.isatty", lambda: True)
    assert should_run_wizard(explicit_provider="openrouter") is False


def test_should_run_wizard_fires_on_a_real_tty_with_no_provider_flag(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr("sys.stdin.isatty", lambda: True)
    assert should_run_wizard(explicit_provider=None) is True
