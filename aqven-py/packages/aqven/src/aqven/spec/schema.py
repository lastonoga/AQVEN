import json
from pathlib import Path
from typing import Final

from pydantic import JsonValue, TypeAdapter

from aqven.spec.documents import SPEC_MODEL_BY_KIND
from aqven.spec.names import SpecKind

SCHEMA_DIALECT: Final = "https://json-schema.org/draft/2020-12/schema"
SCHEMA_DIRECTORY: Final = Path(".aqven") / "schema"

JSON_OBJECT: Final = TypeAdapter(dict[str, JsonValue])


def editor_schema(kind: SpecKind) -> dict[str, JsonValue]:
    body = JSON_OBJECT.validate_python(SPEC_MODEL_BY_KIND[kind].json_schema(by_alias=True))
    return {"$schema": SCHEMA_DIALECT, **body}


def schema_path(root: Path, kind: SpecKind) -> Path:
    return root / SCHEMA_DIRECTORY / f"{kind.value.lower()}.schema.json"


def write_editor_schemas(root: Path) -> tuple[Path, ...]:
    (root / SCHEMA_DIRECTORY).mkdir(parents=True, exist_ok=True)
    return tuple(_write_schema(root, kind) for kind in SpecKind)


def _write_schema(root: Path, kind: SpecKind) -> Path:
    path = schema_path(root, kind)
    text = json.dumps(editor_schema(kind), ensure_ascii=False, indent=2)
    path.write_text(f"{text}\n", encoding="utf-8")
    return path
