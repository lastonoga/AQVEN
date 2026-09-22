"""Flow-specific CSV field guide and importable example row."""

import csv
import json
import re
from collections.abc import Iterator, Mapping
from io import StringIO
from typing import Literal, cast

from aqven.engine.selection import REFERENCE_FIELDS
from aqven.runtime.address import ResourceModel
from aqven.server.errors import ApiFailure
from aqven.server.run_inputs import input_adapter
from aqven.server.views.common import loaded_flow
from aqven.server.views.dataset_csv import input_field_hints
from aqven.server.views.datasets import DatasetDraftRequest, draft_dataset
from aqven.server.views.nodes import ordered_nodes
from aqven.server.workspace import WorkspaceState
from aqven.spec import FieldStep, FlowId, RefRoot, parse_ref


class CsvTemplateField(ResourceModel):
    column: str
    kind: Literal["name", "input", "context", "metadata", "expected_output", "node_outputs"]
    type: str
    required: bool
    description: str | None = None
    example: str = ""


class CsvTemplateNode(ResourceModel):
    node_id: str
    parent_node_id: str | None = None
    input_columns: tuple[str, ...] = ()
    context_columns: tuple[str, ...] = ()
    fixture_columns: tuple[str, ...] = ()


class CsvTemplate(ResourceModel):
    flow_id: FlowId
    fields: tuple[CsvTemplateField, ...]
    nodes: tuple[CsvTemplateNode, ...]
    csv: str


def _mapping(value: object) -> dict[str, object]:
    return cast(dict[str, object], value) if isinstance(value, dict) else {}


def _resolve(schema: dict[str, object], definitions: Mapping[str, object]) -> dict[str, object]:
    ref = schema.get("$ref")
    if isinstance(ref, str) and ref.startswith("#/$defs/"):
        target = _mapping(definitions.get(ref.removeprefix("#/$defs/")))
        return {**target, **{key: value for key, value in schema.items() if key != "$ref"}} if target else schema
    return schema


def _alternatives(schema: dict[str, object], definitions: Mapping[str, object]) -> list[dict[str, object]]:
    for key in ("anyOf", "oneOf"):
        options = schema.get(key)
        if isinstance(options, list):
            return [
                resolved
                for option in cast(list[object], options)
                if (resolved := _resolve(_mapping(option), definitions)).get("type") != "null"
            ]
    return []


def _nullable(schema: dict[str, object], definitions: Mapping[str, object]) -> bool:
    for key in ("anyOf", "oneOf"):
        options = schema.get(key)
        if isinstance(options, list) and any(
            _resolve(_mapping(option), definitions).get("type") == "null" for option in cast(list[object], options)
        ):
            return True
    return False


def _media_schema(schema: dict[str, object]) -> bool:
    return {"$media", "blob_id", "size_bytes"} <= _mapping(schema.get("properties")).keys()


def _input_fields(schema: dict[str, object]) -> list[tuple[str, dict[str, object], bool]]:
    definitions = _mapping(schema.get("$defs"))
    fields: dict[str, tuple[dict[str, object], bool]] = {}

    def walk(node: dict[str, object], path: str, required: bool, seen: frozenset[str]) -> None:
        ref = node.get("$ref")
        if isinstance(ref, str) and ref in seen:
            return
        resolved = _resolve(node, definitions)
        refs = seen | {ref} if isinstance(ref, str) else seen
        options = _alternatives(resolved, definitions)
        if options:
            nullable = _nullable(resolved, definitions)
            if len(options) > 1 and all(_mapping(option.get("properties")) for option in options):
                required_sets = [set(cast(list[str], option.get("required", []))) for option in options]
                common = required_sets[0].intersection(*required_sets[1:])
                for option in options:
                    for name, child in _mapping(option.get("properties")).items():
                        child_path = f"{path}.{name}" if path else name
                        walk(_mapping(child), child_path, required and not nullable and name in common, refs)
                return
            for option in options:
                described = {**option, **{key: resolved[key] for key in ("description", "title") if key in resolved}}
                walk(described, path, required and not nullable, refs)
            return
        properties = _mapping(resolved.get("properties"))
        if properties and not _media_schema(resolved):
            wanted = set(cast(list[str], resolved.get("required", [])))
            for name, child in properties.items():
                walk(_mapping(child), f"{path}.{name}" if path else name, required and name in wanted, refs)
            return
        if path:
            fields.setdefault(path, (resolved, required))

    walk(schema, "", True, frozenset())
    return [(f"inputs.{path}", value, required) for path, (value, required) in fields.items()]


