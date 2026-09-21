"""Generate the published API reference from the installed AQVEN Python package.

Run with a Python environment that has this checkout's aqven package installed:
    python tools/generate_reference.py
    python tools/generate_reference.py --check
"""

from __future__ import annotations

import annotationlib
import argparse
import dataclasses
import enum
import importlib
import inspect
import json
from collections.abc import Callable
from pathlib import Path
from typing import Any, cast, get_origin

from pydantic import BaseModel

import aqven
from aqven.cli import COMMANDS
from aqven.diagnostics import DIAGNOSTIC_TEXTS, SEVERITY_BY_CODE, DiagnosticCode
from aqven.policies import BUILTINS
from aqven.spec.common import SpecModel
from aqven_llm import PROVIDERS

REPO_ROOT = Path(__file__).resolve().parents[1]
SITE = REPO_ROOT / "apps/site"
DOCS = SITE / "src/content/docs/reference"
SCHEMAS = SITE / "public/reference/schemas"
GROUPS = {
    "project": ("Project configuration", "aqven.spec.project"),
    "flows": ("Flow specification", "aqven.spec.flow"),
    "nodes": ("Node specifications", "aqven.spec.nodes"),
    "fields": ("Fields and bindings", "aqven.spec.fields"),
    "inference": ("Inference specification", "aqven.spec.inference"),
    "agents": ("Agent specification", "aqven.spec.agent"),
    "tools": ("Tool specification", "aqven.spec.tool"),
    "types": ("Type specifications", "aqven.spec.types"),
    "evaluations": ("Datasets and evaluations", "aqven.spec.evals"),
    "policies": ("Policies and limits", "aqven.spec.policy"),
    "common": ("Common limits and constraints", "aqven.spec.common"),
    "media": ("Media and dynamic values", "aqven.spec.builtins"),
    "mcp": ("MCP servers", "aqven.spec.mcp"),
    "prompts": ("Rendered prompts", "aqven.spec.prompts"),
}
MODEL_ORDER = {
    "aqven.spec.nodes": (
        "LlmNodeSpec",
        "CodeNodeSpec",
        "ToolNodeSpec",
        "HumanNodeSpec",
        "ParallelNodeSpec",
        "MapNodeSpec",
        "SwitchNodeSpec",
        "SwitchCase",
        "LoopNodeSpec",
        "CallNodeSpec",
        "NarrowNodeSpec",
    ),
    "aqven.spec.types": (
        "RecordType",
        "EnumType",
        "UnionType",
        "UnionVariant",
        "IdType",
        "ValueType",
        "EnumValue",
    ),
}


def type_text(schema: dict[str, Any], defs: dict[str, Any] | None = None) -> str:
    if "$ref" in schema:
        name = schema["$ref"].rsplit("/", 1)[-1]
        definition = (defs or {}).get(name, {})
        if "enum" in definition:
            return " | ".join(repr(value) for value in definition["enum"])
        return name
    if "const" in schema:
        return repr(schema["const"])
    if "enum" in schema:
        return " | ".join(repr(value) for value in schema["enum"])
    if "anyOf" in schema:
        return " | ".join(type_text(part, defs) for part in schema["anyOf"])
    if "oneOf" in schema:
        return " | ".join(type_text(part, defs) for part in schema["oneOf"])
    if schema.get("type") == "array":
        item = type_text(schema.get("items", {}), defs)
        return f"({item})[]" if " | " in item else f"{item}[]"
    if schema.get("type") == "object":
        if "additionalProperties" in schema:
            return f"map<string, {type_text(schema['additionalProperties'], defs)}>"
        return "object"
    return str(schema.get("type", "any"))


def constraints_text(schema: dict[str, Any]) -> str:
    keys = (
        "minLength",
        "maxLength",
        "minItems",
        "maxItems",
        "minimum",
        "maximum",
        "exclusiveMinimum",
        "exclusiveMaximum",
        "pattern",
    )
    return ", ".join(f"{key}={schema[key]}" for key in keys if key in schema) or "—"


def clean(value: object) -> str:
    return str(value).replace("|", "\\|").replace("\n", " ")


def default_text(
    model: type[BaseModel], alias: str, schema_field: dict[str, Any]
) -> str:
    if "default" in schema_field:
        return repr(schema_field["default"])
    field = next(
        (
            field
            for field in model.model_fields.values()
            if (field.alias or field.validation_alias) == alias
        ),
        None,
    )
    if field is None:
        field = model.model_fields.get(alias)
    factory = field.default_factory if field is not None else None
    if factory is list or get_origin(factory) is list:
        return "[]"
    if factory is dict or get_origin(factory) is dict:
        return "{}"
    return "not set"


