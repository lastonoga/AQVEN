import json
import os
import subprocess
from dataclasses import dataclass, field
from pathlib import Path
from typing import Final

import pytest
from console_support import aqven_command, copy_fixture, json_lines

from aqven.app.options import ServerOptions
from aqven.cli import COMMANDS, ServerCommand, build_parser, main
from aqven.console import serve as serve_module
from aqven.console.project_env import PROJECT_ENV_FILE, load_project_env
from aqven.console.serve import SERVE_MODES, ServeMode

RUN_SECONDS: Final = 120
FILE_KEY: Final = "AQVEN_TEST_DOTENV_FILE_ONLY"
SHARED_KEY: Final = "AQVEN_TEST_DOTENV_SHARED"
DOTENV_TEXT: Final = f"{FILE_KEY}=from-file\n{SHARED_KEY}=from-file\nAQVEN_TEST_DOTENV_LITERAL=a$b${{HOME}}\n"


@dataclass(slots=True)
class ServeRecorder:
    calls: list[tuple[ServeMode, ServerOptions, str | None]] = field(
        default_factory=list[tuple[ServeMode, ServerOptions, str | None]]
    )

    def __call__(self, mode: ServeMode, base: ServerOptions) -> int:
        self.calls.append((mode, base, os.environ.get(FILE_KEY)))
        return 0


