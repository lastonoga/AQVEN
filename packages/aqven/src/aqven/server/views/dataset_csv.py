"""Preview and import flat CSV cases into a flow dataset."""

import asyncio
import csv
import ipaddress
import json
import mimetypes
import re
import socket
from collections.abc import AsyncIterator, Awaitable, Callable
from dataclasses import dataclass, field
from io import StringIO
from pathlib import PurePosixPath
from typing import Final, Literal, cast
from urllib.parse import unquote, urljoin, urlsplit

import httpx2
from anyio import to_thread
from pydantic import TypeAdapter, ValidationError

from aqven.engine.selection import SelectionError, range_missing
from aqven.runtime.address import ResourceModel
from aqven.runtime.options import RunContext
from aqven.server.blobs import BlobFiles, media_of, valid_blob_id
from aqven.server.errors import ApiFailure
from aqven.server.run_inputs import input_adapter
from aqven.server.views.common import loaded_flow, loaded_project
from aqven.server.views.datasets import DatasetCreateRequest, validate_flow_cases
from aqven.server.workspace import WorkspaceState
from aqven.spec import DatasetCase, DatasetId, FlowId, MediaValue

MAX_CSV_BYTES: Final = 2 * 1024 * 1024
MAX_ROWS: Final = 1000
MAX_MEDIA_URLS: Final = 5000
MAX_MEDIA_BYTES: Final = 25 * 1024 * 1024
MAX_MEDIA_TOTAL_BYTES: Final = 500 * 1024 * 1024
MEDIA_TIMEOUT_SECONDS: Final = 10.0
MEDIA_CONCURRENCY: Final = 8
MAX_MEDIA_REDIRECTS: Final = 3
PATH_PART: Final = re.compile(r"^[A-Za-z_][A-Za-z0-9_-]*$")
LOCAL_BLOB_PATH: Final = re.compile(r"^/api/blobs/(sha256-[0-9a-f]{64})$")
MEDIA_FIELD_NAMES: Final = frozenset(
    {
        "photo", "image", "audio", "voice", "voice_note", "video",
        "clip", "invoice", "document", "pdf", "file", "attachment",
    }
)
SAFE_MEDIA_TYPES: Final = frozenset(
    {
        "image/jpeg", "image/png", "image/gif", "image/webp", "image/avif", "image/bmp",
        "audio/mpeg", "audio/mp3", "audio/wav", "audio/x-wav", "audio/ogg", "audio/flac",
        "audio/aac", "audio/mp4", "audio/webm", "video/mp4", "video/webm", "video/ogg",
        "video/quicktime", "video/mpeg", "application/pdf", "text/plain",
    }
)
FALLBACK_BLOB_ID: Final = "sha256-" + "0" * 64


class CsvColumn(ResourceModel):
    source: str
    target: str
    kind: Literal["name", "input", "context", "metadata", "expected_output", "node_outputs", "unmatched"]


class CsvNodePreview(ResourceModel):
    node_id: str
    ready: bool
    missing: tuple[str, ...] = ()


class CsvRowPreview(ResourceModel):
    number: int
    name: str
    ready: bool
    problems: tuple[str, ...] = ()
    nodes: tuple[CsvNodePreview, ...] = ()
    full_flow_ready: bool | None = None
    full_flow_missing: tuple[str, ...] = ()


class CsvMediaPreview(ResourceModel):
    row: int
    field: str
    url: str
    media_type: str | None = None
    size_bytes: int | None = None
    ready: bool
    problem: str | None = None


class CsvImportPreview(ResourceModel):
    dataset_id: str
    flow_id: FlowId
    row_count: int
    columns: tuple[CsvColumn, ...]
    rows: tuple[CsvRowPreview, ...]
    media_count: int
    media: tuple[CsvMediaPreview, ...]
    problems: tuple[str, ...]
    ready: bool


