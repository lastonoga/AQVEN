import argparse
import asyncio
import json
import keyword
import re
import shutil
import subprocess
import sys
from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass, field
from importlib.metadata import PackageNotFoundError, version
from pathlib import Path
from typing import Final, Protocol, cast

from ruamel.yaml.comments import CommentedMap, CommentedSeq

from aqven.app.locations import ProjectState, StudioState, studio_data_dir
from aqven.app.settings_store import open_settings_store
from aqven.app.workers import MAX_PARALLEL_KEY
from aqven.codegen import GENERATED_TYPES, generate_types
from aqven.console.command import EXIT_FAILED, EXIT_OK, EXIT_USAGE, PROGRAM
from aqven.console.new_wizard import (
    UnknownProvider,
    WizardAnswers,
    run_wizard,
    should_run_wizard,
    wizard_from_provider,
)
from aqven.console.project_template import (
    HELLO_TEMPLATE,
    MINIMAL_TEMPLATE,
    TEMPLATES,
    ProjectTemplate,
    RenderedProject,
    TemplateValues,
)
from aqven.diagnostics import format_text
from aqven.write.round_trip import put_in_order, round_trip_yaml

COMMAND: Final = "new"
AQVEN_DISTRIBUTION: Final = "aqven"
UNRELEASED_VERSION: Final = "0.0.0"
UV_EXECUTABLE: Final = "uv"
UV_SYNC: Final = ("sync",)
PACKAGE_PATTERN: Final = re.compile(r"^[a-z][a-z0-9_]*$")
NAME_SEPARATORS: Final = re.compile(r"[^a-z0-9]+")
RESERVED_PACKAGES: Final = frozenset({"aqven", "aqven_llm", "src", "tests"})
PROJECT_SEPARATOR: Final = "-"
PACKAGE_SEPARATOR: Final = "_"
FILE_ENCODING: Final = "utf-8"
ENV_EXAMPLE: Final = ".env.example"
LIMITS_KEY: Final = "limits"


class NewProjectFailed(Exception):
    def __init__(self, message: str, exit_code: int = EXIT_FAILED) -> None:
        super().__init__(message)
        self.exit_code = exit_code


class CommandRunner(Protocol):
    def run(self, command: Sequence[str], cwd: Path) -> int: ...


type ExecutableLocator = Callable[[str], str | None]


@dataclass(frozen=True, slots=True)
class SubprocessRunner:
    def run(self, command: Sequence[str], cwd: Path) -> int:
        return subprocess.run(list(command), cwd=cwd, check=False).returncode


@dataclass(frozen=True, slots=True)
class NewProjectRequest:
    target: Path
    template: str = MINIMAL_TEMPLATE
    package: str | None = None
    aqven_path: Path | None = None
    sync: bool = True
    force: bool = False
    with_tests: bool = False
    wizard: WizardAnswers | None = None


@dataclass(frozen=True, slots=True)
class ProjectDraft:
    target: Path
    template: ProjectTemplate
    values: TemplateValues
    rendered: RenderedProject

    @property
    def module_root(self) -> Path:
        return self.target / self.rendered.module_root


class ProjectStep(Protocol):
    def apply(self, draft: ProjectDraft) -> None: ...


def derived_package(folder_name: str) -> str:
    return NAME_SEPARATORS.sub(PACKAGE_SEPARATOR, folder_name.lower()).strip(PACKAGE_SEPARATOR)


def package_problem(package: str) -> str | None:
    if not PACKAGE_PATTERN.fullmatch(package):
        return "must start with a lowercase letter and contain only lowercase letters, digits and underscores"
    if keyword.iskeyword(package):
        return "is a Python keyword"
    if package in sys.stdlib_module_names:
        return "shadows a module of the Python standard library"
    if package in RESERVED_PACKAGES:
        return "is reserved by aqven"
    return None


def checked_package(request: NewProjectRequest) -> str:
    package = request.package or derived_package(request.target.resolve().name)
    problem = package_problem(package)
    if problem is None:
        return package
    hint = "" if request.package else "; pass a valid name with --package"
    raise NewProjectFailed(f"package name {package!r} {problem}{hint}", EXIT_USAGE)


def checked_template(templates: Mapping[str, ProjectTemplate], name: str) -> ProjectTemplate:
    template = templates.get(name)
    if template is not None:
        return template
    available = ", ".join(sorted(templates))
    raise NewProjectFailed(f"unknown template {name!r}; available templates: {available}", EXIT_USAGE)


def aqven_requirement() -> str:
    try:
        installed = version(AQVEN_DISTRIBUTION)
    except PackageNotFoundError:
        installed = UNRELEASED_VERSION
    return f"{AQVEN_DISTRIBUTION}=={installed}"