def _field_type(schema: dict[str, object], *, media: bool) -> str:
    if media:
        declared = _mapping(schema.get("properties")).get("$media")
        enum = _mapping(declared).get("enum")
        if isinstance(enum, list) and enum:
            return " / ".join(str(value) for value in cast(list[object], enum))
        return "media URL"
    if isinstance(schema.get("enum"), list):
        return "enum"
    value = schema.get("type")
    if isinstance(value, str):
        return value
    if "properties" in schema:
        return "object"
    return "value"


def _cell(value: object) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        return value
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def _sample_at(sample: object, column: str) -> object:
    value = sample
    for part in column.removeprefix("inputs.").split("."):
        if not isinstance(value, dict) or part not in value:
            return None
        value = cast(dict[str, object], value)[part]
    return value


def _pattern_sample(pattern: str) -> str | None:
    """Generate a deterministic example for simple ID patterns used by flow schemas."""
    source = pattern.removeprefix("^").removesuffix("$")
    output: list[str] = []
    index = 0
    while index < len(source):
        token = source[index]
        if token == "[":
            end = source.find("]", index + 1)
            if end < 0:
                return None
            choices = source[index + 1 : end]
            token = next((char for char in ("a", "A", "0") if char in choices or f"{char}-" in choices), "")
            if not token:
                token = next((char for char in choices if char.isalnum()), "")
            if not token:
                return None
            index = end + 1
        elif token == "\\":
            index += 1
            if index >= len(source):
                return None
            token = {"d": "0", "w": "a"}.get(source[index], source[index])
            index += 1
        elif token in "().|":
            return None
        else:
            index += 1
        repeat = 1
        if index < len(source) and source[index] == "{":
            end = source.find("}", index + 1)
            if end < 0:
                return None
            count = source[index + 1 : end].split(",", 1)[0]
            if not count.isdigit():
                return None
            repeat = int(count)
            index = end + 1
        elif index < len(source) and source[index] in "?*+":
            repeat = 1 if source[index] == "+" else 0
            index += 1
        output.append(token * repeat)
    candidate = "".join(output)
    return candidate if re.fullmatch(pattern, candidate) else None


def _example(schema: dict[str, object], value: object) -> str:
    pattern = schema.get("pattern")
    if isinstance(pattern, str) and isinstance(value, str) and re.fullmatch(pattern, value) is None:
        value = _pattern_sample(pattern) or value
    return _cell(value)


def _references(value: object) -> Iterator[str]:
    if isinstance(value, list):
        for item in cast(list[object], value):
            yield from _references(item)
    elif isinstance(value, dict):
        for key, item in cast(dict[object, object], value).items():
            if key in REFERENCE_FIELDS and isinstance(item, str) and item.startswith("$"):
                yield item
            else:
                yield from _references(item)


def _input_columns(reference: object, columns: tuple[str, ...]) -> tuple[str, ...]:
    steps = getattr(reference, "steps", ())
    names: list[str] = []
    for step in steps:
        if not isinstance(step, FieldStep):
            break
        names.append(step.name)
    prefix = "inputs" + "".join(f".{name}" for name in names)
    return tuple(column for column in columns if column == prefix or column.startswith(prefix + "."))


def _fixture_column(node_id: str, steps: tuple[object, ...]) -> str:
    first = steps[0] if steps else None
    return f"node_outputs.{node_id}.{first.name}" if isinstance(first, FieldStep) else f"node_outputs.{node_id}"


