from collections.abc import Iterator
from dataclasses import dataclass
from pathlib import Path, PurePosixPath
from typing import Final

from pydantic import JsonValue

from aqven.datasets import (
    JsonPath,
    MediaFileMissing,
    MediaFileRefInvalid,
    MediaPathInvalid,
    case_media_file_refs,
    guessed_media_type,
    locate_media_file,
    media_type_fits,
    parse_media_file_ref,
)
from aqven.diagnostics import Diagnostic, DiagnosticCode, diagnostic, render_path, templated_diagnostic
from aqven.loader import SourceSpec, YamlPath, dataset_media_folder
from aqven.spec import MEDIA_FILE_KEY, MEDIA_KEY, DatasetFile, DatasetId, MediaFileRef

CASES_KEY: Final = "cases"
NO_EXTENSION: Final = "(none)"
SHAPE_FIX: Final = "a media value holds $media with file (and an optional name) or $media with blob_id, not both"


@dataclass(frozen=True, slots=True)
class MediaSite:
    root: Path
    dataset_id: DatasetId
    source: SourceSpec[DatasetFile]
    index: int
    location: JsonPath

    @property
    def case(self) -> str:
        return self.source.spec.cases[self.index].name

    @property
    def path(self) -> YamlPath:
        return (CASES_KEY, self.index, *self.location)

    @property
    def file_path(self) -> YamlPath:
        return (*self.path, MEDIA_FILE_KEY)

    @property
    def media_type_path(self) -> YamlPath:
        return (*self.path, MEDIA_KEY)

    def values(self, reference: MediaFileRef, **extra: str) -> dict[str, str]:
        return {
            "case": self.case,
            "dataset": self.dataset_id,
            "file": reference.file,
            "folder": dataset_media_folder(self.source.path),
            **extra,
        }


def dataset_media(root: Path, dataset_id: DatasetId, source: SourceSpec[DatasetFile]) -> Iterator[Diagnostic]:
    for index, case in enumerate(source.spec.cases):
        for location, reference in case_media_file_refs(case):
            yield from _reference(MediaSite(root, dataset_id, source, index, location), reference)


def _reference(site: MediaSite, value: dict[str, JsonValue]) -> Iterator[Diagnostic]:
    try:
        reference = parse_media_file_ref(value)
    except MediaFileRefInvalid as error:
        message = f"case {site.case}: {render_path(site.location)}: {error.problem}"
        yield diagnostic(DiagnosticCode.E_SPEC_INVALID, site.source.path, site.path, message, hint=SHAPE_FIX)
        return
    yield from _located(site, reference)
    yield from _media_type(site, reference)


def _located(site: MediaSite, reference: MediaFileRef) -> Iterator[Diagnostic]:
    try:
        locate_media_file(site.root, reference.file, site.source.path)
    except MediaPathInvalid as error:
        values = site.values(reference, problem=error.phrase)
        yield templated_diagnostic(DiagnosticCode.E_MEDIA_PATH_INVALID, site.source.path, site.file_path, values)
    except MediaFileMissing as error:
        values = site.values(reference, path=error.path)
        yield templated_diagnostic(DiagnosticCode.E_MEDIA_FILE_MISSING, site.source.path, site.file_path, values)


def _media_type(site: MediaSite, reference: MediaFileRef) -> Iterator[Diagnostic]:
    if media_type_fits(reference.media_type, reference.file):
        return
    values = site.values(
        reference,
        extension=PurePosixPath(reference.file).suffix or NO_EXTENSION,
        media_type=reference.media_type,
        guessed=guessed_media_type(reference.file) or reference.media_type,
    )
    yield templated_diagnostic(DiagnosticCode.W_MEDIA_TYPE_MISMATCH, site.source.path, site.media_type_path, values)
