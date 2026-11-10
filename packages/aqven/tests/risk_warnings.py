from collections.abc import Mapping
from pathlib import Path
from typing import Final

from aqven.check import CheckReport
from aqven.codegen import generate_types
from aqven.diagnostics import Diagnostic
from aqven.testing import copy_project

FIXTURE: Final = Path(__file__).parent / "fixtures" / "fixture_shop"
INFERENCE_FILE: Final = "risk/work.inference.yaml"
PROMPT_FILE: Final = "risk/work.prompt.md"


def shop(tmp_path: Path) -> Path:
    return copy_project(FIXTURE, tmp_path)


def write(root: Path, relative: str, text: str) -> None:
    target = root / relative
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(text, encoding="utf-8")


def replace(root: Path, relative: str, old: str, new: str) -> None:
    target = root / relative
    source = target.read_text(encoding="utf-8")
    assert source.count(old) == 1, old
    target.write_text(source.replace(old, new), encoding="utf-8")


def field(name: str, type_ref: str, description: str = "Value", *, extra: str = "") -> str:
    return f'- name: "{name}"\n  type: "{type_ref}"\n  description: "{description}"\n{extra}'


def id_type(allowed_set: str = "none") -> str:
    return (
        'apiVersion: "aqven/v1"\nkind: "Type"\ntype: "id"\n'
        'description: "Entity identifier"\n'
        'maxLength: 64\n'
        f'allowed_set: "{allowed_set}"\n'
    )


def value_type(base: str = "Text", *, extra: str = "") -> str:
    return (
        'apiVersion: "aqven/v1"\nkind: "Type"\ntype: "value"\n'
        f'description: "Text-backed value"\nbase: "{base}"\n{extra}'
    )


def record_type(fields: str) -> str:
    return (
        'apiVersion: "aqven/v1"\nkind: "Type"\ntype: "record"\n'
        f'description: "Record value"\nfields:\n{fields}'
    )


def union_type(*variants: tuple[str, str]) -> str:
    bodies = "".join(
        f'- name: "{name}"\n  description: "{name} variant"\n  fields:\n'
        + "".join(f"  {line}\n" for line in fields.splitlines())
        for name, fields in variants
    )
    return (
        'apiVersion: "aqven/v1"\nkind: "Type"\ntype: "union"\n'
        f'description: "Union value"\ndiscriminator: "kind"\nvariants:\n{bodies}'
    )


def inference(inputs: str, outputs: str, *, suffix: str = "", prompt: str | None = None) -> str:
    input_block = f"in:\n{inputs}" if inputs else ""
    prompt_line = f'prompt: "{prompt}"\n' if prompt is not None else ""
    return (
        'apiVersion: "aqven/v1"\nkind: "Inference"\ndescription: "Risk fixture"\n'
        f"{input_block}out:\n{outputs}{prompt_line}{suffix}"
    )


def install(root: Path, types: Mapping[str, str], source: str, *, prompt_text: str = "Return the output.\n") -> None:
    for relative, text in types.items():
        write(root, f"risk/types/{relative}", text)
    write(root, INFERENCE_FILE, source)
    write(root, PROMPT_FILE, prompt_text)
    loaded = generate_types(root)
    assert loaded.project is not None, loaded.diagnostics


def diagnostics(report: CheckReport, code: str) -> list[Diagnostic]:
    return [item for item in report.diagnostics if item.code.value == code]


def only(report: CheckReport, code: str) -> Diagnostic:
    found = diagnostics(report, code)
    assert len(found) == 1, [(item.code.value, item.file, item.path, item.message) for item in report.diagnostics]
    return found[0]
