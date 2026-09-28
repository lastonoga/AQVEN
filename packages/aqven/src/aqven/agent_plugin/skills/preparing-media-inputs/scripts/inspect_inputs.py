# /// script
# requires-python = ">=3.14"
# dependencies = ["pillow==12.3.0", "pypdf==6.19.0"]
# ///
import argparse
import csv
import importlib
import io
import re
import shutil
import subprocess
import sys
from collections.abc import Callable, Iterator, Mapping, Sequence
from dataclasses import dataclass
from pathlib import Path
from typing import Final, Protocol, cast

ORIENTATION_TAG: Final = 0x0112
UPRIGHT: Final = 1
TURNED_ORIENTATIONS: Final = frozenset({5, 6, 7, 8})
CHARACTERS_PER_TOKEN: Final = 4
TEXT_ENCODING: Final = "utf-8-sig"
SNIFF_CHARACTERS: Final = 65536
TABLE_DELIMITERS: Final = ",;\t|"
DEFAULT_DELIMITER: Final = ","
TYPES_LIMIT: Final = 120
MARKDOWN_HEADING: Final = re.compile(r"^#{1,6} ")
DECIMAL_COMMA: Final = re.compile(r"^-?\d+,\d+$")
CELL_TYPES: Final[tuple[tuple[str, re.Pattern[str]], ...]] = (
    ("int", re.compile(r"^-?\d+$")),
    ("float", re.compile(r"^-?\d*\.\d+$")),
    ("decimal_comma", DECIMAL_COMMA),
    ("date", re.compile(r"^\d{4}-\d{2}-\d{2}")),
)
FFPROBE: Final = "ffprobe"
FFPROBE_ENTRIES: Final = "stream=codec_type,codec_name,width,height,r_frame_rate,sample_rate,channels:format=duration"
FFPROBE_SECONDS: Final = 60
FFPROBE_MISSING: Final = "ffprobe not on PATH: install FFmpeg to read duration, rates and channels"
IMAGE_SUFFIXES: Final = frozenset({".jpg", ".jpeg", ".png", ".webp", ".tif", ".tiff", ".bmp", ".gif"})
AUDIO_SUFFIXES: Final = frozenset({".wav", ".mp3", ".m4a", ".aac", ".flac", ".ogg", ".opus"})
VIDEO_SUFFIXES: Final = frozenset({".mp4", ".mov", ".m4v", ".mkv", ".webm", ".avi"})
TEXT_SUFFIXES: Final = frozenset({".txt", ".md", ".markdown", ".rst", ".html", ".htm", ".xml", ".json", ".eml"})
CONVERSION_HINTS: Final[Mapping[str, str]] = {
    ".heic": "convert it to JPEG first: sips -s format jpeg <file> --out <file>.jpg",
    ".heif": "convert it to JPEG first: sips -s format jpeg <file> --out <file>.jpg",
}
REPORT_HEADER: Final = "file\tkind\tbytes\tdetails"
DETAIL_SEPARATOR: Final = "; "
EXIT_OK: Final = 0
EXIT_NOTHING_READ: Final = 1


class PillowImage(Protocol):
    @property
    def size(self) -> tuple[int, int]: ...

    @property
    def format(self) -> str | None: ...

    def getexif(self) -> Mapping[int, object]: ...

    def close(self) -> None: ...


class ImageModule(Protocol):
    MIME: Mapping[str, str]

    def open(self, fp: str) -> PillowImage: ...


class PageBox(Protocol):
    @property
    def width(self) -> float: ...

    @property
    def height(self) -> float: ...


class PdfPage(Protocol):
    @property
    def mediabox(self) -> PageBox: ...

    @property
    def rotation(self) -> int: ...

    def extract_text(self) -> str: ...


class PdfDocument(Protocol):
    @property
    def pages(self) -> Sequence[PdfPage]: ...

    @property
    def is_encrypted(self) -> bool: ...


class PdfModule(Protocol):
    def PdfReader(self, stream: str) -> PdfDocument: ...


@dataclass(frozen=True, slots=True)
class Libraries:
    image: ImageModule
    pdf: PdfModule
    ffprobe: str | None


@dataclass(frozen=True, slots=True)
class Row:
    kind: str
    details: tuple[str, ...]