@dataclass(slots=True)
class DraftRow:
    number: int
    name: str
    inputs: dict[str, object] = field(default_factory=dict[str, object])
    context: dict[str, object] = field(default_factory=dict[str, object])
    metadata: dict[str, object] = field(default_factory=dict[str, object])
    expected_output: dict[str, object] = field(default_factory=dict[str, object])
    expected_output_root: object = None
    expected_output_root_set: bool = False
    node_outputs: dict[str, object] = field(default_factory=dict[str, object])
    problems: list[str] = field(default_factory=list[str])


@dataclass(frozen=True, slots=True)
class MediaCell:
    row: int
    field: str
    url: str
    location: tuple[str | int, ...]


@dataclass(slots=True)
class CsvDraft:
    columns: tuple[CsvColumn, ...]
    flow_id: FlowId | None
    rows: list[DraftRow]
    media: list[MediaCell]
    problems: list[str]


def _column(source: str) -> CsvColumn | None:
    if source in {"name", "case"}:
        return CsvColumn(source=source, target="name", kind="name")
    if source == "expected_output":
        return CsvColumn(source=source, target=source, kind="expected_output")
    head, dot, rest = source.partition(".")
    if head in {"inputs", "context", "metadata", "expected_output", "node_outputs"}:
        if not dot or not rest:
            return None
        kind = cast(
            Literal["input", "context", "metadata", "expected_output", "node_outputs"],
            "input" if head == "inputs" else head,
        )
        target = f"inputs.{rest}" if kind == "input" else source
    else:
        kind = "input"
        target = f"inputs.{source}"
    if not all(PATH_PART.fullmatch(part) for part in target.split(".")):
        return None
    return CsvColumn(source=source, target=target, kind=kind)


def _cell_value(raw: str, *, text_field: bool, nullable: bool) -> object:
    value = raw.strip()
    if not value:
        return None
    if text_field:
        return None if nullable and value == "null" else raw
    if value[0] in "[{" or value in {"true", "false", "null"} or re.fullmatch(r"-?(?:0|[1-9]\d*)(?:\.\d+)?", value):
        try:
            return json.loads(value)
        except json.JSONDecodeError:
            return value
    return value


def _schema_path(path: tuple[str, ...]) -> str:
    parts: list[str] = []
    for token in path:
        if token == "[]" and parts:
            parts[-1] += "[]"
        else:
            parts.append(token)
    return "inputs." + ".".join(parts)


def input_field_hints(
    adapter: TypeAdapter[object],
) -> tuple[frozenset[str], frozenset[str], frozenset[str], frozenset[str]]:
    schema = cast(dict[str, object], adapter.json_schema())
    raw_definitions = schema.get("$defs", {})
    definitions = cast(dict[str, object], raw_definitions) if isinstance(raw_definitions, dict) else {}
    media_fields: set[str] = set()
    nullable_fields: set[str] = set()
    text_fields: set[str] = set()
    known_fields: set[str] = set()

    def walk(node: object, path: tuple[str, ...], refs: frozenset[str]) -> None:
        if not isinstance(node, dict):
            return
        item = cast(dict[str, object], node)
        if path:
            known_fields.add(_schema_path(path))
        if item.get("type") == "string" or isinstance(item.get("const"), str):
            text_fields.add(_schema_path(path))
        any_of = item.get("anyOf")
        if isinstance(any_of, list):
            for variant in cast(list[object], any_of):
                if isinstance(variant, dict) and cast(dict[str, object], variant).get("type") == "null":
                    nullable_fields.add(_schema_path(path))
                    break
        reference = item.get("$ref")
        if isinstance(reference, str) and reference.startswith("#/$defs/") and reference not in refs:
            walk(definitions.get(reference.removeprefix("#/$defs/")), path, refs | {reference})
        raw_properties = item.get("properties")
        if isinstance(raw_properties, dict):
            properties = cast(dict[str, object], raw_properties)
            if {"$media", "blob_id", "size_bytes"} <= properties.keys():
                media_fields.add(_schema_path(path))
                return
            for key, child in properties.items():
                walk(child, (*path, key), refs)
        items = item.get("items")
        if items is not None:
            walk(items, (*path, "[]"), refs)
        for branch in ("anyOf", "oneOf", "allOf"):
            variants = item.get(branch)
            if isinstance(variants, list):
                for variant in cast(list[object], variants):
                    walk(variant, path, refs)

    walk(schema, (), frozenset())
    return frozenset(media_fields), frozenset(nullable_fields), frozenset(text_fields), frozenset(known_fields)