def model_section(model: type[BaseModel]) -> str:
    schema = model.model_json_schema(by_alias=True)
    defs = schema.get("$defs", {})
    required = set(schema.get("required", []))
    rows = [
        f"## {model.__name__}",
        "",
        "| YAML field | Type | Required | Default | Constraints |",
        "| --- | --- | --- | --- | --- |",
    ]
    for name, field in schema.get("properties", {}).items():
        default = "—" if name in required else clean(default_text(model, name, field))
        rows.append(
            f"| `{name}` | `{clean(type_text(field, defs))}` | {'Yes' if name in required else 'No'} | `{default}` | {clean(constraints_text(field))} |"
        )
    rows.extend(("", f"[JSON Schema](/reference/schemas/{model.__name__}.json)", ""))
    return "\n".join(rows)


def spec_page(title: str, module_name: str) -> tuple[str, dict[str, str]]:
    module = importlib.import_module(module_name)
    discovered = {
        value.__name__: value
        for value in vars(module).values()
        if inspect.isclass(value)
        and issubclass(value, BaseModel)
        and value not in (BaseModel, SpecModel)
        and value.__module__ == module_name
    }
    models = (
        [discovered[name] for name in MODEL_ORDER[module_name]]
        if module_name in MODEL_ORDER
        else sorted(discovered.values(), key=lambda model: model.__name__)
    )
    header = (
        f"---\ntitle: {title}\ndescription: Generated field reference from the AQVEN Python package.\n---\n\n"
        "<!-- Generated by tools/generate_reference.py. Do not edit this file by hand. -->\n\n"
        "This reference is generated from the package's Pydantic models. Fields use their YAML aliases. "
        "Unknown fields are rejected. Cross-field rules implemented by validators may not appear in JSON Schema; "
        "run `{{CLI_COMMAND}} check` on a complete project.\n\n"
    )
    schemas = {
        model.__name__: json.dumps(
            model.model_json_schema(by_alias=True), indent=2, sort_keys=True
        )
        + "\n"
        for model in models
    }
    return header + "\n".join(model_section(model) for model in models), schemas


def public_callable(member: object) -> Callable[..., object] | None:
    if isinstance(member, (classmethod, staticmethod)):
        wrapper = cast("classmethod[Any, ..., Any] | staticmethod[..., Any]", member)
        return cast(Callable[..., object], wrapper.__func__)
    if inspect.isfunction(member):
        return cast(Callable[..., object], member)
    return None


def public_methods(owner: type) -> list[tuple[str, Callable[..., object]]]:
    members = cast(dict[str, object], vars(owner))
    found: list[tuple[str, Callable[..., object]]] = []
    for member_name, member in members.items():
        if member_name.startswith("_"):
            continue
        method = public_callable(member)
        if method is None:
            continue
        found.append((member_name, method))
    return found


