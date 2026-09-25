import mimetypes
import posixpath
from collections.abc import Callable, Iterator, Mapping
from dataclasses import dataclass
from enum import StrEnum
from functools import cache
from itertools import chain, count
from pathlib import Path, PurePosixPath, PureWindowsPath
from typing import Final, TypeGuard

from pydantic import JsonValue, ValidationError

from aqven.loader.layout import ROOT_PATH_PREFIX, dataset_media_folder
from aqven.spec import MEDIA_FILE_KEY, MEDIA_KEY, BlobId, DatasetCase, MediaFileRef

ENGINE_STATE_FOLDER: Final = ".aqven"
PARENT: Final = ".."
CURRENT: Final = "."
BACKSLASH: Final = "\\"
SLASH: Final = "/"
HIDDEN_PREFIX: Final = "."
FALLBACK_FILE_NAME: Final = "file"
COPY_SEPARATOR: Final = "_"
FIRST_COPY: Final = 2
PROJECT_ROOT_LABEL: Final = "the project root"
PROJECT_LABEL: Final = "the project"
PLACEHOLDER_BLOB_ID: Final = BlobId(f"sha256-{'0' * 64}")
GENERIC_MEDIA_TYPES: Final = frozenset({"application/octet-stream"})
WAVE_EXTENSION: Final = ".wav"
EXTRA_EXTENSIONS: Final[Mapping[str, str]] = {
    "audio/wav": WAVE_EXTENSION,
    "audio/x-wav": WAVE_EXTENSION,
    "audio/wave": WAVE_EXTENSION,
}
INPUTS_PART: Final = "inputs"
NODE_OUTPUTS_PART: Final = "node_outputs"
EXPECTED_OUTPUT_PART: Final = "expected_output"

type JsonPath = tuple[str | int, ...]
type MediaFileRefs = Iterator[tuple[JsonPath, dict[str, JsonValue]]]
type MediaReplacer = Callable[[JsonPath, dict[str, JsonValue]], JsonValue]


@dataclass(frozen=True, slots=True)
class MediaFit:
    media_type: str
    suffix: str
    guessed: str | None
    listed: tuple[str, ...]


class MediaPathProblem(StrEnum):
    EMPTY = "empty"
    ABSOLUTE = "absolute"
    OUTSIDE = "outside"
    ENGINE_STATE = "engine_state"
    LINKED_OUTSIDE = "linked_outside"


PROBLEM_TEXTS: Final[Mapping[MediaPathProblem, str]] = {
    MediaPathProblem.EMPTY: "is empty",
    MediaPathProblem.ABSOLUTE: "is absolute",
    MediaPathProblem.OUTSIDE: "leaves {base}",
    MediaPathProblem.ENGINE_STATE: "points into .aqven/, the local engine state",
    MediaPathProblem.LINKED_OUTSIDE: "is a link to a file outside the project",
}


class MediaFileError(Exception):
    pass


class MediaFileRefInvalid(MediaFileError, ValueError):
    def __init__(self, problem: str) -> None:
        super().__init__(f"media file reference is invalid: {problem}")
        self.problem = problem


class MediaPathInvalid(MediaFileError, ValueError):
    def __init__(self, reference: str, problem: MediaPathProblem, base: str) -> None:
        self.reference = reference
        self.problem = problem
        self.base = base
        super().__init__(f"media file path {reference} {self.phrase}")

    @property
    def phrase(self) -> str:
        return PROBLEM_TEXTS[self.problem].format(base=self.base)


class MediaFileMissing(MediaFileError, LookupError):
    def __init__(self, reference: str, path: str) -> None:
        super().__init__(f"media file {reference} does not exist at {path}")
        self.reference = reference
        self.path = path


def media_folder_label(dataset_path: str) -> str:
    return f"the dataset folder {dataset_media_folder(dataset_path)}/"


def media_file_path(reference: str, dataset_path: str) -> str:
    base, rest, label = _anchored(reference.replace(BACKSLASH, SLASH), dataset_path)
    problem = next((problem for rule, problem in PATH_RULES if rule(rest)), None)
    if problem is not None:
        raise MediaPathInvalid(reference, problem, label)
    joined = posixpath.normpath(posixpath.join(base, rest))
    if _engine_state(joined):
        raise MediaPathInvalid(reference, MediaPathProblem.ENGINE_STATE, label)
    return joined


def locate_media_file(root: Path, reference: str, dataset_path: str) -> Path:
    relative = media_file_path(reference, dataset_path)
    location = root / relative
    if not location.is_file():
        raise MediaFileMissing(reference, relative)
    real_root = root.resolve()
    real = location.resolve()
    if not real.is_relative_to(real_root):
        raise MediaPathInvalid(reference, MediaPathProblem.LINKED_OUTSIDE, PROJECT_LABEL)
    if _engine_state(real.relative_to(real_root).as_posix()):
        raise MediaPathInvalid(reference, MediaPathProblem.ENGINE_STATE, PROJECT_LABEL)
    return real


def is_media_file_ref(value: JsonValue) -> TypeGuard[dict[str, JsonValue]]:
    return isinstance(value, dict) and MEDIA_KEY in value and MEDIA_FILE_KEY in value


def parse_media_file_ref(value: JsonValue) -> MediaFileRef:
    try:
        return MediaFileRef.model_validate(value)
    except ValidationError as error:
        first = error.errors()[0]
        location = ".".join(str(part) for part in first["loc"])
        raise MediaFileRefInvalid(f"{location}: {first['msg']}" if location else first["msg"]) from error