def csv_template(state: WorkspaceState, flow_id: FlowId) -> CsvTemplate:
    flow = loaded_flow(state, flow_id)
    if flow.source is None or state.compiled is None or flow_id not in state.compiled.flows:
        raise ApiFailure("NOT_RUNNABLE", f"flow {flow_id} has no compiled input schema")
    compiled = state.compiled.flow(flow_id)
    adapter = input_adapter(state, flow.source.spec.input)
    input_schema = cast(dict[str, object], adapter.json_schema())
    media_fields, _, _, _ = input_field_hints(adapter)
    draft = draft_dataset(state, DatasetDraftRequest(flow_id=flow_id)).cases[0]
    sample = draft.inputs

    fields = [CsvTemplateField(column="name", kind="name", type="text", required=True, example=draft.name)]
    for column, schema, required in _input_fields(input_schema):
        media = column in media_fields
        fields.append(
            CsvTemplateField(
                column=column,
                kind="input",
                type=_field_type(schema, media=media),
                required=required,
                description=cast(str | None, schema.get("description")),
                example="" if media else _example(schema, _sample_at(sample, column)),
            )
        )
    input_columns = tuple(field.column for field in fields if field.kind == "input")
    context_keys = [key.value for key in compiled.context]
    raw_nodes: list[tuple[str, str | None, set[str], set[str], set[str]]] = []
    fixtures: set[str] = set()
    for node_id, _ in ordered_nodes(flow):
        node = compiled.nodes.get(node_id)
        if node is None:
            continue
        inputs: set[str] = set()
        contexts: set[str] = set()
        outputs: set[str] = set()
        for text in _references(node.model_dump(mode="json")):
            ref = parse_ref(text)
            if ref.root is RefRoot.INPUT:
                inputs.update(_input_columns(ref, input_columns))
            elif ref.root is RefRoot.RUN_CONTEXT and ref.key is not None:
                contexts.add(ref.key)
                if ref.key not in context_keys:
                    context_keys.append(ref.key)
            elif (
                ref.root is RefRoot.NODE
                and ref.node_id is not None
                and ref.node_id in compiled.order
                and ref.node_id != node_id
            ):
                column = _fixture_column(ref.node_id, ref.steps)
                outputs.add(column)
                fixtures.add(column)
        raw_nodes.append((node_id, node.parent, inputs, contexts, outputs))
    for key in context_keys:
        value = (draft.context or {}).get(key)
        example = value if value is not None else ("2026-01-01" if key == "date" else "example")
        fields.append(
            CsvTemplateField(
                column=f"context.{key}",
                kind="context",
                type="string",
                required=any(key in item[3] for item in raw_nodes),
                example=_cell(example),
            )
        )
    fields.append(
        CsvTemplateField(column="metadata.split", kind="metadata", type="string", required=False, example="test")
    )
    fields.append(CsvTemplateField(column="expected_output", kind="expected_output", type="JSON", required=False))

    # A root fixture and its child fields cannot coexist as CSV headers.
    roots = {column for column in fixtures if column.count(".") == 1}
    fixture_columns = tuple(
        column
        for node_id in compiled.order
        for column in sorted(fixtures)
        if column.startswith(f"node_outputs.{node_id}") and not any(column.startswith(root + ".") for root in roots)
    )
    fields.extend(
        CsvTemplateField(column=column, kind="node_outputs", type="JSON", required=False) for column in fixture_columns
    )

    def fixture_target(column: str) -> str:
        return next((root for root in roots if column.startswith(root + ".")), column)

    nodes = tuple(
        CsvTemplateNode(
            node_id=node_id,
            parent_node_id=parent,
            input_columns=tuple(column for column in input_columns if column in inputs),
            context_columns=tuple(f"context.{key}" for key in context_keys if key in contexts),
            fixture_columns=tuple(
                column for column in fixture_columns if column in {fixture_target(out) for out in outputs}
            ),
        )
        for node_id, parent, inputs, contexts, outputs in raw_nodes
    )
    output = StringIO(newline="")
    writer = csv.writer(output)
    writer.writerow([field.column for field in fields])
    writer.writerow([field.example for field in fields])
    return CsvTemplate(flow_id=flow_id, fields=tuple(fields), nodes=nodes, csv=output.getvalue())