def api_page() -> str:
    lines = [
        "---",
        "title: Python API",
        "description: Generated signatures of the public AQVEN Python package.",
        "---",
        "",
        "<!-- Generated by tools/generate_reference.py. Do not edit this file by hand. -->",
        "",
        "The names below come from `aqven.__all__`. Import them from `aqven`. Signatures reflect the installed package used to generate this page.",
        "",
    ]
    for name in sorted(aqven.__all__):
        value = getattr(aqven, name)
        lines.extend((f"## {name}", ""))
        if inspect.isclass(value):
            lines.append(f"`class {name}` · `{value.__module__}`")
            lines.append("")
            if issubclass(value, BaseModel):
                schema = value.model_json_schema(by_alias=True)
                required = set(schema.get("required", []))
                properties = schema.get("properties", {})
                if properties:
                    lines.extend(
                        (
                            "| Field | Type | Required | Default |",
                            "| --- | --- | --- | --- |",
                        )
                    )
                    for field_name, field in properties.items():
                        default = (
                            "—"
                            if field_name in required
                            else clean(default_text(value, field_name, field))
                        )
                        lines.append(
                            f"| `{field_name}` | `{clean(type_text(field, schema.get('$defs', {})))}` | {'Yes' if field_name in required else 'No'} | `{default}` |"
                        )
                    lines.append("")
            elif dataclasses.is_dataclass(value):
                fields = dataclasses.fields(value)
                if fields:
                    lines.extend(("| Field | Type | Default |", "| --- | --- | --- |"))
                    for field in fields:
                        default = (
                            "—"
                            if field.default is dataclasses.MISSING
                            and field.default_factory is dataclasses.MISSING
                            else "factory"
                            if field.default_factory is not dataclasses.MISSING
                            else repr(field.default)
                        )
                        lines.append(
                            f"| `{field.name}` | `{clean(field.type)}` | `{clean(default)}` |"
                        )
                    lines.append("")
            for method_name, method in public_methods(value):
                try:
                    signature = inspect.signature(
                        method, annotation_format=annotationlib.Format.STRING
                    )
                except (TypeError, ValueError):
                    continue
                prefix = (
                    "async def"
                    if inspect.iscoroutinefunction(method)
                    or inspect.isasyncgenfunction(method)
                    else "def"
                )
                lines.append(f"- `{prefix} {method_name}{signature}`")
            lines.append("")
        elif callable(value):
            try:
                prefix = "async def" if inspect.iscoroutinefunction(value) else "def"
                lines.extend(
                    (
                        f"`{prefix} {name}{inspect.signature(value, annotation_format=annotationlib.Format.STRING)}`",
                        "",
                    )
                )
            except (TypeError, ValueError):
                pass
        summary = (value.__doc__ or "").split("\n\n", 1)[0].replace("\n", " ")
        if summary and len(summary) < 400 and not summary.startswith(f"{name}("):
            lines.extend((summary, ""))
    return "\n".join(lines) + "\n"


def enums_page() -> str:
    module = importlib.import_module("aqven.spec.names")
    lines = [
        "---",
        "title: Accepted values",
        "description: Generated enums from the AQVEN Python package.",
        "---",
        "",
        "<!-- Generated by tools/generate_reference.py. Do not edit this file by hand. -->",
        "",
        "These values come from enum classes in `aqven.spec.names`.",
        "",
    ]
    for name, value in sorted(vars(module).items()):
        if (
            not inspect.isclass(value)
            or not issubclass(value, enum.Enum)
            or value.__module__ != module.__name__
        ):
            continue
        lines.extend((f"## {name}", "", "| Value |", "| --- |"))
        lines.extend(f"| `{member.value}` |" for member in value)
        lines.append("")
    return "\n".join(lines) + "\n"


def policy_param_models() -> list[type[BaseModel]]:
    models: list[type[BaseModel]] = []
    for module_name in (
        "aqven.policies.contracts",
        "aqven.policies.control",
        "aqven.policies.evaluators",
    ):
        module = importlib.import_module(module_name)
        models.extend(
            value
            for value in vars(module).values()
            if inspect.isclass(value)
            and issubclass(value, BaseModel)
            and value.__module__ == module_name
            and value.__name__.endswith("Params")
        )
    return sorted(models, key=lambda model: model.__name__)


def builtins_page() -> tuple[str, dict[str, str]]:
    lines = [
        "---",
        "title: Built-in policies and evaluators",
        "description: Generated policy names and Python signatures.",
        "---",
        "",
        "<!-- Generated by tools/generate_reference.py. Do not edit this file by hand. -->",
        "",
        "Use these names with `use:` in a policy or evaluator slot. The accepted `with:` keys follow each Python signature; run `{{CLI_COMMAND}} check` to validate the slot and parameters.",
        "",
    ]
    for slot, members in BUILTINS.items():
        lines.extend(
            (
                f"## {slot.value}",
                "",
                "| `use` name | Python signature |",
                "| --- | --- |",
            )
        )
        for name, function in members.items():
            signature = inspect.signature(
                function, annotation_format=annotationlib.Format.STRING
            )
            lines.append(f"| `{name}` | `{clean(f'{function.__name__}{signature}')}` |")
        lines.append("")
    lines.extend(("# `with` parameter models", ""))
    models = policy_param_models()
    lines.extend(model_section(model) for model in models)
    schemas = {
        model.__name__: json.dumps(
            model.model_json_schema(by_alias=True), indent=2, sort_keys=True
        )
        + "\n"
        for model in models
    }
    return "\n".join(lines) + "\n", schemas