def _media_target(column: CsvColumn, media_fields: frozenset[str]) -> bool:
    if column.kind == "input":
        return column.target in media_fields
    return column.kind in {"expected_output", "node_outputs"} and column.target.rsplit(".", 1)[-1] in MEDIA_FIELD_NAMES


def _bucket(row: DraftRow, kind: str) -> dict[str, object]:
    match kind:
        case "input" | "inputs":
            return row.inputs
        case "context":
            return row.context
        case "metadata":
            return row.metadata
        case "expected_output":
            return row.expected_output
        case "node_outputs":
            return row.node_outputs
        case _:
            raise ValueError(f"unknown CSV column kind: {kind}")


def _fill_nullable(row: DraftRow, nullable_fields: frozenset[str]) -> None:
    for field_path in sorted(nullable_fields, key=lambda field: field.count(".")):
        path = field_path.split(".")[1:]
        current = row.inputs
        for part in path[:-1]:
            child = current.get(part)
            if not isinstance(child, dict):
                break
            current = cast(dict[str, object], child)
        else:
            current.setdefault(path[-1], None)


def _array_media_cells(row: DraftRow, pattern: str) -> list[MediaCell]:
    tokens: list[str | None] = []
    for part in pattern.removeprefix("inputs.").split("."):
        name = part.removesuffix("[]")
        tokens.append(name)
        if part.endswith("[]"):
            tokens.append(None)
    found: list[MediaCell] = []

    def walk(value: object, pending: list[str | None], location: tuple[str | int, ...]) -> None:
        if not pending:
            if isinstance(value, str):
                label = "inputs" + "".join(
                    f"[{part}]" if isinstance(part, int) else f".{part}" for part in location
                )
                found.append(MediaCell(row.number, label, value, ("inputs", *location)))
            return
        head, *tail = pending
        if head is None and isinstance(value, list):
            for index, item in enumerate(cast(list[object], value)):
                walk(item, tail, (*location, index))
        elif isinstance(head, str) and isinstance(value, dict) and head in value:
            walk(cast(dict[str, object], value)[head], tail, (*location, head))

    walk(row.inputs, tokens, ())
    return found