def uv_sources(aqven_path: Path | None) -> str:
    if aqven_path is None:
        return ""
    source = aqven_path.expanduser().resolve()
    if not (source / "pyproject.toml").is_file():
        raise NewProjectFailed(f"--aqven-path {source} has no pyproject.toml: pass the folder of the aqven package")
    return (
        f"[tool.uv.sources]\n{AQVEN_DISTRIBUTION} = {{ path = {json.dumps(source.as_posix())}, editable = true }}\n\n"
    )


def check_target(request: NewProjectRequest) -> None:
    target = request.target
    if target.exists() and not target.is_dir():
        raise NewProjectFailed(f"{target} exists and is not a folder")
    if request.force or not target.is_dir() or not any(target.iterdir()):
        return
    raise NewProjectFailed(f"{target} is not empty; pass --force to write the project into it anyway")


def project_draft(templates: Mapping[str, ProjectTemplate], request: NewProjectRequest) -> ProjectDraft:
    template = checked_template(templates, request.template)
    package = checked_package(request)
    check_target(request)
    values = TemplateValues(
        package=package,
        project=package.replace(PACKAGE_SEPARATOR, PROJECT_SEPARATOR),
        aqven_requirement=aqven_requirement(),
        uv_sources=uv_sources(request.aqven_path),
        with_tests=request.with_tests,
    )
    return ProjectDraft(target=request.target, template=template, values=values, rendered=template.render(values))


@dataclass(frozen=True, slots=True)
class WriteFiles:
    def apply(self, draft: ProjectDraft) -> None:
        for file in draft.rendered.files:
            destination = draft.target / file.path
            destination.parent.mkdir(parents=True, exist_ok=True)
            self._write(destination, file.content)

    def _write(self, destination: Path, content: str | bytes) -> None:
        if isinstance(content, bytes):
            destination.write_bytes(content)
            return
        destination.write_text(content, encoding=FILE_ENCODING)


@dataclass(frozen=True, slots=True)
class SyncEnvironment:
    runner: CommandRunner
    executable: str | None

    def apply(self, draft: ProjectDraft) -> None:
        if self.executable is None:
            raise NewProjectFailed(f"{UV_EXECUTABLE} is not on PATH: install uv or rerun with --no-sync")
        code = self.runner.run((self.executable, *UV_SYNC), draft.target)
        if code != EXIT_OK:
            raise NewProjectFailed(f"uv sync failed with exit code {code} in {draft.target}")


@dataclass(frozen=True, slots=True)
class GenerateModels:
    def apply(self, draft: ProjectDraft) -> None:
        loaded = generate_types(draft.module_root)
        if loaded.project is not None:
            return
        raise NewProjectFailed(f"aqven generate failed:\n{format_text(loaded.diagnostics)}")


def patch_data_policy(provider: CommentedMap, allows_pii: bool | None) -> None:
    if allows_pii is None:
        return
    policy = cast("CommentedMap", provider["data_policy"])
    policy["allows_pii"] = allows_pii
    policy["allows_sensitive"] = allows_pii


def patch_provider(aqven_yaml: Path, wizard: WizardAnswers) -> None:
    yaml = round_trip_yaml()
    with aqven_yaml.open(encoding=FILE_ENCODING) as handle:
        data = cast("CommentedMap", yaml.load(handle))
    provider = cast("CommentedMap", cast("CommentedSeq", data["providers"])[0])
    provider["id"] = wizard.provider_id
    provider["api_key"] = f"ref:env/{wizard.provider_env_var}"
    patch_data_policy(provider, wizard.allows_pii)
    if wizard.budget_usd_micros is not None:
        put_in_order(data, LIMITS_KEY, {"usd_micros": wizard.budget_usd_micros})
    with aqven_yaml.open("w", encoding=FILE_ENCODING) as handle:
        yaml.dump(data, handle)


def patch_env(module_root: Path, wizard: WizardAnswers) -> None:
    example = module_root / ENV_EXAMPLE
    text = example.read_text(encoding=FILE_ENCODING).replace("OPENROUTER_API_KEY=", f"{wizard.provider_env_var}=")
    example.write_text(text, encoding=FILE_ENCODING)
    if wizard.api_key is not None:
        (module_root / ".env").write_text(
            text.replace(f"{wizard.provider_env_var}=", f"{wizard.provider_env_var}={wizard.api_key}"),
            encoding=FILE_ENCODING,
        )


async def persist_max_parallel(module_root: Path, value: int) -> None:
    store = open_settings_store(ProjectState(module_root), StudioState(studio_data_dir(None)))
    await store.set_value("project", MAX_PARALLEL_KEY, value)


@dataclass(frozen=True, slots=True)
class ApplyWizardAnswers:
    wizard: WizardAnswers

    def apply(self, draft: ProjectDraft) -> None:
        patch_provider(draft.module_root / "aqven.yaml", self.wizard)
        patch_env(draft.module_root, self.wizard)
        asyncio.run(persist_max_parallel(draft.module_root, self.wizard.max_parallel))