@dataclass(frozen=True, slots=True)
class Skipped:
    name: str
    reason: str


type Inspector = Callable[[Path, Libraries], Row]


def load_libraries() -> Libraries:
    return Libraries(
        image=cast(ImageModule, importlib.import_module("PIL.Image")),
        pdf=cast(PdfModule, importlib.import_module("pypdf")),
        ffprobe=shutil.which(FFPROBE),
    )


def orientation_of(image: PillowImage) -> int:
    value = image.getexif().get(ORIENTATION_TAG, UPRIGHT)
    return value if isinstance(value, int) else UPRIGHT


def size_text(width: float, height: float) -> str:
    return f"{width:.0f}x{height:.0f}"


def inspect_image(path: Path, libraries: Libraries) -> Row:
    image = libraries.image.open(str(path))
    width, height = image.size
    orientation = orientation_of(image)
    real_format = image.format or "unknown"
    image.close()
    upright = (height, width) if orientation in TURNED_ORIENTATIONS else (width, height)
    return Row(
        "image",
        (
            f"format={real_format}",
            f"media={libraries.image.MIME.get(real_format, 'unknown')}",
            f"stored={size_text(width, height)}",
            f"exif={orientation}",
            f"upright={size_text(*upright)}",
        ),
    )


def page_sizes(pages: Sequence[PdfPage]) -> str:
    sizes = dict.fromkeys(size_text(page.mediabox.width, page.mediabox.height) for page in pages)
    return ",".join(sizes) or "none"


def inspect_pdf(path: Path, libraries: Libraries) -> Row:
    document = libraries.pdf.PdfReader(str(path))
    if document.is_encrypted:
        return Row("pdf", ("encrypted: open it with its password first",))
    pages = list(document.pages)
    with_text = sum(1 for page in pages if page.extract_text().strip())
    rotations = sorted({page.rotation for page in pages})
    return Row(
        "pdf",
        (
            f"pages={len(pages)}",
            f"pages_with_text_layer={with_text}",
            f"page_size_pt={page_sizes(pages)}",
            f"rotation={','.join(str(rotation) for rotation in rotations) or 'none'}",
        ),
    )


def stream_inspector(kind: str) -> Inspector:
    def inspect(path: Path, libraries: Libraries) -> Row:
        if libraries.ffprobe is None:
            return Row(kind, (FFPROBE_MISSING,))
        command = [libraries.ffprobe, "-v", "error", "-show_entries", FFPROBE_ENTRIES, "-of", "compact=p=0", str(path)]
        completed = subprocess.run(command, capture_output=True, text=True, check=False, timeout=FFPROBE_SECONDS)
        if completed.returncode != 0:
            return Row(kind, (f"ffprobe failed: {completed.stderr.strip()}",))
        return Row(kind, tuple(line.strip() for line in completed.stdout.splitlines() if line.strip()))

    return inspect


def read_text(path: Path) -> str:
    return path.read_bytes().decode(TEXT_ENCODING)


def paragraph_count(lines: Sequence[str]) -> int:
    starts = (index for index, line in enumerate(lines) if line.strip())
    return sum(1 for index in starts if index == 0 or not lines[index - 1].strip())


def inspect_text(path: Path, libraries: Libraries) -> Row:
    text = read_text(path)
    lines = text.splitlines()
    return Row(
        "text",
        (
            f"characters={len(text)}",
            f"estimated_tokens={len(text) // CHARACTERS_PER_TOKEN}",
            f"lines={len(lines)}",
            f"paragraphs={paragraph_count(lines)}",
            f"markdown_headings={sum(1 for line in lines if MARKDOWN_HEADING.match(line))}",
            f"longest_line={max((len(line) for line in lines), default=0)}",
        ),
    )


def sniffed_delimiter(text: str) -> str:
    try:
        return csv.Sniffer().sniff(text[:SNIFF_CHARACTERS], delimiters=TABLE_DELIMITERS).delimiter
    except csv.Error:
        return DEFAULT_DELIMITER


def column_type(values: Sequence[str]) -> str:
    filled = [value.strip() for value in values if value.strip()]
    if not filled:
        return "empty"
    matching = (name for name, pattern in CELL_TYPES if all(pattern.match(value) for value in filled))
    return next(matching, "text")