def parse_csv(
    data: bytes,
    media_fields: frozenset[str],
    nullable_fields: frozenset[str],
    text_fields: frozenset[str],
    known_fields: frozenset[str],
) -> CsvDraft:
    if len(data) > MAX_CSV_BYTES:
        raise ApiFailure("REQUEST_INVALID", f"CSV file exceeds {MAX_CSV_BYTES // (1024 * 1024)} MB")
    try:
        text = data.decode("utf-8-sig")
    except UnicodeDecodeError as error:
        raise ApiFailure("REQUEST_INVALID", "CSV file must be UTF-8 encoded") from error
    try:
        reader = csv.reader(StringIO(text, newline=""), strict=True)
        raw_headers = next(reader, list[str]())
        headers = [header.strip() for header in raw_headers]
        mapped_columns: list[CsvColumn] = []
        problems: list[str] = []
        for header in headers:
            possible_column = _column(header)
            if possible_column is None:
                problems.append(f"column {header or '(blank)'} has an invalid field path")
                mapped = CsvColumn(source=header, target="", kind="unmatched")
            elif possible_column.kind == "input" and possible_column.target not in known_fields:
                problems.append(f"column {possible_column.target} is not in the flow input schema")
                mapped = CsvColumn(source=header, target="", kind="unmatched")
            else:
                mapped = possible_column
            mapped_columns.append(mapped)
        columns = mapped_columns
        targets = [column.target for column in columns if column.target]
        if "name" not in targets:
            problems.append("CSV needs a name or case column")
        if len(targets) != len(set(targets)):
            problems.append("multiple columns map to the same target field")
        if any(left != right and right.startswith(left + ".") for left in targets for right in targets):
            problems.append("a root field and its nested fields cannot both have CSV columns")
        rows: list[DraftRow] = []
        media: list[MediaCell] = []
        names: set[str] = set()
        for values in reader:
            if not values or all(not value.strip() for value in values):
                continue
            if len(rows) >= MAX_ROWS:
                problems.append(f"CSV contains more than {MAX_ROWS} cases")
                break
            row = DraftRow(number=reader.line_num, name="")
            if len(values) != len(headers):
                row.problems.append(f"row {row.number} has {len(values)} cells; expected {len(headers)}")
            for column, raw in zip(mapped_columns, values, strict=False):
                if column.kind == "unmatched":
                    continue
                value = _cell_value(
                    raw,
                    text_field=column.target in text_fields,
                    nullable=column.target in nullable_fields,
                )
                if column.kind == "name":
                    row.name = raw.strip()
                    continue
                if column.target == "expected_output":
                    if raw.strip():
                        row.expected_output_root = value
                        row.expected_output_root_set = True
                    continue
                if not raw.strip():
                    continue
                if isinstance(value, str) and _media_target(column, media_fields):
                    media.append(
                        MediaCell(
                            row=row.number,
                            field=column.target,
                            url=value,
                            location=tuple(column.target.split(".")),
                        )
                    )
                    continue
                bucket = _bucket(row, column.kind)
                path = column.target.split(".")[1:]
                current = bucket
                for part in path[:-1]:
                    child = current.setdefault(part, {})
                    if not isinstance(child, dict):
                        row.problems.append(f"column {column.source} conflicts with another field")
                        break
                    current = cast(dict[str, object], child)
                else:
                    if path[-1] in current:
                        row.problems.append(f"column {column.source} conflicts with another field")
                    else:
                        current[path[-1]] = value
            if not row.name:
                row.problems.append(f"row {row.number} needs a case name")
            elif row.name in names:
                row.problems.append(f"row {row.number} has a duplicate case name: {row.name}")
            names.add(row.name)
            _fill_nullable(row, nullable_fields)
            for pattern in media_fields:
                if "[]" in pattern:
                    media.extend(_array_media_cells(row, pattern))
            rows.append(row)
        if not rows:
            problems.append("CSV needs at least one case row")
        if len(media) > MAX_MEDIA_URLS:
            problems.append(f"CSV contains more than {MAX_MEDIA_URLS} media URLs")
        return CsvDraft(tuple(columns), None, rows, media, problems)
    except csv.Error as error:
        raise ApiFailure("REQUEST_INVALID", f"CSV syntax is invalid: {error}") from error


def _case(row: DraftRow) -> DatasetCase:
    return DatasetCase.model_validate(
        {
            "name": row.name,
            "inputs": row.inputs,
            "context": row.context or None,
            "metadata": row.metadata or None,
            "expected_output": (
                row.expected_output_root if row.expected_output_root_set else row.expected_output or None
            ),
            "node_outputs": row.node_outputs or None,
        }
    )


