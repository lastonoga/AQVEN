import argparse
import asyncio
import sys
from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass
from pathlib import Path
from typing import Final, Literal, NoReturn

from aqven.app.options import add_server_arguments, server_options
from aqven.check import check_project
from aqven.check.output_modes import agent_modes, mode_note
from aqven.codegen import GENERATED_TYPES, generate_types
from aqven.console.command import (
    EXIT_FAILED,
    EXIT_OK,
    EXIT_USAGE,
    FORMATTERS,
    NOT_IMPLEMENTED,
    PATH_HELP,
    PROGRAM,
    Command,
    OutputFormat,
    add_format_argument,
    not_implemented,
)
from aqven.console.formats import EventFormat
from aqven.console.models import ModelsCommand
from aqven.console.new import NewCommand
from aqven.console.project_env import open_project
from aqven.diagnostics import format_text, has_errors
from aqven.loader import (
    PROJECT_FILE,
    EntityKey,
    EntityKind,
    LoadedProject,
    ProjectIndex,
    build_index,
    load_project,
)
from aqven.runtime.options import CassetteMode
from aqven.spec import write_editor_schemas
from aqven.views import render_refs, render_tree

__all__ = [
    "COMMANDS",
    "EXIT_FAILED",
    "EXIT_OK",
    "EXIT_USAGE",
    "NOT_IMPLEMENTED",
    "PATH_HELP",
    "PROGRAM",
    "Command",
    "OutputFormat",
    "ServerCommand",
    "build_parser",
    "main",
    "project_start",
    "run",
]

TARGET_SEPARATOR: Final = ":"
CURRENT_FOLDER: Final = "."


type ServeModeName = Literal["studio", "serve"]


def project_start(root: Path | None, path: str | None, cwd: Path) -> Path:
    if root is not None:
        return root
    return Path(path) if path else cwd


@dataclass(frozen=True, slots=True)
class CheckCommand:
    help: str = "check the project: definition models, references, types, prompts, referenced code"

    def configure(self, parser: argparse.ArgumentParser) -> None:
        _path_argument(parser)
        add_format_argument(parser)

    def execute(self, arguments: argparse.Namespace) -> int:
        output = OutputFormat(str(arguments.format))
        root = open_project(Path(str(arguments.path)), output)
        if root is None:
            return EXIT_FAILED
        generate_types(root)
        report = check_project(root)
        print(FORMATTERS[output](report.diagnostics))
        return EXIT_FAILED if has_errors(report.diagnostics) else EXIT_OK


@dataclass(frozen=True, slots=True)
class GenerateCommand:
    help: str = f"generate Pydantic models of all types and inference inputs and outputs into {GENERATED_TYPES}"

    def configure(self, parser: argparse.ArgumentParser) -> None:
        _path_argument(parser)

    def execute(self, arguments: argparse.Namespace) -> int:
        root = open_project(Path(str(arguments.path)), OutputFormat.TEXT)
        if root is None:
            return EXIT_FAILED
        loaded = generate_types(root)
        if loaded.project is None:
            print(format_text(loaded.diagnostics))
            return EXIT_FAILED
        print(GENERATED_TYPES)
        return EXIT_OK


@dataclass(frozen=True, slots=True)
class SchemaCommand:
    help: str = "write JSON Schema of definition models to .aqven/schema/ for the editor"

    def configure(self, parser: argparse.ArgumentParser) -> None:
        _path_argument(parser)

    def execute(self, arguments: argparse.Namespace) -> int:
        root = open_project(Path(str(arguments.path)), OutputFormat.TEXT)
        if root is None:
            return EXIT_FAILED
        for path in write_editor_schemas(root):
            print(path.relative_to(root).as_posix())
        return EXIT_OK


@dataclass(frozen=True, slots=True)
class TreeCommand:
    help: str = "all module entities by kind with file paths"

    def configure(self, parser: argparse.ArgumentParser) -> None:
        _path_argument(parser)

    def execute(self, arguments: argparse.Namespace) -> int:
        loaded = _loaded(Path(str(arguments.path)))
        if loaded is None:
            return EXIT_FAILED
        print(render_tree(build_index(loaded), _agent_notes(loaded)))
        return EXIT_OK


