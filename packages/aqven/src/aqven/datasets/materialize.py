import hashlib
import posixpath
from collections.abc import Callable, Iterable, Iterator, Mapping, Sequence
from dataclasses import dataclass, field
from enum import StrEnum
from pathlib import Path, PurePosixPath
from typing import Final, Protocol, TypeGuard

from pydantic import BaseModel, ConfigDict, JsonValue, ValidationError

from aqven.datasets.media_refs import (
    EXPECTED_OUTPUT_PART,
    INPUTS_PART,
    NODE_OUTPUTS_PART,
    JsonPath,
    media_extension,
    media_file_candidates,
    media_file_name,
    media_type_fits,
)
from aqven.loader import dataset_media_folder, file_hash
from aqven.loader.aliases import AliasScope
from aqven.spec import MEDIA_FILE_KEY, MEDIA_KEY, BlobId, DatasetId, MediaFileRef, MediaValue
from aqven.write.canonical import JsonObject, canonical_yaml, parse_document

CASES_KEY: Final = "cases"
CASE_NAME_KEY: Final = "name"
BLOB_KEY: Final = "blob_id"
BLOB_PREFIX: Final = "sha256-"
SHORT_HASH_LENGTH: Final = 12
REPORT_CONFIG: Final = ConfigDict(frozen=True, extra="forbid")

type MediaPlace = tuple[JsonPath, dict[str, JsonValue]]


class BlobSource(Protocol):
    def exists(self, blob_id: str) -> bool: ...

    def read(self, blob_id: str) -> bytes: ...


class ProjectFilesWriter(Protocol):
    def write(self, files: Mapping[str, bytes], expected: Mapping[str, str | None]) -> None: ...


class MaterializeError(Exception):
    pass


class DatasetUnreadable(MaterializeError):
    def __init__(self, path: str) -> None:
        super().__init__(f"{path} does not parse as a YAML definition: fix the file first")
        self.path = path


class BlobCorrupt(MaterializeError):
    def __init__(self, blob_id: str, found: str) -> None:
        super().__init__(f"blob {blob_id} in the blob store holds other bytes ({found}): nothing was written")
        self.blob_id = blob_id
        self.found = found


class LeftReason(StrEnum):
    MISSING = "missing"
    EXTRA_FIELDS = "extra_fields"
    INVALID = "invalid"


class Slot(StrEnum):
    FREE = "free"
    SAME = "same"
    TAKEN = "taken"


class MediaCopy(BaseModel):
    model_config = REPORT_CONFIG

    blob_id: BlobId
    file: str
    size_bytes: int
    present: bool


class RewrittenMedia(BaseModel):
    model_config = REPORT_CONFIG

    location: JsonPath
    case: str | None
    blob_id: BlobId
    reference: MediaFileRef


class LeftMedia(BaseModel):
    model_config = REPORT_CONFIG

    location: JsonPath
    case: str | None
    blob_id: str | None
    reason: LeftReason


class DatasetMaterialization(BaseModel):
    model_config = REPORT_CONFIG

    dataset_id: DatasetId
    path: str
    folder: str
    file_hash: str
    copies: tuple[MediaCopy, ...]
    rewritten: tuple[RewrittenMedia, ...]
    left: tuple[LeftMedia, ...]

    @property
    def changed(self) -> bool:
        return bool(self.rewritten)

    @property
    def touched(self) -> bool:
        return bool(self.rewritten or self.left)


class MaterializeReport(BaseModel):
    model_config = REPORT_CONFIG

    dry_run: bool
    blob_store: str
    datasets: tuple[DatasetMaterialization, ...]

    @property
    def copied(self) -> int:
        return sum(1 for dataset in self.datasets for copy in dataset.copies if not copy.present)

    @property
    def files(self) -> int:
        return sum(len(dataset.copies) for dataset in self.datasets)

    @property
    def rewritten(self) -> int:
        return sum(len(dataset.rewritten) for dataset in self.datasets)

    @property
    def missing(self) -> int:
        return sum(1 for dataset in self.datasets for left in dataset.left if left.reason is LeftReason.MISSING)

    @property
    def left(self) -> int:
        return sum(len(dataset.left) for dataset in self.datasets)


@dataclass(frozen=True, slots=True)
class DatasetSource:
    dataset_id: DatasetId
    path: str