def _set_media(row: DraftRow, item: MediaCell, media: MediaValue) -> None:
    current: object = _bucket(row, str(item.location[0]))
    for index, part in enumerate(item.location[1:-1], start=1):
        if isinstance(part, int):
            if not isinstance(current, list):
                raise ValueError(f"field {item.field} conflicts with another CSV column")
            items = cast(list[object], current)
            if part >= len(items):
                raise ValueError(f"field {item.field} conflicts with another CSV column")
            current = items[part]
        else:
            if not isinstance(current, dict):
                raise ValueError(f"field {item.field} conflicts with another CSV column")
            next_part = item.location[index + 1]
            current = _nested_media_value(cast(dict[str, object], current), part, next_part)  # pyright: ignore[reportUnnecessaryCast]
    last = item.location[-1]
    payload = media.model_dump(mode="json", by_alias=True, exclude_none=True)
    if isinstance(last, int) and isinstance(current, list):
        items = cast(list[object], current)
        if last >= len(items):
            raise ValueError(f"field {item.field} conflicts with another CSV column")
        items[last] = payload
    elif isinstance(last, str) and isinstance(current, dict):
        cast(dict[str, object], current)[last] = payload
    else:
        raise ValueError(f"field {item.field} conflicts with another CSV column")


def _nested_media_value(mapping: dict[str, object], key: str, next_part: str | int) -> object:
    return mapping.setdefault(key, [] if isinstance(next_part, int) else {})


async def _public_addresses(hostname: str, port: int) -> tuple[str, ...]:
    try:
        records = await to_thread.run_sync(socket.getaddrinfo, hostname, port, 0, socket.SOCK_STREAM)
    except OSError as error:
        raise ValueError(f"media host {hostname} cannot be resolved") from error
    addresses = tuple(dict.fromkeys(str(item[4][0]) for item in records))
    if not addresses or any(not ipaddress.ip_address(address).is_global for address in addresses):
        raise ValueError("media URL must resolve only to public addresses")
    return addresses


def _media_name(url: str) -> str | None:
    name = PurePosixPath(unquote(urlsplit(url).path)).name
    return name[:255] or None


def safe_media_type(response: httpx2.Response, url: str) -> str:
    declared = response.headers.get("content-type", "").split(";", 1)[0].strip().lower()
    guessed, _ = mimetypes.guess_type(urlsplit(url).path)
    media_type = guessed if declared in {"", "application/octet-stream"} and guessed else declared
    if media_type not in SAFE_MEDIA_TYPES:
        raise ValueError(f"media URL has unsupported content type: {media_type or 'unknown'}")
    return media_type


def _media_size(response: httpx2.Response) -> int | None:
    raw = response.headers.get("content-length")
    if raw is None:
        return None
    try:
        size = int(raw)
    except ValueError as error:
        raise ValueError("media URL has an invalid Content-Length") from error
    if size < 0 or size > MAX_MEDIA_BYTES:
        raise ValueError(f"media URL exceeds {MAX_MEDIA_BYTES // (1024 * 1024)} MB")
    return size


async def remote_media(url: str, *, download: bool) -> tuple[str, int | None, bytes | None]:
    current = url
    async with httpx2.AsyncClient(timeout=MEDIA_TIMEOUT_SECONDS, follow_redirects=False, trust_env=False) as http:
        for hop in range(MAX_MEDIA_REDIRECTS + 1):
            try:
                parsed = urlsplit(current)
                if parsed.scheme not in {"http", "https"} or not parsed.hostname or parsed.username or parsed.password:
                    raise ValueError("media URL must be a public HTTP(S) URL without credentials")
                port = parsed.port or (443 if parsed.scheme == "https" else 80)
            except ValueError as error:
                raise ValueError("media URL has an invalid address or port") from error
            addresses = await _public_addresses(parsed.hostname, port)
            pinned = httpx2.URL(current).copy_with(host=addresses[0], fragment=None)
            try:
                async with http.stream(
                    "GET",
                    pinned,
                    headers={"Host": parsed.netloc},
                    extensions={"sni_hostname": parsed.hostname},
                ) as response:
                    if response.status_code in {301, 302, 303, 307, 308}:
                        location = response.headers.get("location")
                        if not location or hop == MAX_MEDIA_REDIRECTS:
                            raise ValueError("media URL redirected too many times or has no Location")
                        current = urljoin(current, location)
                        continue
                    if response.status_code != 200:
                        raise ValueError(f"media URL returned HTTP {response.status_code}")
                    media_type = safe_media_type(response, current)
                    size = _media_size(response)
                    if not download:
                        return media_type, size, None
                    chunks: list[bytes] = []
                    total = 0
                    async for chunk in response.aiter_bytes():
                        total += len(chunk)
                        if total > MAX_MEDIA_BYTES:
                            raise ValueError(f"media URL exceeds {MAX_MEDIA_BYTES // (1024 * 1024)} MB")
                        chunks.append(chunk)
                    return media_type, total, b"".join(chunks)
            except httpx2.HTTPError as error:
                raise ValueError(f"media URL could not be reached: {type(error).__name__}") from error
    raise ValueError("media URL redirected too many times")