@dataclass(frozen=True, slots=True)
class RefsCommand:
    help: str = "where an entity is defined, what references it and what it references"

    def configure(self, parser: argparse.ArgumentParser) -> None:
        kinds = ", ".join(kind.value for kind in EntityKind)
        parser.add_argument("target", metavar="KIND:ID", help=f"entity kind and id; kinds: {kinds}")
        parser.add_argument("path", nargs="?", default=CURRENT_FOLDER, help=f"project root with {PROJECT_FILE}")

    def execute(self, arguments: argparse.Namespace) -> int:
        kind, _, name = str(arguments.target).partition(TARGET_SEPARATOR)
        if kind not in EntityKind or not name:
            print(f"{PROGRAM} refs: expected KIND:ID, where KIND is one of: {', '.join(EntityKind)}", file=sys.stderr)
            return EXIT_USAGE
        index = _index(Path(str(arguments.path)))
        if index is None:
            return EXIT_FAILED
        keys = index.find(EntityKind(kind), name)
        if not keys:
            print(f"{PROGRAM} refs: {arguments.target} is neither defined nor referenced", file=sys.stderr)
            return EXIT_FAILED
        print("\n\n".join(render_refs(index, key) for key in keys))
        return EXIT_OK


@dataclass(frozen=True, slots=True)
class ServerCommand:
    help: str
    mode: ServeModeName

    def configure(self, parser: argparse.ArgumentParser) -> None:
        parser.add_argument("path", nargs="?", default=None, help=PATH_HELP)
        add_server_arguments(parser)

    def execute(self, arguments: argparse.Namespace) -> int:
        start = project_start(_optional_path(arguments.root), _optional_text(arguments.path), Path.cwd())
        root = open_project(start, OutputFormat.TEXT)
        if root is None:
            return EXIT_FAILED
        arguments.root = root
        from aqven.console.serve import SERVE_MODES, serve

        return serve(SERVE_MODES[self.mode], server_options(arguments, root))


@dataclass(frozen=True, slots=True)
class RunCommand:
    help: str = "run a flow locally without a server and print run events as they appear"

    def configure(self, parser: argparse.ArgumentParser) -> None:
        parser.add_argument("flow", metavar="FLOW_ID", help="flow id")
        parser.add_argument("--input", required=True, type=Path, metavar="FILE_JSON", help="flow input as JSON")
        parser.add_argument("--root", type=Path, default=None, help="project root; searched upward from cwd by default")
        parser.add_argument("--human-answers", type=Path, default=None, metavar="FILE_JSON")
        parser.add_argument("--cassettes", type=Path, default=None, metavar="DIR")
        parser.add_argument(
            "--cassette-mode", choices=[mode.value for mode in CassetteMode], default=CassetteMode.REPLAY_STRICT.value
        )
        parser.add_argument("--format", choices=[item.value for item in EventFormat], default=EventFormat.TEXT.value)
        parser.add_argument("--data-dir", type=Path, default=None, help="Studio data directory")

    def execute(self, arguments: argparse.Namespace) -> int:
        root = open_project(_optional_path(arguments.root) or Path.cwd(), OutputFormat.TEXT)
        if root is None:
            return EXIT_FAILED
        from aqven.console.run import FlowRunRequest

        request = FlowRunRequest(
            root=root,
            flow_id=str(arguments.flow),
            input_file=Path(str(arguments.input)),
            answers_file=_optional_path(arguments.human_answers),
            cassettes=_optional_path(arguments.cassettes),
            cassette_mode=CassetteMode(str(arguments.cassette_mode)),
            event_format=EventFormat(str(arguments.format)),
            data_dir=_optional_path(arguments.data_dir),
        )
        from aqven.console.run import run_flow

        return asyncio.run(run_flow(request))