@dataclass(frozen=True, slots=True)
class FoundMedia:
    location: JsonPath
    case: str | None
    value: dict[str, JsonValue]

    @property
    def blob_id(self) -> str | None:
        found = self.value.get(BLOB_KEY)
        return found if isinstance(found, str) else None

    def left(self, reason: LeftReason) -> LeftMedia:
        return LeftMedia(location=self.location, case=self.case, blob_id=self.blob_id, reason=reason)

    def rewritten(self, media: MediaValue, file: str) -> RewrittenMedia:
        reference = file_reference(media, file)
        return RewrittenMedia(location=self.location, case=self.case, blob_id=media.blob_id, reference=reference)


@dataclass(frozen=True, slots=True)
class PlannedDataset:
    report: DatasetMaterialization
    document: JsonObject


@dataclass(frozen=True, slots=True)
class MaterializePlan:
    datasets: tuple[PlannedDataset, ...]

    @property
    def changed(self) -> tuple[PlannedDataset, ...]:
        return tuple(item for item in self.datasets if item.report.changed)

    def report(self, *, dry_run: bool, blob_store: str) -> MaterializeReport:
        return MaterializeReport(
            dry_run=dry_run, blob_store=blob_store, datasets=tuple(item.report for item in self.datasets)
        )


@dataclass(slots=True)
class FolderNames:
    root: Path
    folder: str
    assigned: dict[BlobId, str] = field(default_factory=dict[BlobId, str])
    taken: dict[str, BlobId] = field(default_factory=dict[str, BlobId])
    copies: list[MediaCopy] = field(default_factory=list[MediaCopy])

    def file_for(self, media: MediaValue) -> str:
        known = self.assigned.get(media.blob_id)
        if known is not None:
            return known
        slots = ((name, self._slot(name, media.blob_id)) for name in media_file_candidates(wanted_file_name(media)))
        name, slot = next(item for item in slots if item[1] is not Slot.TAKEN)
        self.assigned[media.blob_id] = name
        self.taken[name.casefold()] = media.blob_id
        self.copies.append(
            MediaCopy(
                blob_id=media.blob_id,
                file=posixpath.join(self.folder, name),
                size_bytes=media.size_bytes,
                present=slot is Slot.SAME,
            )
        )
        return name

    def _slot(self, name: str, blob_id: BlobId) -> Slot:
        if name.casefold() in self.taken:
            return Slot.TAKEN
        location = self.root / self.folder / name
        if not location.exists():
            return Slot.FREE
        same = location.is_file() and content_blob_id(location.read_bytes()) == blob_id
        return Slot.SAME if same else Slot.TAKEN


@dataclass(frozen=True, slots=True)
class MediaMaterializer:
    root: Path
    blobs: BlobSource
    scope: AliasScope

    def plan(self, datasets: Iterable[DatasetSource]) -> MaterializePlan:
        return MaterializePlan(tuple(self._planned(source) for source in datasets))

    def apply(self, plan: MaterializePlan, writer: ProjectFilesWriter) -> None:
        changed = plan.changed
        if not changed:
            return
        copies = tuple(copy for item in changed for copy in item.report.copies if not copy.present)
        media = {copy.file: self._blob_bytes(copy) for copy in copies}
        expected: dict[str, str | None] = {
            **dict.fromkeys(media),
            **{item.report.path: item.report.file_hash for item in changed},
        }
        writer.write({**media, **self.dataset_files(changed)}, expected)

    def dataset_files(self, changed: Sequence[PlannedDataset]) -> dict[str, bytes]:
        return {
            item.report.path: canonical_yaml(
                item.report.path, rewritten_document(item.document, item.report.rewritten), self.scope
            )
            for item in changed
        }

    def _planned(self, source: DatasetSource) -> PlannedDataset:
        data = (self.root / source.path).read_bytes()
        document = parse_document(source.path, data)
        if document is None:
            raise DatasetUnreadable(source.path)
        names = FolderNames(self.root, dataset_media_folder(source.path))
        outcomes = tuple(self._outcome(found, names) for found in blob_media(document))
        report = DatasetMaterialization(
            dataset_id=source.dataset_id,
            path=source.path,
            folder=names.folder,
            file_hash=file_hash(data),
            copies=tuple(names.copies),
            rewritten=tuple(item for item in outcomes if isinstance(item, RewrittenMedia)),
            left=tuple(item for item in outcomes if isinstance(item, LeftMedia)),
        )
        return PlannedDataset(report, document)

    def _outcome(self, found: FoundMedia, names: FolderNames) -> RewrittenMedia | LeftMedia:
        media = parsed_media(found.value)
        if media is None:
            return found.left(LeftReason.INVALID)
        reason = next((reason for rule, reason in LEFT_RULES if rule(media, self.blobs)), None)
        if reason is not None:
            return found.left(reason)
        return found.rewritten(media, names.file_for(media))

    def _blob_bytes(self, copy: MediaCopy) -> bytes:
        data = self.blobs.read(copy.blob_id)
        found = content_blob_id(data)
        if found != copy.blob_id:
            raise BlobCorrupt(copy.blob_id, found)
        return data