async def _bytes(data: bytes) -> AsyncIterator[bytes]:
    yield data


async def _resolve_media(
    url: str,
    blobs: BlobFiles,
    *,
    download: bool,
    reserve: Callable[[int], Awaitable[None]],
    store_lock: asyncio.Lock,
) -> tuple[MediaValue, int | None]:
    parsed = urlsplit(url)
    local = LOCAL_BLOB_PATH.fullmatch(parsed.path)
    if parsed.hostname in {"localhost", "127.0.0.1", "::1"} and local and not parsed.query:
        blob_id = local.group(1)
        if not valid_blob_id(blob_id):
            raise ValueError("local media URL has an invalid blob ID")
        found = await blobs.locate(blob_id)
        if found is None:
            raise ValueError("local media URL points to a missing blob")
        await reserve(found.meta.size_bytes)
        return media_of(found.meta), found.meta.size_bytes
    media_type, size, content = await remote_media(url, download=download)
    await reserve(len(content) if content is not None else size or 0)
    if content is not None:
        async with store_lock:
            meta = await blobs.store(_bytes(content), media_type, _media_name(url))
        return media_of(meta), meta.size_bytes
    return MediaValue.model_validate(
        {"$media": media_type, "blob_id": FALLBACK_BLOB_ID, "size_bytes": size or 0, "name": _media_name(url)}
    ), size


def _validate_rows(state: WorkspaceState, draft: CsvDraft) -> list[CsvRowPreview]:
    if draft.flow_id is None:
        raise ValueError("CSV draft has no flow ID")
    flow = loaded_flow(state, draft.flow_id)
    if flow.source is None:
        raise ApiFailure("NOT_RUNNABLE", f"flow {flow.flow_id} has no source definition")
    adapter = input_adapter(state, flow.source.spec.input)
    compiled = state.compiled.flows.get(flow.flow_id) if state.compiled is not None else None
    previews: list[CsvRowPreview] = []
    for row in draft.rows:
        problems = list(row.problems)
        try:
            adapter.validate_python(row.inputs)
        except ValidationError as error:
            problems.extend(f"inputs.{'.'.join(map(str, item['loc']))}: {item['msg']}" for item in error.errors())
        try:
            RunContext.model_validate(row.context)
        except ValidationError as error:
            problems.extend(f"context.{'.'.join(map(str, item['loc']))}: {item['msg']}" for item in error.errors())
        nodes: list[CsvNodePreview] = []
        full_flow_ready: bool | None = None
        full_flow_missing: tuple[str, ...] = ()
        if compiled is not None and row.name:
            case = _case(row)
            fixtures = case.node_outputs or {}
            context = case.context or {}
            for node_id in compiled.order:
                try:
                    missing = range_missing(compiled, node_id, node_id, case.inputs, context, fixtures)
                    nodes.append(
                        CsvNodePreview(
                            node_id=node_id,
                            ready=not missing and not problems,
                            missing=tuple(f"{item.reference}: {item.reason}" for item in missing),
                        )
                    )
                except SelectionError as error:
                    nodes.append(CsvNodePreview(node_id=node_id, ready=False, missing=(str(error),)))
            try:
                missing = range_missing(compiled, compiled.order[0], compiled.order[-1], case.inputs, context, fixtures)
                full_flow_missing = tuple(f"{item.reference}: {item.reason}" for item in missing)
                full_flow_ready = not full_flow_missing and not problems and state.report.ok
            except SelectionError as error:
                full_flow_missing = (str(error),)
                full_flow_ready = False
        previews.append(
            CsvRowPreview(
                number=row.number,
                name=row.name,
                ready=not problems,
                problems=tuple(problems),
                nodes=tuple(nodes),
                full_flow_ready=full_flow_ready,
                full_flow_missing=full_flow_missing,
            )
        )
    return previews


