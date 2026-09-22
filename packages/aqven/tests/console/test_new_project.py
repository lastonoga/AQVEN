import json
import os
import subprocess
import sys
import tomllib
from collections.abc import Sequence
from dataclasses import dataclass, field
from pathlib import Path, PurePosixPath
from typing import Final

import pytest

from aqven.cli import main
from aqven.codegen import GENERATED_HEADER, GENERATED_TYPES
from aqven.console.new import NewProjectRequest, ProjectCreator, aqven_requirement, create_project
from aqven.console.new_wizard import WizardAnswers
from aqven.console.project_template import (
    TEMPLATE_SUFFIX,
    TEMPLATES,
    RenderedFile,
    RenderedProject,
    TemplateValues,
)

AQVEN_PACKAGE: Final = Path(__file__).resolve().parents[2]
RUN_SECONDS: Final = 300
PACKAGE: Final = "demo_shop"
MODULE: Final = PACKAGE
TOKENS: Final = ("__package__", "__project__", "__aqven_requirement__", "__uv_sources__")
FAKE_UV: Final = "/opt/uv/bin/uv"


def run_python(cwd: Path, *arguments: str) -> subprocess.CompletedProcess[str]:
    environment = {key: value for key, value in os.environ.items() if key != "PYTHONPATH"}
    return subprocess.run(
        (sys.executable, *arguments),
        cwd=cwd,
        env={**environment, "PYDANTIC_AI_NO_BANNER": "1"},
        capture_output=True,
        text=True,
        timeout=RUN_SECONDS,
        check=False,
    )


@pytest.fixture(scope="module")
def created(tmp_path_factory: pytest.TempPathFactory) -> Path:
    workspace = tmp_path_factory.mktemp("new")
    completed = run_python(
        workspace, "-m", "aqven", "new", "demo-shop", "--aqven-path", str(AQVEN_PACKAGE), "--no-sync", "--with-tests"
    )
    assert completed.returncode == 0, completed.stderr
    assert "uv run aqven dev demo_shop" in completed.stdout
    return workspace / "demo-shop"


def test_new_writes_the_standard_layout(created: Path) -> None:
    module = created / MODULE
    expected = (
        ".gitignore",
        ".mcp.json",
        "AGENTS.md",
        "CLAUDE.md",
        "pyproject.toml",
        "tests/test_answer_question.py",
        f"{MODULE}/__init__.py",
        f"{MODULE}/__main__.py",
        f"{MODULE}/app.py",
        f"{MODULE}/.env.example",
        f"{MODULE}/aqven.yaml",
        f"{MODULE}/agents/assistant.yaml",
        f"{MODULE}/tools/count_words.yaml",
        f"{MODULE}/tools/functions.py",
        f"{MODULE}/types/enums/tone.yaml",
        f"{MODULE}/types/records/question.yaml",
        f"{MODULE}/types/records/answer.yaml",
        f"{MODULE}/flows/answer_question/flow.yaml",
        f"{MODULE}/flows/answer_question/nodes/prepare/prepare.node.yaml",
        f"{MODULE}/flows/answer_question/nodes/prepare/prepare.py",
        f"{MODULE}/flows/answer_question/nodes/reply/reply.node.yaml",
        f"{MODULE}/flows/answer_question/nodes/reply/reply.inference.yaml",
        f"{MODULE}/flows/answer_question/nodes/reply/reply.prompt.md",
        f"{MODULE}/{GENERATED_TYPES}",
    )

    assert [path for path in expected if not (created / path).is_file()] == []
    assert not (module / "types" / "__init__.py").exists()
    assert (module / GENERATED_TYPES).read_text(encoding="utf-8").splitlines()[0] == GENERATED_HEADER
    written = [path for path in created.rglob("*") if path.is_file() and "__pycache__" not in path.parts]
    leftovers = [
        path for path in written if path.suffix == TEMPLATE_SUFFIX or any(token in path.read_text() for token in TOKENS)
    ]
    assert leftovers == []