@pytest.fixture
def env_project(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    for key in (FILE_KEY, SHARED_KEY, "AQVEN_TEST_DOTENV_LITERAL"):
        monkeypatch.delenv(key, raising=False)
    root = copy_fixture("alias_shop", tmp_path)
    (root / PROJECT_ENV_FILE).write_text(DOTENV_TEXT, encoding="utf-8")
    return root


def run_cli(cwd: Path, *arguments: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        aqven_command(*arguments), cwd=cwd, capture_output=True, text=True, timeout=RUN_SECONDS, check=False
    )


def test_run_prints_streamed_events_without_a_server(tmp_path: Path) -> None:
    root = copy_fixture("alias_shop", tmp_path)
    note = tmp_path / "note.json"
    note.write_text(json.dumps({"text": "note from the terminal"}), encoding="utf-8")

    completed = run_cli(
        tmp_path, "run", "audit", "--root", str(root), "--input", str(note), "--format", "json", "--data-dir", "data"
    )

    events = json_lines(completed.stdout)
    assert completed.returncode == 0, completed.stderr
    assert [event["type"] for event in events][0] == "run_started"
    assert events[-1]["type"] == "run_finished"
    assert events[-1]["status"] == "completed"
    assert not (root / ".aqven" / "server.json").exists()


def test_run_reports_unknown_flow(tmp_path: Path) -> None:
    root = copy_fixture("alias_shop", tmp_path)
    note = tmp_path / "note.json"
    note.write_text(json.dumps({"text": "x"}), encoding="utf-8")

    completed = run_cli(tmp_path, "run", "ghost", "--root", str(root), "--input", str(note), "--data-dir", "data")

    assert completed.returncode == 1
    assert "ghost" in completed.stderr


def test_server_commands_share_local_server_options() -> None:
    parser = build_parser()

    studio = parser.parse_args(["studio", "--port", "5200", "--no-browser"])
    serve = parser.parse_args(["serve", "project", "--headless", "--data-dir", "d"])
    dev = parser.parse_args(["dev", "--dev-origin", "http://localhost:5174", "--studio-dist", "dist"])

    assert (studio.port, studio.no_browser, studio.path) == (5200, True, None)
    assert (serve.path, serve.headless, str(serve.data_dir)) == ("project", True, "d")
    assert (dev.dev_origin, str(dev.studio_dist)) == ("http://localhost:5174", "dist")


def test_local_server_defaults_to_no_auth_with_explicit_token_opt_in(
    env_project: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    recorder = ServeRecorder()
    monkeypatch.setattr(serve_module, "serve", recorder)

    assert main(["dev", str(env_project)]) == 0
    assert main(["dev", str(env_project), "--require-auth"]) == 0

    [(_, default_options, _), (_, protected_options, _)] = recorder.calls
    assert default_options.require_auth is False
    assert protected_options.require_auth is True


def test_optimize_stays_a_stub_while_eval_needs_a_project(tmp_path: Path) -> None:
    assert main(["optimize", str(tmp_path), "--eval", "quality"]) == 2
    assert main(["eval", str(tmp_path), "--eval", "quality"]) == 1


def test_dev_opens_studio_in_the_browser_and_studio_is_its_alias() -> None:
    dev = COMMANDS["dev"]
    studio = COMMANDS["studio"]

    assert isinstance(dev, ServerCommand) and isinstance(studio, ServerCommand)
    assert dev.mode == studio.mode
    mode = SERVE_MODES[dev.mode]
    assert mode.defaults.open_browser
    assert SERVE_MODES["serve"].defaults.open_browser is False
    assert mode.defaults.studio
    assert mode.watch
    assert "alias of dev" in studio.help


def test_project_env_fills_missing_variables_and_process_environment_wins(
    env_project: Path, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    monkeypatch.setenv(SHARED_KEY, "from-process")

    assert main(["tree", str(env_project)]) == 0

    capsys.readouterr()
    assert os.environ[FILE_KEY] == "from-file"
    assert os.environ[SHARED_KEY] == "from-process"
    assert os.environ["AQVEN_TEST_DOTENV_LITERAL"] == "a$b${HOME}"


def test_missing_env_file_loads_nothing(tmp_path: Path) -> None:
    assert load_project_env(tmp_path) is False


def test_dev_loads_the_project_env_before_the_server_starts(env_project: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    recorder = ServeRecorder()
    monkeypatch.setattr(serve_module, "serve", recorder)

    assert main(["dev", str(env_project), "--port", "5999"]) == 0

    [(mode, base, loaded)] = recorder.calls
    assert loaded == "from-file"
    assert base.root == env_project and base.port == 5999
    assert base.launches_browser
    assert mode.defaults.open_browser


def test_models_check_opens_the_project_and_reports_every_agent(
    env_project: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    assert main(["models", "check", "--project", str(env_project)]) == 0

    assert "output.mode: auto -> " in capsys.readouterr().out
    assert os.environ[FILE_KEY] == "from-file"


def test_models_requires_an_action(capsys: pytest.CaptureFixture[str]) -> None:
    assert main(["models"]) == 2

    assert "ACTION" in capsys.readouterr().err


def test_models_check_reports_a_missing_project(tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    assert main(["models", "check", "--project", str(tmp_path), "--json"]) == 1

    assert json.loads(capsys.readouterr().out)["diagnostics"][0]["code"] == "E_PROJECT_NOT_FOUND"


def test_new_parses_its_options(tmp_path: Path) -> None:
    arguments = build_parser().parse_args(
        ["new", str(tmp_path / "shop"), "--template", "minimal", "--package", "shop", "--no-sync", "--force"]
    )

    assert (str(arguments.target), arguments.template, arguments.package) == (str(tmp_path / "shop"), "minimal", "shop")
    assert (arguments.no_sync, arguments.force, arguments.aqven_path) == (True, True, None)


def test_dev_serves_without_studio_and_browser_when_the_env_switches_studio_off(
    env_project: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    recorder = ServeRecorder()
    monkeypatch.setattr(serve_module, "serve", recorder)
    monkeypatch.setenv("AQVEN_STUDIO", "false")

    assert main(["dev", str(env_project)]) == 0

    [(_, base, _)] = recorder.calls
    assert base.headless is True
    assert base.launches_browser is False


def test_dev_serves_studio_and_opens_the_browser_by_default(env_project: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    recorder = ServeRecorder()
    monkeypatch.setattr(serve_module, "serve", recorder)
    monkeypatch.delenv("AQVEN_STUDIO", raising=False)
    monkeypatch.delenv("AQVEN_OPEN_BROWSER", raising=False)

    assert main(["dev", str(env_project)]) == 0

    [(_, base, _)] = recorder.calls
    assert base.headless is False
    assert base.launches_browser is True
    assert base.port == 5180


def test_serve_keeps_the_browser_closed_unless_the_env_asks_for_it(
    env_project: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    recorder = ServeRecorder()
    monkeypatch.setattr(serve_module, "serve", recorder)
    monkeypatch.setenv("AQVEN_PORT", "5999")

    assert main(["serve", str(env_project)]) == 0
    monkeypatch.setenv("AQVEN_OPEN_BROWSER", "true")
    assert main(["serve", str(env_project)]) == 0

    [(_, closed, _), (_, opened, _)] = recorder.calls
    assert (closed.launches_browser, closed.port) == (False, 5999)
    assert opened.launches_browser is True


def test_explicit_cli_arguments_win_over_the_environment(env_project: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    recorder = ServeRecorder()
    monkeypatch.setattr(serve_module, "serve", recorder)
    monkeypatch.setenv("AQVEN_PORT", "5999")
    monkeypatch.setenv("AQVEN_OPEN_BROWSER", "true")

    assert main(["dev", str(env_project), "--port", "6001", "--no-browser"]) == 0

    [(_, base, _)] = recorder.calls
    assert (base.port, base.open_browser) == (6001, False)


def test_invalid_environment_value_stops_the_server_command(
    env_project: Path, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    recorder = ServeRecorder()
    monkeypatch.setattr(serve_module, "serve", recorder)
    monkeypatch.setenv("AQVEN_PORT", "many")

    code = main(["dev", str(env_project)])

    assert code == 2
    assert "AQVEN_PORT='many' is not a valid value" in capsys.readouterr().err
    assert recorder.calls == []