def media_file_refs(value: JsonValue, path: JsonPath = ()) -> MediaFileRefs:
    if is_media_file_ref(value):
        yield path, value
        return
    for key, item in _children(value):
        yield from media_file_refs(item, (*path, key))


def case_media_parts(case: DatasetCase) -> tuple[tuple[JsonPath, JsonValue], ...]:
    node_outputs = tuple(((NODE_OUTPUTS_PART, node), value) for node, value in (case.node_outputs or {}).items())
    return (((INPUTS_PART,), case.inputs), *node_outputs, ((EXPECTED_OUTPUT_PART,), case.expected_output))


def case_media_file_refs(case: DatasetCase) -> MediaFileRefs:
    for path, value in case_media_parts(case):
        yield from media_file_refs(value, path)


def has_media_file_refs(case: DatasetCase) -> bool:
    return next(case_media_file_refs(case), None) is not None


def replace_media_file_refs(value: JsonValue, replace: MediaReplacer, path: JsonPath = ()) -> JsonValue:
    if is_media_file_ref(value):
        return replace(path, value)
    if isinstance(value, dict):
        return {key: replace_media_file_refs(item, replace, (*path, key)) for key, item in value.items()}
    if isinstance(value, list):
        return [replace_media_file_refs(item, replace, (*path, index)) for index, item in enumerate(value)]
    return value


def with_media_placeholders(value: JsonValue) -> JsonValue:
    return replace_media_file_refs(value, media_placeholder)


def media_placeholder(path: JsonPath, reference: dict[str, JsonValue]) -> JsonValue:
    name = reference.get("name")
    return {
        MEDIA_KEY: reference[MEDIA_KEY],
        "blob_id": PLACEHOLDER_BLOB_ID,
        "size_bytes": 0,
        "name": name if isinstance(name, str) else None,
    }


def media_type_fits(media_type: str, file: str) -> bool:
    fit = MediaFit(
        media_type=media_type,
        suffix=PurePosixPath(file).suffix.lower(),
        guessed=guessed_media_type(file),
        listed=tuple(_media_table().guess_all_extensions(media_type, strict=False)),
    )
    return any(rule(fit) for rule in FIT_RULES)


def guessed_media_type(file: str) -> str | None:
    guessed, _ = _media_table().guess_file_type(file, strict=False)
    return guessed


def media_extension(media_type: str) -> str | None:
    known = EXTRA_EXTENSIONS.get(media_type)
    return known if known is not None else _media_table().guess_extension(media_type, strict=False)


def media_file_name(wanted: str) -> str:
    name = PureWindowsPath(wanted).name.lstrip(HIDDEN_PREFIX)
    return name or FALLBACK_FILE_NAME


def media_file_candidates(wanted: str) -> Iterator[str]:
    name = PurePosixPath(media_file_name(wanted))
    copies = (f"{name.stem}{COPY_SEPARATOR}{number}{name.suffix}" for number in count(FIRST_COPY))
    return chain((name.name,), copies)


def unused_media_file_name(root: Path, dataset_path: str, wanted: str) -> str:
    folder = root / dataset_media_folder(dataset_path)
    return next(candidate for candidate in media_file_candidates(wanted) if not (folder / candidate).exists())


def _anchored(reference: str, dataset_path: str) -> tuple[str, str, str]:
    if reference.startswith(ROOT_PATH_PREFIX):
        return "", reference.removeprefix(ROOT_PATH_PREFIX), PROJECT_ROOT_LABEL
    return dataset_media_folder(dataset_path), reference, media_folder_label(dataset_path)


def _empty(rest: str) -> bool:
    return not rest.strip() or posixpath.normpath(rest) == CURRENT


def _absolute(rest: str) -> bool:
    return bool(PureWindowsPath(rest).anchor)


def _outside(rest: str) -> bool:
    normal = posixpath.normpath(rest)
    return normal == PARENT or normal.startswith(f"{PARENT}{SLASH}")


def _engine_state(relative: str) -> bool:
    parts = PurePosixPath(relative).parts
    return bool(parts) and parts[0].casefold() == ENGINE_STATE_FOLDER


def _children(value: JsonValue) -> tuple[tuple[str | int, JsonValue], ...]:
    if isinstance(value, dict):
        return tuple(value.items())
    if isinstance(value, list):
        return tuple(enumerate(value))
    return ()


def _major(media_type: str) -> str:
    return media_type.partition(SLASH)[0]


def _without_suffix(fit: MediaFit) -> bool:
    return not fit.suffix


def _generic(fit: MediaFit) -> bool:
    return fit.media_type in GENERIC_MEDIA_TYPES


def _unknown_suffix(fit: MediaFit) -> bool:
    return fit.guessed is None


def _same_type(fit: MediaFit) -> bool:
    return fit.guessed == fit.media_type


def _listed_suffix(fit: MediaFit) -> bool:
    return fit.suffix in fit.listed


def _same_family_of_unlisted(fit: MediaFit) -> bool:
    return not fit.listed and fit.guessed is not None and _major(fit.guessed) == _major(fit.media_type)


@cache
def _media_table() -> mimetypes.MimeTypes:
    return mimetypes.MimeTypes()


PATH_RULES: Final[tuple[tuple[Callable[[str], bool], MediaPathProblem], ...]] = (
    (_empty, MediaPathProblem.EMPTY),
    (_absolute, MediaPathProblem.ABSOLUTE),
    (_outside, MediaPathProblem.OUTSIDE),
)

FIT_RULES: Final[tuple[Callable[[MediaFit], bool], ...]] = (
    _without_suffix,
    _generic,
    _unknown_suffix,
    _same_type,
    _listed_suffix,
    _same_family_of_unlisted,
)