def column_types(header: Sequence[str], body: Sequence[Sequence[str]]) -> str:
    columns = ((name, [row[index] for row in body if index < len(row)]) for index, name in enumerate(header))
    return ",".join(f"{name}:{column_type(values)}" for name, values in columns)


def table_inspector(delimiter: str | None) -> Inspector:
    def inspect(path: Path, libraries: Libraries) -> Row:
        text = read_text(path)
        chosen = delimiter or sniffed_delimiter(text)
        rows = list(csv.reader(io.StringIO(text), delimiter=chosen))
        header = rows[0] if rows else []
        body = rows[1:]
        cells = [cell.strip() for row in body for cell in row]
        return Row(
            "table",
            (
                f"delimiter={chosen!r}",
                f"rows={len(body)}",
                f"columns={len(header)}",
                f"ragged_rows={sum(1 for row in body if len(row) != len(header))}",
                f"empty_cells={sum(1 for cell in cells if not cell)}",
                f"decimal_comma_cells={sum(1 for cell in cells if DECIMAL_COMMA.match(cell))}",
                f"types={column_types(header, body)[:TYPES_LIMIT]}",
            ),
        )

    return inspect


def kind_table() -> Mapping[str, Inspector]:
    audio = stream_inspector("audio")
    video = stream_inspector("video")
    return {
        **dict.fromkeys(IMAGE_SUFFIXES, inspect_image),
        **dict.fromkeys(AUDIO_SUFFIXES, audio),
        **dict.fromkeys(VIDEO_SUFFIXES, video),
        **dict.fromkeys(TEXT_SUFFIXES, inspect_text),
        ".pdf": inspect_pdf,
        ".csv": table_inspector(None),
        ".tsv": table_inspector("\t"),
    }


INSPECTORS: Final = kind_table()


def known(path: Path) -> bool:
    suffix = path.suffix.lower()
    return suffix in INSPECTORS or suffix in CONVERSION_HINTS


def hidden(path: Path, folder: Path) -> bool:
    return any(part.startswith(".") for part in path.relative_to(folder).parts)


def folder_files(folder: Path) -> Iterator[Path]:
    return (path for path in sorted(folder.rglob("*")) if path.is_file() and known(path) and not hidden(path, folder))


def input_paths(sources: Sequence[Path]) -> Iterator[Path]:
    for source in sources:
        yield from (folder_files(source) if source.is_dir() else (source,))


def read_entry(path: Path, libraries: Libraries) -> Row | Skipped:
    suffix = path.suffix.lower()
    hint = CONVERSION_HINTS.get(suffix)
    if hint is not None:
        return Skipped(str(path), hint)
    inspector = INSPECTORS.get(suffix)
    if inspector is None:
        return Skipped(str(path), f"no inspector for {suffix or 'files without a suffix'}")
    try:
        return inspector(path, libraries)
    except Exception as error:
        return Skipped(str(path), f"{type(error).__name__}: {error}")


def report_line(path: Path, row: Row) -> str:
    return f"{path}\t{row.kind}\t{path.stat().st_size}\t{DETAIL_SEPARATOR.join(row.details)}"


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="inspect_inputs.py",
        description="one row per input file: images, PDFs, audio, video, text and tables, with what to check",
    )
    parser.add_argument("sources", nargs="+", type=Path, help="files or folders; folders are read recursively")
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    arguments = build_parser().parse_args(argv)
    sources: list[Path] = list(arguments.sources)
    libraries = load_libraries()
    entries = [(path, read_entry(path, libraries)) for path in input_paths(sources)]
    rows = [(path, entry) for path, entry in entries if isinstance(entry, Row)]
    for skipped in (entry for _, entry in entries if isinstance(entry, Skipped)):
        print(f"skipped {skipped.name}: {skipped.reason}", file=sys.stderr)
    if not rows:
        print("no readable input among the sources", file=sys.stderr)
        return EXIT_NOTHING_READ
    print(REPORT_HEADER)
    for path, row in rows:
        print(report_line(path, row))
    return EXIT_OK


if __name__ == "__main__":
    sys.exit(main())
