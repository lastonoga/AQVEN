import argparse
import sys
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from pathlib import Path
from typing import Final, TextIO

from pydantic import TypeAdapter, ValidationError

from aqven.compiler import CompileError, compile_root
from aqven.console.command import EXIT_FAILED, EXIT_OK, EXIT_USAGE, PATH_HELP, Command, OutputFormat
from aqven.console.project_env import open_project
from aqven.diagnostics import format_text
from aqven.preview import (
    PreviewError,
    PreviewNotFound,
    PromptPreview,
    PromptPreviewRequest,
    preview_prompt,
    render_preview_json,
    render_preview_text,
)
from aqven.runtime.address import JsonObject
from aqven.spec import FlowId, NodeId

ACTION_DESTINATION: Final = "prompt_action"
PROGRAM: Final = "aqven prompt preview"
TARGET_SEPARATOR: Final = "."
VARIANT_SEPARATOR: Final = "="
CURRENT_FOLDER: Final = "."
TARGET_HELP: Final = "llm node as FLOW.NODE, for example support_case.reply"
VARIANT_HELP: Final = "force a prompt variant: SLOT=CASE; repeatable"
INPUT_HELP: Final = "inference input as a JSON object; sample values are used without it"
INPUT_DOCUMENT: Final[TypeAdapter[JsonObject]] = TypeAdapter(JsonObject)


class PreviewArgumentError(ValueError):
    pass


@dataclass(frozen=True, slots=True)
class PromptPreviewCliRequest:
    root: Path
    target: str
    output: OutputFormat
    input_file: Path | None = None
    variants: Mapping[str, str] | None = None


def parse_target(target: str) -> tuple[str, str]:
    flow_id, separator, node_id = target.partition(TARGET_SEPARATOR)
    if not separator or not flow_id or not node_id:
        raise PreviewArgumentError(f"expected FLOW.NODE, got {target}")
    return flow_id, node_id


def parse_variants(values: Sequence[str]) -> Mapping[str, str]:
    chosen: dict[str, str] = {}
    for item in values:
        slot, separator, case = item.partition(VARIANT_SEPARATOR)
        if not separator or not slot or not case:
            raise PreviewArgumentError(f"expected SLOT=CASE in --variant, got {item}")
        chosen[slot] = case
    return chosen


def read_input(path: Path | None) -> JsonObject | None:
    if path is None:
        return None
    try:
        return INPUT_DOCUMENT.validate_json(path.read_bytes())
    except (OSError, ValidationError) as error:
        raise PreviewArgumentError(f"{path} must hold a JSON object of inference inputs: {error}") from error


def build_request(request: PromptPreviewCliRequest) -> PromptPreviewRequest:
    flow_id, node_id = parse_target(request.target)
    document = read_input(request.input_file)
    try:
        return PromptPreviewRequest(
            flow_id=FlowId(flow_id),
            node_id=NodeId(node_id),
            input=document,
            variants=dict(request.variants or {}),
        )
    except ValidationError as error:
        raise PreviewArgumentError(f"{request.target} is not a valid flow and node id: {error}") from error


def rendered(preview: PromptPreview, output: OutputFormat) -> str:
    if output is OutputFormat.JSON:
        return render_preview_json(preview)
    return render_preview_text(preview)


def preview_node(request: PromptPreviewCliRequest, out: TextIO | None = None) -> int:
    try:
        wanted = build_request(request)
    except PreviewArgumentError as error:
        print(f"{PROGRAM}: {error}", file=sys.stderr)
        return EXIT_USAGE
    try:
        project = compile_root(request.root)
    except CompileError as error:
        print(f"{PROGRAM}: the project does not compile, run aqven check", file=sys.stderr)
        print(format_text(error.diagnostics), file=sys.stderr)
        return EXIT_FAILED
    try:
        preview = preview_prompt(project, wanted)
    except PreviewError as error:
        print(f"{PROGRAM}: {error.message}", file=sys.stderr)
        return EXIT_USAGE if isinstance(error, PreviewNotFound) else EXIT_FAILED
    print(rendered(preview, request.output), file=sys.stdout if out is None else out)
    return EXIT_OK


@dataclass(frozen=True, slots=True)
class PromptPreviewCommand:
    help: str = "print the exact messages an llm node sends to the model: instructions, prompt, output contract"

    def configure(self, parser: argparse.ArgumentParser) -> None:
        parser.add_argument("target", metavar="FLOW.NODE", help=TARGET_HELP)
        parser.add_argument("--input", type=Path, default=None, metavar="FILE_JSON", help=INPUT_HELP)
        parser.add_argument("--variant", action="append", default=[], metavar="SLOT=CASE", help=VARIANT_HELP)
        parser.add_argument("--project", default=CURRENT_FOLDER, help=PATH_HELP)
        parser.add_argument("--json", action="store_true", help="print the preview as JSON")

    def execute(self, arguments: argparse.Namespace) -> int:
        output = OutputFormat.JSON if bool(arguments.json) else OutputFormat.TEXT
        root = open_project(Path(str(arguments.project)), output)
        if root is None:
            return EXIT_FAILED
        try:
            variants = parse_variants([str(item) for item in arguments.variant])
        except PreviewArgumentError as error:
            print(f"{PROGRAM}: {error}", file=sys.stderr)
            return EXIT_USAGE
        request = PromptPreviewCliRequest(
            root=root,
            target=str(arguments.target),
            output=output,
            input_file=arguments.input if isinstance(arguments.input, Path) else None,
            variants=variants,
        )
        return preview_node(request)


PROMPT_ACTIONS: Final[Mapping[str, Command]] = {"preview": PromptPreviewCommand()}


@dataclass(frozen=True, slots=True)
class PromptCommand:
    help: str = "prompts of llm nodes"

    def configure(self, parser: argparse.ArgumentParser) -> None:
        actions = parser.add_subparsers(dest=ACTION_DESTINATION, required=True, metavar="ACTION")
        for name, action in PROMPT_ACTIONS.items():
            action.configure(actions.add_parser(name, help=action.help, description=action.help))

    def execute(self, arguments: argparse.Namespace) -> int:
        return PROMPT_ACTIONS[str(getattr(arguments, ACTION_DESTINATION))].execute(arguments)
