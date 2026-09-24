from pathlib import Path
from typing import Final

from aqven.app.dotenv_secrets import load_project_env
from aqven.ports.settings import project_env_file

KEY: Final = "OPENROUTER_API_KEY"
FROM_FILE: Final = "sk-or-from-file"
FROM_SHELL: Final = "sk-or-from-shell"


def project_with_env(root: Path, text: str) -> Path:
    project_env_file(root).write_text(text, encoding="utf-8")
    return root


def test_an_empty_environment_variable_takes_the_project_env_value(tmp_path: Path) -> None:
    environ = {KEY: ""}

    assert load_project_env(project_with_env(tmp_path, f"{KEY}={FROM_FILE}\n"), environ) is True

    assert environ == {KEY: FROM_FILE}


def test_a_missing_environment_variable_takes_the_project_env_value(tmp_path: Path) -> None:
    environ: dict[str, str] = {}

    load_project_env(project_with_env(tmp_path, f"{KEY}={FROM_FILE}\n"), environ)

    assert environ == {KEY: FROM_FILE}


def test_a_non_empty_environment_variable_wins_over_the_project_env(tmp_path: Path) -> None:
    environ = {KEY: FROM_SHELL}

    load_project_env(project_with_env(tmp_path, f"{KEY}={FROM_FILE}\n"), environ)

    assert environ == {KEY: FROM_SHELL}


def test_an_empty_project_env_value_leaves_the_environment_as_it_is(tmp_path: Path) -> None:
    environ = {"AQVEN_TEST_EMPTY_BOTH": ""}

    assert load_project_env(project_with_env(tmp_path, f"{KEY}=\nAQVEN_TEST_EMPTY_BOTH=\n"), environ) is True

    assert environ == {"AQVEN_TEST_EMPTY_BOTH": ""}


def test_project_env_values_load_literally(tmp_path: Path) -> None:
    environ: dict[str, str] = {}

    load_project_env(project_with_env(tmp_path, "AQVEN_TEST_LITERAL=a$b${HOME}\n"), environ)

    assert environ == {"AQVEN_TEST_LITERAL": "a$b${HOME}"}


def test_without_a_project_env_the_environment_stays_as_it_is(tmp_path: Path) -> None:
    environ = {KEY: ""}

    assert load_project_env(tmp_path, environ) is False

    assert environ == {KEY: ""}