@dataclass(frozen=True, slots=True)
class McpCommand:
    help: str = "MCP over stdio: connects to the project server or starts it in the background without a browser"

    def configure(self, parser: argparse.ArgumentParser) -> None:
        parser.add_argument("path", nargs="?", default=None, help=PATH_HELP)
        parser.add_argument("--root", type=Path, default=None, help="project root; searched upward from cwd by default")
        parser.add_argument("--data-dir", type=Path, default=None, help="Studio data folder for the background server")

    def execute(self, arguments: argparse.Namespace) -> int:
        start = project_start(_optional_path(arguments.root), _optional_text(arguments.path), Path.cwd())
        root = open_project(start, OutputFormat.TEXT)
        if root is None:
            return EXIT_FAILED
        data_dir = _optional_path(arguments.data_dir)
        extra = () if data_dir is None else ("--data-dir", str(data_dir))
        from aqven.console.mcp import run_mcp_bridge

        return run_mcp_bridge(root, extra)


@dataclass(frozen=True, slots=True)
class PendingCommand:
    name: str
    help: str
    configure_options: Callable[[argparse.ArgumentParser], None]

    def configure(self, parser: argparse.ArgumentParser) -> None:
        _path_argument(parser)
        self.configure_options(parser)

    def execute(self, arguments: argparse.Namespace) -> int:
        return not_implemented(self.name)


def _no_options(parser: argparse.ArgumentParser) -> None:
    return None


def _plan_options(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--against", metavar="LABEL")


def _build_options(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--out", metavar="DIR")


def _eval_options(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--eval", required=True, metavar="EVAL_ID")


DEV_HELP: Final = "start the project server, watch project files and open Studio in the browser"

COMMANDS: Final[Mapping[str, Command]] = {
    "new": NewCommand(),
    "check": CheckCommand(),
    "generate": GenerateCommand(),
    "schema": SchemaCommand(),
    "tree": TreeCommand(),
    "refs": RefsCommand(),
    "fmt": PendingCommand("fmt", "format YAML canonically", _no_options),
    "plan": PendingCommand("plan", "semantic diff against a release and gate status", _plan_options),
    "build": PendingCommand("build", "build the module wheel with IR", _build_options),
    "run": RunCommand(),
    "dev": ServerCommand(DEV_HELP, "studio"),
    "studio": ServerCommand(f"alias of dev: {DEV_HELP}", "studio"),
    "serve": ServerCommand("project server without a browser: Studio API, engine and MCP", "serve"),
    "mcp": McpCommand(),
    "models": ModelsCommand(),
    "eval": PendingCommand("eval", "run evals and the gate", _eval_options),
    "optimize": PendingCommand("optimize", "optimize a prompt with GEPA", _eval_options),
}


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog=PROGRAM, description="aqven project toolkit")
    commands = parser.add_subparsers(dest="command", required=True, metavar="COMMAND")
    for name, command in COMMANDS.items():
        command.configure(commands.add_parser(name, help=command.help, description=command.help))
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    try:
        arguments = build_parser().parse_args(argv)
    except SystemExit as exit_request:
        return _exit_code(exit_request)
    return COMMANDS[str(arguments.command)].execute(arguments)


def run() -> NoReturn:
    sys.exit(main())


def _path_argument(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("path", help=PATH_HELP)


def _index(path: Path) -> ProjectIndex | None:
    loaded = _loaded(path)
    return None if loaded is None else build_index(loaded)


def _loaded(path: Path) -> LoadedProject | None:
    root = open_project(path, OutputFormat.TEXT)
    loaded = load_project(root) if root is not None else None
    if loaded is None:
        return None
    if loaded.project is None:
        print(format_text(loaded.diagnostics))
        return None
    return loaded.project


def _agent_notes(project: LoadedProject) -> Mapping[EntityKey, str]:
    return {
        EntityKey(EntityKind.AGENT, agent_id): mode_note(
            agent_modes(source.spec.output.mode, (source.spec.model, *(source.spec.fallback_models or ())))
        )
        for agent_id, source in project.agents.items()
    }


def _optional_path(value: object) -> Path | None:
    return value if isinstance(value, Path) else None


def _optional_text(value: object) -> str | None:
    return value if isinstance(value, str) and value else None


def _exit_code(exit_request: SystemExit) -> int:
    code = exit_request.code
    return code if isinstance(code, int) else EXIT_USAGE