def provider_catalog_page() -> str:
    lines = [
        "---",
        "title: Provider catalog",
        "description: Generated catalog of model providers in the installed Python package.",
        "---",
        "",
        "<!-- Generated by tools/generate_reference.py. Do not edit this file by hand. -->",
        "",
        "These providers come from `{{LLM_PYTHON_MODULE}}.catalog.PROVIDERS`. The key column names the default environment variable; project `api_key` may point to another environment variable. A provider's presence in the catalog does not guarantee that a particular model supports every modality or output mode. Use `{{CLI_COMMAND}} models check --project .` and `--live` when a real request is needed.",
        "",
        "| Provider prefix | Pydantic AI model class | Default key variable | Required | Extra |",
        "| --- | --- | --- | --- | --- |",
    ]
    for name, entry in PROVIDERS.items():
        key = entry.key.primary or "—"
        extra = entry.extra.name if entry.extra is not None else "—"
        lines.append(
            f"| `{name}` | `{entry.model_class.qualified}` | `{key}` | {'Yes' if entry.key.required else 'No'} | `{extra}` |"
        )
    lines.extend(
        (
            "",
            "Choose a model with `<provider>:<model-name>` in an Agent file. The [provider guide](/engineering/providers/) shows complete project declarations and custom factories.",
            "",
        )
    )
    return "\n".join(lines)


def authoring_api_page() -> str:
    module = importlib.import_module("aqven.spec.builder")
    lines = [
        "---",
        "title: Python authoring API",
        "description: Generated signatures for Python flow and inference builders.",
        "---",
        "",
        "<!-- Generated by tools/generate_reference.py. Do not edit this file by hand. -->",
        "",
        "Import these helpers from `{{PYTHON_MODULE}}.spec`. [Python authoring](/engineering/python-authoring/) shows complete files and when to use them.",
        "",
    ]
    for name in (
        "In",
        "Out",
        "inference_spec",
        "llm",
        "code",
        "tool",
        "flow",
        "describe_annotation",
    ):
        value = getattr(module, name)
        signature = inspect.signature(
            value, annotation_format=annotationlib.Format.STRING
        )
        lines.extend((f"## {name}", "", f"`def {name}{signature}`", ""))
    for name in ("Inference", "Flow", "BuiltNode", "BuilderError"):
        value = getattr(module, name)
        lines.extend((f"## {name}", "", f"`class {name}` · `{value.__module__}`", ""))
        if dataclasses.is_dataclass(value):
            lines.extend(("| Field | Type |", "| --- | --- |"))
            lines.extend(
                f"| `{field.name}` | `{clean(field.type)}` |"
                for field in dataclasses.fields(value)
            )
            lines.append("")
    return "\n".join(lines)


def cli_page() -> str:
    lines = [
        "---",
        "title: CLI commands",
        "description: Generated command registry from the AQVEN Python package.",
        "---",
        "",
        "<!-- Generated by tools/generate_reference.py. Do not edit this file by hand. -->",
        "",
        "The command names and help text below come from `aqven.cli.COMMANDS`. Use `uv run {{CLI_COMMAND}} COMMAND --help` for the parser flags in the installed version.",
        "",
        "| Command | Help | Availability |",
        "| --- | --- | --- |",
    ]
    for name, command in COMMANDS.items():
        available = "Pending" if command.__class__.__name__ == "PendingCommand" else "Available"
        lines.append(f"| `{{{{CLI_COMMAND}}}} {name}` | {clean(command.help)} | {available} |")
    lines.extend(
        (
            "",
            "Pending commands are registered for future use but return `not implemented`; do not put them in automation. [CLI guide](/engineering/cli-reference/) explains working command sequences.",
            "",
        )
    )
    return "\n".join(lines)


def openapi_page() -> str:
    document = json.loads((REPO_ROOT / "apps/studio/src/api/openapi.json").read_text())
    lines = [
        "---",
        "title: HTTP API / OpenAPI",
        "description: Generated endpoint index from Studio's OpenAPI document.",
        "---",
        "",
        "<!-- Generated by tools/generate_reference.py. Do not edit this file by hand. -->",
        "",
        "This index is generated from `apps/studio/src/api/openapi.json`. The running project server exposes the raw contract at `/api/openapi.json`.",
        "",
        "| Method | Path | Operation ID |",
        "| --- | --- | --- |",
    ]
    for path, methods in document["paths"].items():
        for method, operation in methods.items():
            if method.upper() not in {"GET", "POST", "PUT", "PATCH", "DELETE"}:
                continue
            lines.append(f"| `{method.upper()}` | `{path}` | `{operation.get('operationId', '—')}` |")
    return "\n".join(lines) + "\n"


