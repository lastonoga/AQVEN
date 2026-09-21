import hashlib
import json
from collections.abc import Iterator
from dataclasses import dataclass
from pathlib import Path
from typing import Final

from pydantic import JsonValue, TypeAdapter

BLOB_FOLDER: Final = "blobs"
BLOB_KEY: Final = "$aqven_blob"
BLOB_PREFIX: Final = "sha256-"
BLOB_SUFFIX: Final = ".txt"
BLOB_THRESHOLD: Final = 1024
CASSETTE_FOLDER: Final = "cassettes"
RECORDING_SUFFIX: Final = ".json"
PACKED_FIELDS: Final = frozenset({"events", "response"})
JSON_DOCUMENT: Final[TypeAdapter[JsonValue]] = TypeAdapter(JsonValue)


class BlobMissing(FileNotFoundError):
    def __init__(self, path: Path) -> None:
        super().__init__(f"cassette blob {path} is missing: restore it or record the cassette again")
        self.path = path


def blob_root(directory: Path) -> Path:
    for folder in (directory, *directory.parents):
        if folder.name == CASSETTE_FOLDER:
            return folder / BLOB_FOLDER
    return directory / BLOB_FOLDER


def blob_id(text: str) -> str:
    return f"{BLOB_PREFIX}{hashlib.sha256(text.encode('utf-8')).hexdigest()}"


def blob_reference(value: JsonValue) -> str | None:
    if not isinstance(value, dict) or len(value) != 1:
        return None
    reference = value.get(BLOB_KEY)
    return reference if isinstance(reference, str) else None


@dataclass(frozen=True, slots=True)
class BlobVault:
    directory: Path
    threshold: int = BLOB_THRESHOLD

    def path(self, reference: str) -> Path:
        return self.directory / f"{reference.removeprefix(BLOB_PREFIX)}{BLOB_SUFFIX}"

    def store(self, text: str) -> str:
        reference = blob_id(text)
        target = self.path(reference)
        if target.is_file():
            return reference
        target.parent.mkdir(parents=True, exist_ok=True)
        staging = target.with_suffix(".tmp")
        staging.write_text(text, encoding="utf-8")
        staging.replace(target)
        return reference

    def read(self, reference: str) -> str:
        target = self.path(reference)
        if not target.is_file():
            raise BlobMissing(target)
        return target.read_text(encoding="utf-8")

    def pack(self, value: JsonValue) -> JsonValue:
        if isinstance(value, str):
            return {BLOB_KEY: self.store(value)} if len(value) > self.threshold else value
        if isinstance(value, list):
            return [self.pack(item) for item in value]
        if isinstance(value, dict):
            return {key: self.pack(item) for key, item in value.items()}
        return value

    def unpack(self, value: JsonValue) -> JsonValue:
        reference = blob_reference(value)
        if reference is not None:
            return self.read(reference)
        if isinstance(value, list):
            return [self.unpack(item) for item in value]
        if isinstance(value, dict):
            return {key: self.unpack(item) for key, item in value.items()}
        return value

    def references(self, value: JsonValue) -> Iterator[str]:
        reference = blob_reference(value)
        if reference is not None:
            yield reference
            return
        if isinstance(value, list):
            for item in value:
                yield from self.references(item)
        if isinstance(value, dict):
            for item in value.values():
                yield from self.references(item)


def document_fields(document: JsonValue) -> dict[str, JsonValue]:
    return dict(document) if isinstance(document, dict) else {}


def packed_document(document: JsonValue, vault: BlobVault) -> JsonValue:
    fields = document_fields(document)
    return {key: vault.pack(value) if key in PACKED_FIELDS else value for key, value in fields.items()}


def inlined_document(document: JsonValue, vault: BlobVault) -> JsonValue:
    fields = document_fields(document)
    return {key: vault.unpack(value) if key in PACKED_FIELDS else value for key, value in fields.items()}


def document_text(document: JsonValue) -> str:
    return json.dumps(document, indent=2, ensure_ascii=False) + "\n"


@dataclass(frozen=True, slots=True)
class PackReport:
    files: int
    rewritten: int
    blobs: int
    bytes_before: int
    bytes_after: int

    def line(self) -> str:
        saved = self.bytes_before - self.bytes_after
        return (
            f"cassettes {self.files}, rewritten {self.rewritten}, blobs {self.blobs}, "
            f"{self.bytes_before} to {self.bytes_after} bytes, saved {saved}"
        )


def recording_paths(directory: Path) -> Iterator[Path]:
    blobs = blob_root(directory)
    return (path for path in sorted(directory.rglob(f"*{RECORDING_SUFFIX}")) if path.parent != blobs)


def pack_file(path: Path, vault: BlobVault) -> tuple[int, int]:
    before = path.read_bytes()
    after = document_text(packed_document(JSON_DOCUMENT.validate_json(before), vault)).encode("utf-8")
    if after != before:
        path.write_bytes(after)
    return len(before), len(after)


def pack_directory(directory: Path) -> PackReport:
    vault = BlobVault(blob_root(directory))
    sizes = [pack_file(path, vault) for path in recording_paths(directory)]
    blobs = sorted(vault.directory.glob(f"*{BLOB_SUFFIX}")) if vault.directory.is_dir() else []
    return PackReport(
        files=len(sizes),
        rewritten=sum(1 for before, after in sizes if before != after),
        blobs=len(blobs),
        bytes_before=sum(before for before, _ in sizes),
        bytes_after=sum(after for _, after in sizes) + sum(path.stat().st_size for path in blobs),
    )
