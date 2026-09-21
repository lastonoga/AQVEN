import argparse
import json
import os
import sys
from collections.abc import Callable, Mapping
from dataclasses import dataclass
from pathlib import Path
from typing import Final, TextIO

from pydantic import BaseModel, ConfigDict

from aqven.app.dotenv_secrets import DotenvFile
from aqven.app.secret_declarations import SecretDeclaration, SecretScope, declared_secrets
from aqven.app.secret_names import ProjectSecretNames
from aqven.console.command import EXIT_FAILED, EXIT_OK, PATH_HELP, OutputFormat, add_format_argument
from aqven.console.project_env import open_project
from aqven.loader import load_project
from aqven.ports.settings import SecretSource, mask_secret, resolved_of

PROGRAM: Final = "aqven secrets"
UNSET: Final = "unset"
NAME_WIDTH: Final = 22
ENV_WIDTH: Final = 28
OWNER_WIDTH: Final = 26
SOURCE_WIDTH: Final = 14


class SecretRow(BaseModel):
    model_config = ConfigDict(frozen=True)
    name: str
    env_var: str
    declared_by: str
    scope: SecretScope
    declared_in: str
    setting_key: str
    source: SecretSource | None
    masked: str | None
    set: bool


class SecretsReport(BaseModel):
    model_config = ConfigDict(frozen=True)
    ok: bool
    missing: tuple[str, ...]
    secrets: tuple[SecretRow, ...]


def secret_row(declaration: SecretDeclaration, dotenv: str, environ: Mapping[str, str]) -> SecretRow:
    resolved = resolved_of(dotenv, environ.get(declaration.env_var, ""))
    return SecretRow(
        name=declaration.name,
        env_var=declaration.env_var,
        declared_by=declaration.declared_by,
        scope=declaration.scope,
        declared_in=declaration.declared_in,
        setting_key=declaration.setting_key,
        source=None if resolved is None else resolved.source,
        masked=None if resolved is None else mask_secret(resolved.value.get_secret_value()),
        set=resolved is not None,
    )


def build_report(root: Path, environ: Mapping[str, str]) -> SecretsReport | None:
    loaded = load_project(root)
    if loaded.project is None:
        return None
    names = ProjectSecretNames(root)
    dotenv = {entry.name: entry.value.get_secret_value() for entry in DotenvFile(root).entries()}
    declarations = declared_secrets(loaded.project, names)
    rows = tuple(secret_row(item, dotenv.get(item.env_var, ""), environ) for item in declarations)
    missing = tuple(row.env_var for row in rows if not row.set)
    return SecretsReport(ok=not missing, missing=missing, secrets=rows)


def render_text(report: SecretsReport) -> str:
    header = (
        f"{'secret'.ljust(NAME_WIDTH)}{'variable'.ljust(ENV_WIDTH)}"
        f"{'declared by'.ljust(OWNER_WIDTH)}{'source'.ljust(SOURCE_WIDTH)}value"
    )
    return "\n".join((header, *(_row_line(row) for row in report.secrets)))


def render_json(report: SecretsReport) -> str:
    return json.dumps(report.model_dump(mode="json"), ensure_ascii=False, indent=2)


RENDERERS: Final[Mapping[OutputFormat, Callable[[SecretsReport], str]]] = {
    OutputFormat.TEXT: render_text,
    OutputFormat.JSON: render_json,
}


def list_secrets(root: Path, output: OutputFormat, environ: Mapping[str, str], out: TextIO | None = None) -> int:
    report = build_report(root, environ)
    if report is None:
        print(f"{PROGRAM}: the project does not load, run aqven check", file=sys.stderr)
        return EXIT_FAILED
    print(RENDERERS[output](report), file=sys.stdout if out is None else out)
    return EXIT_OK


@dataclass(frozen=True, slots=True)
class SecretsCommand:
    help: str = "every secret the project declares, where it comes from and whether it is set"

    def configure(self, parser: argparse.ArgumentParser) -> None:
        parser.add_argument("path", nargs="?", default=".", help=PATH_HELP)
        add_format_argument(parser)

    def execute(self, arguments: argparse.Namespace) -> int:
        output = OutputFormat(str(arguments.format))
        root = open_project(Path(str(arguments.path)), output)
        if root is None:
            return EXIT_FAILED
        return list_secrets(root, output, os.environ)


def _row_line(row: SecretRow) -> str:
    owner = f"{row.scope} {row.declared_by}"
    source = row.source or UNSET
    return (
        f"{row.name.ljust(NAME_WIDTH)}{row.env_var.ljust(ENV_WIDTH)}"
        f"{owner.ljust(OWNER_WIDTH)}{source.ljust(SOURCE_WIDTH)}{row.masked or ''}"
    ).rstrip()