@dataclass(frozen=True, slots=True)
class ProjectCreator:
    templates: Mapping[str, ProjectTemplate] = field(default_factory=lambda: TEMPLATES)
    runner: CommandRunner = field(default_factory=SubprocessRunner)
    locate: ExecutableLocator = shutil.which

    def steps(self, request: NewProjectRequest) -> tuple[ProjectStep, ...]:
        wizard: tuple[ProjectStep, ...] = (ApplyWizardAnswers(request.wizard),) if request.wizard is not None else ()
        sync: tuple[ProjectStep, ...] = (
            (SyncEnvironment(self.runner, self.locate(UV_EXECUTABLE)),) if request.sync else ()
        )
        return (WriteFiles(), *wizard, *sync, GenerateModels())

    def create(self, request: NewProjectRequest) -> int:
        try:
            draft = project_draft(self.templates, request)
            for step in self.steps(request):
                step.apply(draft)
        except NewProjectFailed as failure:
            print(f"{PROGRAM} {COMMAND}: {failure}", file=sys.stderr)
            return failure.exit_code
        print(created_message(draft, request.wizard))
        return EXIT_OK


def created_message(draft: ProjectDraft, wizard: WizardAnswers | None) -> str:
    module = draft.rendered.module_root.as_posix()
    return "\n".join(
        (
            f"created {draft.values.project} in {draft.target} from the {draft.template.name} template",
            f"generated {module}/{GENERATED_TYPES}",
            "next steps:",
            f"  cd {draft.target}",
            env_next_step(module, wizard),
            f"  uv run aqven dev {module}",
        )
    )


def env_next_step(module: str, wizard: WizardAnswers | None) -> str:
    if wizard is not None and wizard.api_key is not None:
        return f"  {wizard.provider_env_var} is already set in {module}/.env"
    return f"  cp {module}/{ENV_EXAMPLE} {module}/.env and set the API keys in it"


def create_project(request: NewProjectRequest, creator: ProjectCreator | None = None) -> int:
    return (creator or ProjectCreator()).create(request)


def _optional_path(value: object) -> Path | None:
    return value if isinstance(value, Path) else None


def _optional_text(value: object) -> str | None:
    return value if isinstance(value, str) and value else None


def wizard_for(explicit_provider: str | None) -> WizardAnswers | None:
    if should_run_wizard(explicit_provider):
        return run_wizard()
    if explicit_provider is None:
        return None
    try:
        return wizard_from_provider(explicit_provider)
    except UnknownProvider as error:
        raise NewProjectFailed(str(error), EXIT_USAGE) from error


@dataclass(frozen=True, slots=True)
class NewCommand:
    help: str = "create a project from a template, install its environment with uv sync and generate its models"

    def configure(self, parser: argparse.ArgumentParser) -> None:
        parser.add_argument("target", type=Path, metavar="PATH", help="folder of the new project")
        parser.add_argument(
            "--template",
            default=None,
            choices=sorted(TEMPLATES),
            help="; ".join(f"{name}: {template.description}" for name, template in TEMPLATES.items())
            + "; defaults to hello when the bootstrap wizard runs, minimal otherwise",
        )
        parser.add_argument(
            "--package", default=None, metavar="NAME", help="Python package name; the folder name by default"
        )
        parser.add_argument(
            "--aqven-path",
            type=Path,
            default=None,
            metavar="PATH",
            help="local aqven package folder, installed as an editable uv path source for development",
        )
        parser.add_argument(
            "--with-tests", action="store_true", help="add a tests folder with one offline example test"
        )
        parser.add_argument("--no-sync", action="store_true", help="do not run uv sync")
        parser.add_argument("--force", action="store_true", help="write into a folder that is not empty")
        parser.add_argument(
            "--provider",
            default=None,
            metavar="NAME",
            help="skip the interactive provider question and use this catalog id",
        )

    def execute(self, arguments: argparse.Namespace) -> int:
        explicit_provider = _optional_text(arguments.provider)
        try:
            wizard = wizard_for(explicit_provider)
        except NewProjectFailed as failure:
            print(f"{PROGRAM} {COMMAND}: {failure}", file=sys.stderr)
            return failure.exit_code
        given_template = _optional_text(arguments.template)
        template = given_template or (HELLO_TEMPLATE if wizard is not None else MINIMAL_TEMPLATE)
        request = NewProjectRequest(
            target=Path(str(arguments.target)),
            template=template,
            package=_optional_text(arguments.package),
            aqven_path=_optional_path(arguments.aqven_path),
            sync=not bool(arguments.no_sync),
            force=bool(arguments.force),
            with_tests=bool(arguments.with_tests),
            wizard=wizard,
        )
        return create_project(request)
