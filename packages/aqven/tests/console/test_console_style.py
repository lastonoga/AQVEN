import pytest

from aqven.console import style


def test_colors_are_stripped_when_stderr_is_not_a_tty(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(style.sys.stderr, "isatty", lambda: False)
    assert style.bold("aqven") == "aqven"
    assert style.cyan("http://127.0.0.1:5180") == "http://127.0.0.1:5180"


def test_colors_are_stripped_when_no_color_is_set(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(style.sys.stderr, "isatty", lambda: True)
    monkeypatch.setenv("NO_COLOR", "1")
    assert style.green("ok") == "ok"


def test_colors_wrap_the_text_in_ansi_codes_when_enabled(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(style.sys.stderr, "isatty", lambda: True)
    monkeypatch.delenv("NO_COLOR", raising=False)
    assert style.red("errors: 1") == "\x1b[31merrors: 1\x1b[0m"