def content_blob_id(data: bytes) -> str:
    return f"{BLOB_PREFIX}{hashlib.sha256(data).hexdigest()}"


def short_blob_name(blob_id: str) -> str:
    return blob_id.removeprefix(BLOB_PREFIX)[:SHORT_HASH_LENGTH]


def wanted_file_name(media: MediaValue) -> str:
    base = PurePosixPath(media_file_name(media.name) if media.name else short_blob_name(media.blob_id))
    extension = media_extension(media.media_type)
    if extension is None or (base.suffix and media_type_fits(media.media_type, base.name)):
        return base.name
    return f"{base.stem}{extension}"


def file_reference(media: MediaValue, file: str) -> MediaFileRef:
    name = media.name if media.name and media.name != file else None
    return MediaFileRef(media_type=media.media_type, file=file, name=name)


def is_blob_ref(value: JsonValue) -> TypeGuard[dict[str, JsonValue]]:
    return isinstance(value, dict) and MEDIA_KEY in value and BLOB_KEY in value and MEDIA_FILE_KEY not in value


def parsed_media(value: dict[str, JsonValue]) -> MediaValue | None:
    try:
        return MediaValue.model_validate(value)
    except ValidationError:
        return None


def blob_media(document: JsonObject) -> Iterator[FoundMedia]:
    cases = document.get(CASES_KEY)
    listed = cases if isinstance(cases, list) else []
    for index, case in enumerate(listed):
        yield from case_blob_media(index, case)


def case_blob_media(index: int, case: JsonValue) -> Iterator[FoundMedia]:
    if not isinstance(case, dict):
        return
    name = case.get(CASE_NAME_KEY)
    label = name if isinstance(name, str) else None
    for part, value in case_parts(case):
        yield from (
            FoundMedia(location, label, found) for location, found in blob_refs(value, (CASES_KEY, index, *part))
        )


def case_parts(case: dict[str, JsonValue]) -> tuple[tuple[JsonPath, JsonValue], ...]:
    outputs = case.get(NODE_OUTPUTS_PART)
    nodes = outputs if isinstance(outputs, dict) else {}
    node_parts = tuple(((NODE_OUTPUTS_PART, node), value) for node, value in nodes.items())
    return (
        ((INPUTS_PART,), case.get(INPUTS_PART)),
        *node_parts,
        ((EXPECTED_OUTPUT_PART,), case.get(EXPECTED_OUTPUT_PART)),
    )


def blob_refs(value: JsonValue, path: JsonPath) -> Iterator[MediaPlace]:
    if is_blob_ref(value):
        yield path, value
        return
    for key, item in json_children(value):
        yield from blob_refs(item, (*path, key))


def json_children(value: JsonValue) -> tuple[tuple[str | int, JsonValue], ...]:
    if isinstance(value, dict):
        return tuple(value.items())
    if isinstance(value, list):
        return tuple(enumerate(value))
    return ()


def rewritten_document(document: JsonObject, rewritten: Sequence[RewrittenMedia]) -> JsonObject:
    replacements: dict[JsonPath, JsonValue] = {
        item.location: item.reference.model_dump(mode="json", by_alias=True) for item in rewritten
    }
    return {key: replaced_at(value, replacements, (key,)) for key, value in document.items()}


def replaced_at(value: JsonValue, replacements: Mapping[JsonPath, JsonValue], path: JsonPath) -> JsonValue:
    if path in replacements:
        return replacements[path]
    if isinstance(value, dict):
        return {key: replaced_at(item, replacements, (*path, key)) for key, item in value.items()}
    if isinstance(value, list):
        return [replaced_at(item, replacements, (*path, index)) for index, item in enumerate(value)]
    return value


def _carries_extra_fields(media: MediaValue, blobs: BlobSource) -> bool:
    return any(value is not None for value in (media.url, media.poster_blob_id, media.note))


def _missing(media: MediaValue, blobs: BlobSource) -> bool:
    return not blobs.exists(media.blob_id)


LEFT_RULES: Final[tuple[tuple[Callable[[MediaValue, BlobSource], bool], LeftReason], ...]] = (
    (_carries_extra_fields, LeftReason.EXTRA_FIELDS),
    (_missing, LeftReason.MISSING),
)