def project_mcp_tools_page() -> str:
    source = Path(aqven.__file__).resolve().parent / "server/mcp"
    names: set[str] = set()
    for path in source.rglob("*.py"):
        text = path.read_text()
        names.update(__import__("re").findall(r'name="([a-z_]+)"', text))
    lines = [
        "---",
        "title: Project MCP Tool Reference",
        "description: Generated operation index from AQVEN's project MCP registrations.",
        "---",
        "",
        "<!-- Generated by tools/generate_reference.py. Do not edit this file by hand. -->",
        "",
        "The project MCP operations below are discovered from the AQVEN package source. Each MCP client receives its exact input and output JSON Schema during tool discovery.",
        "",
        "| Tool |",
        "| --- |",
        *(f"| `{name}` |" for name in sorted(names)),
        "",
        "Start the bridge with `uv run {{CLI_COMMAND}} mcp .`. [Project MCP Server](/engineering/project-mcp-server/) explains safe usage and verification.",
        "",
    ]
    return "\n".join(lines)


def diagnostics_page() -> str:
    lines = [
        "---",
        "title: Diagnostics and Error Codes",
        "description: Generated diagnostic-code index from the AQVEN Python package.",
        "---",
        "",
        "<!-- Generated by tools/generate_reference.py. Do not edit this file by hand. -->",
        "",
        "Diagnostic codes and severity are generated from `aqven.diagnostics`. Some codes also include implementation-provided message text.",
        "",
        "| Code | Severity | Message template |",
        "| --- | --- | --- |",
    ]
    for code in DiagnosticCode:
        text = DIAGNOSTIC_TEXTS.get(code)
        message = clean(text.message) if text is not None else "—"
        lines.append(f"| `{code.value}` | `{SEVERITY_BY_CODE[code].value}` | {message} |")
    return "\n".join(lines) + "\n"


def environment_page() -> str:
    lines = [
        "---",
        "title: Environment Variables",
        "description: Generated provider key-variable index from the installed AQVEN packages.",
        "---",
        "",
        "<!-- Generated by tools/generate_reference.py. Do not edit this file by hand. -->",
        "",
        "Project secrets use `ref:env/NAME`. The provider defaults below come from the installed provider catalog; a project may point `api_key` at a different environment variable.",
        "",
        "| Provider prefix | Default variable | Required |",
        "| --- | --- | --- |",
    ]
    for name, entry in PROVIDERS.items():
        lines.append(f"| `{name}` | `{entry.key.primary or '—'}` | {'Yes' if entry.key.required else 'No'} |")
    return "\n".join(lines) + "\n"


def outputs() -> dict[Path, str]:
    generated: dict[Path, str] = {}
    for slug, (title, module_name) in GROUPS.items():
        page, schemas = spec_page(title, module_name)
        generated[DOCS / f"{slug}.md"] = page
        for name, schema in schemas.items():
            generated[SCHEMAS / f"{name}.json"] = schema
    generated[DOCS / "python-api.md"] = api_page()
    generated[DOCS / "provider-catalog.md"] = provider_catalog_page()
    generated[DOCS / "authoring-api.md"] = authoring_api_page()
    generated[DOCS / "cli.md"] = cli_page()
    generated[DOCS / "openapi.md"] = openapi_page()
    generated[DOCS / "project-mcp-tools.md"] = project_mcp_tools_page()
    generated[DOCS / "diagnostics.md"] = diagnostics_page()
    generated[DOCS / "environment.md"] = environment_page()
    generated[DOCS / "accepted-values.md"] = enums_page()
    builtins, policy_schemas = builtins_page()
    generated[DOCS / "built-in-policies.md"] = builtins
    for name, schema in policy_schemas.items():
        generated[SCHEMAS / f"{name}.json"] = schema
    return generated


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--check", action="store_true", help="fail if generated files differ"
    )
    args = parser.parse_args()
    stale: list[Path] = []
    generated = outputs()
    extra_schemas = set(SCHEMAS.glob("*.json")) - generated.keys()
    if args.check:
        stale.extend(sorted(extra_schemas))
    else:
        for path in extra_schemas:
            path.unlink()
    for path, content in generated.items():
        if args.check:
            if not path.exists() or path.read_text() != content:
                stale.append(path)
        else:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(content)
    if stale:
        print(
            "Generated reference is stale:\n" + "\n".join(str(path) for path in stale)
        )
        return 1
    print("Reference is current" if args.check else "Reference generated")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