def test_new_writes_project_settings_for_uv_git_and_agents(created: Path) -> None:
    manifest = tomllib.loads((created / "pyproject.toml").read_text(encoding="utf-8"))
    ignored = (created / ".gitignore").read_text(encoding="utf-8").splitlines()
    servers = json.loads((created / ".mcp.json").read_text(encoding="utf-8"))["mcpServers"]
    agents = (created / "AGENTS.md").read_text(encoding="utf-8")
    project_file = (created / MODULE / "aqven.yaml").read_text(encoding="utf-8")
    agent_file = (created / MODULE / "agents" / "assistant.yaml").read_text(encoding="utf-8")

    assert manifest["project"]["name"] == "demo-shop"
    assert manifest["project"]["requires-python"] == ">=3.14,<3.15"
    assert manifest["project"]["dependencies"] == [aqven_requirement()]
    assert manifest["tool"]["uv"]["sources"]["aqven"] == {"path": AQVEN_PACKAGE.as_posix(), "editable": True}
    assert manifest["tool"]["pytest"]["ini_options"]["aqven_project"] == MODULE
    assert {".env", ".aqven/", f"{MODULE}/types.py"} <= set(ignored)
    environment = (created / MODULE / ".env.example").read_text(encoding="utf-8").splitlines()
    assert environment[0] == "OPENROUTER_API_KEY="
    defaults = {"AQVEN_STUDIO=true", "AQVEN_HOST=127.0.0.1", "AQVEN_PORT=5180", "AQVEN_OPEN_BROWSER=false"}
    assert defaults <= set(environment)
    assert servers["aqven"] == {"type": "stdio", "command": "uv", "args": ["run", "aqven", "mcp", MODULE]}
    assert (created / "CLAUDE.md").read_text(encoding="utf-8").startswith("@AGENTS.md\n")
    assert all(rule in agents for rule in ("aqven check", "flow_patch", "types.py", ".env"))
    assert 'id: "openrouter"' in project_file and "ref:env/OPENROUTER_API_KEY" in project_file
    assert 'model: "openrouter:openai/gpt-oss-20b"' in agent_file and "mode:" not in agent_file


def test_created_project_checks_and_regenerates_its_models(created: Path) -> None:
    generated = created / MODULE / GENERATED_TYPES
    generated.unlink()

    generate = run_python(created, "-m", "aqven", "generate", MODULE)
    check = run_python(created, "-m", "aqven", "check", MODULE)

    assert generate.returncode == 0, generate.stdout + generate.stderr
    assert generated.is_file()
    assert check.returncode == 0, check.stdout + check.stderr
    assert "errors: 0," in check.stdout


def test_created_project_imports_its_generated_models(created: Path) -> None:
    probe = (
        "import types, sys; from demo_shop.types import Answer, CountWordsOut, Question, AnswerQuestionPrepareOut; "
        "print(Question(text='hi', tone='formal').tone, CountWordsOut(words=2).words, types.SimpleNamespace.__module__)"
    )

    completed = run_python(created, "-c", f"import sys; sys.path.insert(0, '.'); {probe}")

    assert completed.returncode == 0, completed.stderr
    assert completed.stdout.split() == ["formal", "2", "types"]


def test_created_project_passes_its_offline_test(created: Path) -> None:
    completed = run_python(created, "-m", "pytest", "-q", "-p", "no:cacheprovider")

    assert completed.returncode == 0, completed.stdout + completed.stderr
    assert "1 passed" in completed.stdout