async def inspect_csv(
    state: WorkspaceState,
    blobs: BlobFiles,
    dataset_id: str,
    flow_id: FlowId,
    data: bytes,
    *,
    download: bool = False,
) -> tuple[CsvImportPreview, tuple[DatasetCase, ...]]:
    flow = loaded_flow(state, flow_id)
    if flow.source is None:
        raise ApiFailure("NOT_RUNNABLE", f"flow {flow_id} has no source definition")
    media_fields, nullable_fields, text_fields, known_fields = input_field_hints(
        input_adapter(state, flow.source.spec.input)
    )
    draft = parse_csv(data, media_fields, nullable_fields, text_fields, known_fields)
    draft.flow_id = flow_id
    if DatasetId(dataset_id) in loaded_project(state).datasets:
        draft.problems.append(f"dataset {dataset_id} already exists")
    media_previews: list[CsvMediaPreview] = []
    media_total = 0
    semaphore = asyncio.Semaphore(MEDIA_CONCURRENCY)
    budget_lock = asyncio.Lock()
    store_lock = asyncio.Lock()

    async def reserve(size: int) -> None:
        nonlocal media_total
        async with budget_lock:
            if media_total + size > MAX_MEDIA_TOTAL_BYTES:
                raise ValueError(f"dataset media exceeds {MAX_MEDIA_TOTAL_BYTES // (1024 * 1024)} MB")
            media_total += size

    async def resolve(url: str) -> tuple[MediaValue, int | None] | str:
        async with semaphore:
            try:
                return await _resolve_media(
                    url, blobs, download=download, reserve=reserve, store_lock=store_lock
                )
            except ValueError as error:
                return str(error)

    urls = tuple(dict.fromkeys(item.url for item in draft.media[:MAX_MEDIA_URLS]))
    results = await asyncio.gather(*(resolve(url) for url in urls))
    cache = dict(zip(urls, results, strict=True))
    by_number = {row.number: row for row in draft.rows}
    for item in draft.media[:MAX_MEDIA_URLS]:
        resolved = cache[item.url]
        row = by_number[item.row]
        if isinstance(resolved, str):
            row.problems.append(f"{item.field}: {resolved}")
            media_previews.append(
                CsvMediaPreview(row=item.row, field=item.field, url=item.url, ready=False, problem=resolved)
            )
            continue
        media, size = resolved
        try:
            _set_media(row, item, media)
        except ValueError as error:
            row.problems.append(str(error))
        media_previews.append(
            CsvMediaPreview(
                row=item.row, field=item.field, url=item.url, media_type=media.media_type, size_bytes=size, ready=True
            )
        )
    rows = _validate_rows(state, draft)
    ready = not draft.problems and all(row.ready for row in rows)
    preview = CsvImportPreview(
        dataset_id=dataset_id,
        flow_id=flow_id,
        row_count=len(rows),
        columns=draft.columns,
        rows=tuple(rows),
        media_count=len(draft.media),
        media=tuple(media_previews),
        problems=tuple(draft.problems),
        ready=ready,
    )
    cases = tuple(_case(row) for row in draft.rows) if ready else ()
    if ready:
        validate_flow_cases(state, DatasetCreateRequest(dataset_id=dataset_id, flow_id=flow_id, cases=cases))
    return preview, cases