def test_new_refuses_a_folder_that_is_not_empty_unless_forced(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    target = tmp_path / "shop"
    target.mkdir()
    (target / "notes.txt").write_text("keep", encoding="utf-8")

    refused = main(["new", str(target), "--no-sync"])
    refusal = capsys.readouterr().err
    written_when_refused = (target / "pyproject.toml").exists()
    forced = main(["new", str(target), "--no-sync", "--force"])

    assert refused == 1
    assert "is not empty; pass --force" in refusal
    assert not written_when_refused
    assert forced == 0
    assert (target / "notes.txt").read_text(encoding="utf-8") == "keep"
    assert (target / "shop" / GENERATED_TYPES).is_file()


def test_new_derives_the_package_from_the_folder_name(tmp_path: Path) -> None:
    target = tmp_path / "My Shop-2"

    assert create_project(NewProjectRequest(target=target, sync=False)) == 0

    manifest = tomllib.loads((target / "pyproject.toml").read_text(encoding="utf-8"))
    assert manifest["project"]["name"] == "my-shop-2"
    assert "sources" not in manifest["tool"]["uv"]
    assert (target / "my_shop_2" / "aqven.yaml").is_file()


@pytest.mark.parametrize(
    ("package", "problem"),
    [
        ("class", "is a Python keyword"),
        ("json", "shadows a module of the Python standard library"),
        ("aqven", "is reserved by aqven"),
        ("Shop", "must start with a lowercase letter"),
    ],
)
def test_new_rejects_bad_package_names(
    tmp_path: Path, capsys: pytest.CaptureFixture[str], package: str, problem: str
) -> None:
    code = main(["new", str(tmp_path / "shop"), "--package", package, "--no-sync"])

    assert code == 2
    assert problem in capsys.readouterr().err
    assert not (tmp_path / "shop").exists()


def test_new_asks_for_a_package_when_the_folder_name_is_not_one(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    assert main(["new", str(tmp_path / "2026"), "--no-sync"]) == 2

    assert "pass a valid name with --package" in capsys.readouterr().err


def test_new_rejects_an_aqven_path_without_a_package(tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    assert main(["new", str(tmp_path / "shop"), "--aqven-path", str(tmp_path), "--no-sync"]) == 1

    assert "has no pyproject.toml" in capsys.readouterr().err


@dataclass(slots=True)
class RecordingRunner:
    exit_code: int = 0
    calls: list[tuple[tuple[str, ...], Path, bool]] = field(default_factory=list[tuple[tuple[str, ...], Path, bool]])

    def run(self, command: Sequence[str], cwd: Path) -> int:
        self.calls.append((tuple(command), cwd, (cwd / "shop" / GENERATED_TYPES).exists()))
        return self.exit_code


def fake_uv(name: str) -> str | None:
    return FAKE_UV


def no_uv(name: str) -> str | None:
    return None


def test_new_syncs_the_environment_before_generating_models(tmp_path: Path) -> None:
    runner = RecordingRunner()
    target = tmp_path / "shop"

    code = ProjectCreator(runner=runner, locate=fake_uv).create(NewProjectRequest(target=target))

    assert code == 0
    assert runner.calls == [((FAKE_UV, "sync"), target, False)]
    assert (target / "shop" / GENERATED_TYPES).is_file()


def test_new_reports_a_failed_sync(tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    creator = ProjectCreator(runner=RecordingRunner(exit_code=3), locate=fake_uv)

    assert creator.create(NewProjectRequest(target=tmp_path / "shop")) == 1

    assert "uv sync failed with exit code 3" in capsys.readouterr().err
    assert not (tmp_path / "shop" / "shop" / GENERATED_TYPES).exists()


def test_new_reports_missing_uv(tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    creator = ProjectCreator(runner=RecordingRunner(), locate=no_uv)

    assert creator.create(NewProjectRequest(target=tmp_path / "shop")) == 1

    assert "uv is not on PATH: install uv or rerun with --no-sync" in capsys.readouterr().err


@dataclass(frozen=True, slots=True)
class SingleFileTemplate:
    name: str = "single"
    description: str = "one project file"

    def render(self, values: TemplateValues) -> RenderedProject:
        project = RenderedFile(
            PurePosixPath(values.package, "aqven.yaml"),
            f'apiVersion: "aqven/v1"\nkind: "Project"\ndescription: "single"\npackage: "{values.package}"\n'
            'providers:\n- id: "openrouter"\n  api_key: "ref:env/OPENROUTER_API_KEY"\n'
            '  data_policy:\n    allows_pii: false\n    allows_sensitive: false\n    retention: "unknown"\n',
        )
        return RenderedProject(files=(project,), module_root=PurePosixPath(values.package))


def test_templates_are_strategies(tmp_path: Path) -> None:
    creator = ProjectCreator(templates={**TEMPLATES, "single": SingleFileTemplate()})
    target = tmp_path / "solo"

    code = creator.create(NewProjectRequest(target=target, template="single", sync=False))

    assert code == 0
    assert sorted(path.relative_to(target).as_posix() for path in target.rglob("*") if path.is_file()) == [
        "solo/aqven.yaml"
    ]


def test_unknown_template_lists_the_available_ones(tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    assert create_project(NewProjectRequest(target=tmp_path / "shop", template="huge", sync=False)) == 2

    available = ", ".join(sorted(TEMPLATES))
    assert f"unknown template 'huge'; available templates: {available}" in capsys.readouterr().err


def test_tests_are_created_only_when_asked(tmp_path: Path) -> None:
    without = tmp_path / "plain"
    with_tests = tmp_path / "tested"

    assert create_project(NewProjectRequest(target=without, sync=False)) == 0
    assert create_project(NewProjectRequest(target=with_tests, sync=False, with_tests=True)) == 0

    assert not (without / "tests").exists()
    assert (with_tests / "tests" / "test_answer_question.py").is_file()


def test_provider_flag_writes_the_real_key_variable_and_skips_the_wizard(
    tmp_path_factory: pytest.TempPathFactory,
) -> None:
    workspace = tmp_path_factory.mktemp("flagged")
    completed = run_python(
        workspace,
        "-m",
        "aqven",
        "new",
        "flagged-project",
        "--provider",
        "anthropic",
        "--aqven-path",
        str(AQVEN_PACKAGE),
        "--no-sync",
    )
    assert completed.returncode == 0, completed.stderr
    manifest = (workspace / "flagged-project" / "flagged_project" / "aqven.yaml").read_text()
    assert 'id: "anthropic"' in manifest
    env_example = (workspace / "flagged-project" / "flagged_project" / ".env.example").read_text()
    assert "ANTHROPIC_API_KEY=" in env_example
    assert "OPENROUTER_API_KEY=" not in env_example


def test_unknown_provider_flag_fails_cleanly(tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    code = main(["new", str(tmp_path / "shop"), "--provider", "not-a-real-provider", "--no-sync"])

    assert code == 2
    assert "unknown provider 'not-a-real-provider'" in capsys.readouterr().err


def test_next_steps_say_cp_env_example_when_no_key_was_pasted(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    wizard = WizardAnswers(
        provider_id="openrouter",
        provider_env_var="OPENROUTER_API_KEY",
        api_key=None,
        allows_pii=False,
        budget_usd_micros=None,
        max_parallel=4,
    )
    assert create_project(NewProjectRequest(target=tmp_path / "shop", sync=False, wizard=wizard)) == 0

    out = capsys.readouterr().out
    assert "cp shop/.env.example shop/.env and set the API keys in it" in out
    assert "already set" not in out


def test_next_steps_skip_the_cp_when_the_wizard_already_wrote_the_key(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    wizard = WizardAnswers(
        provider_id="openrouter",
        provider_env_var="OPENROUTER_API_KEY",
        api_key="sk-test-123",
        allows_pii=False,
        budget_usd_micros=None,
        max_parallel=4,
    )
    assert create_project(NewProjectRequest(target=tmp_path / "shop", sync=False, wizard=wizard)) == 0

    out = capsys.readouterr().out
    assert "OPENROUTER_API_KEY is already set in shop/.env" in out
    assert "cp shop/.env.example" not in out
