# /// script
# requires-python = ">=3.14"
# dependencies = ["pillow==12.3.0"]
# ///
import argparse
import importlib
import math
import sys
from collections.abc import Iterator, Mapping, Sequence
from dataclasses import dataclass
from pathlib import Path
from typing import Final, Protocol, cast

IMAGE_SUFFIXES: Final = frozenset({".jpg", ".jpeg", ".png", ".webp", ".tif", ".tiff", ".bmp", ".gif"})
CONVERSION_HINTS: Final[Mapping[str, str]] = {
    ".heic": "convert it to JPEG first: sips -s format jpeg <file> --out <file>.jpg",
    ".heif": "convert it to JPEG first: sips -s format jpeg <file> --out <file>.jpg",
}
ORIENTATION_TAG: Final = 0x0112
UPRIGHT: Final = 1
FULL_SCALE: Final = 1.0
DEFAULT_TILE: Final = 480
DEFAULT_COLUMNS: Final = 4
GAP: Final = 12
FONT_SIZE: Final = 14
LINE_HEIGHT: Final = 18
CAPTION_LINES: Final = 3
CAPTION_TOP: Final = 4
CHARACTER_WIDTH: Final = 8
BACKGROUND: Final = "white"
INK: Final = "black"
COLOR_MODE: Final = "RGB"
REPORT_HEADER: Final = "file\tstored\texif\tupright\tprovider_scale"
EXIT_OK: Final = 0
EXIT_NOTHING_READ: Final = 1


class PillowImage(Protocol):
    @property
    def size(self) -> tuple[int, int]: ...

    def getexif(self) -> Mapping[int, object]: ...

    def convert(self, mode: str) -> PillowImage: ...

    def thumbnail(self, size: tuple[int, int]) -> None: ...

    def paste(self, im: PillowImage, box: tuple[int, int]) -> None: ...

    def save(self, fp: str) -> None: ...

    def close(self) -> None: ...


class Font(Protocol): ...


class Drawing(Protocol):
    def text(self, xy: tuple[int, int], text: str, fill: str, font: Font) -> None: ...


class ImageModule(Protocol):
    def open(self, fp: str) -> PillowImage: ...

    def new(self, mode: str, size: tuple[int, int], color: str) -> PillowImage: ...


class ImageOpsModule(Protocol):
    def exif_transpose(self, image: PillowImage) -> PillowImage: ...


class ImageDrawModule(Protocol):
    def Draw(self, im: PillowImage) -> Drawing: ...


class ImageFontModule(Protocol):
    def load_default(self, size: float) -> Font: ...


@dataclass(frozen=True, slots=True)
class Pillow:
    image: ImageModule
    ops: ImageOpsModule
    draw: ImageDrawModule
    font: ImageFontModule


def load_pillow() -> Pillow:
    return Pillow(
        image=cast(ImageModule, importlib.import_module("PIL.Image")),
        ops=cast(ImageOpsModule, importlib.import_module("PIL.ImageOps")),
        draw=cast(ImageDrawModule, importlib.import_module("PIL.ImageDraw")),
        font=cast(ImageFontModule, importlib.import_module("PIL.ImageFont")),
    )


@dataclass(frozen=True, slots=True)
class SheetOptions:
    tile: int
    columns: int
    provider_edge: int | None


@dataclass(frozen=True, slots=True)
class Tile:
    name: str
    stored: tuple[int, int]
    orientation: int
    upright: tuple[int, int]
    preview: PillowImage

    def provider_scale(self, edge: int | None) -> float:
        long_edge = max(self.upright)
        if edge is None or long_edge <= edge:
            return FULL_SCALE
        return edge / long_edge


@dataclass(frozen=True, slots=True)
class Skipped:
    name: str
    reason: str


def size_text(size: tuple[int, int]) -> str:
    return f"{size[0]}x{size[1]}"


def scale_text(scale: float) -> str:
    return "none" if scale == FULL_SCALE else f"x{scale:.2f}"


def orientation_of(image: PillowImage) -> int:
    value = image.getexif().get(ORIENTATION_TAG, UPRIGHT)
    return value if isinstance(value, int) else UPRIGHT


def folder_images(folder: Path) -> Iterator[Path]:
    known = IMAGE_SUFFIXES | CONVERSION_HINTS.keys()
    return (path for path in sorted(folder.iterdir()) if path.suffix.lower() in known)


def image_paths(sources: Sequence[Path]) -> Iterator[Path]:
    for source in sources:
        yield from (folder_images(source) if source.is_dir() else (source,))


def read_tile(pillow: Pillow, path: Path, options: SheetOptions) -> Tile:
    source = pillow.image.open(str(path))
    stored = source.size
    orientation = orientation_of(source)
    upright = pillow.ops.exif_transpose(source).convert(COLOR_MODE)
    source.close()
    native = upright.size
    upright.thumbnail((options.tile, options.tile))
    return Tile(name=path.name, stored=stored, orientation=orientation, upright=native, preview=upright)


def read_entry(pillow: Pillow, path: Path, options: SheetOptions) -> Tile | Skipped:
    hint = CONVERSION_HINTS.get(path.suffix.lower())
    if hint is not None:
        return Skipped(path.name, hint)
    try:
        return read_tile(pillow, path, options)
    except OSError as error:
        return Skipped(path.name, str(error))


def shortened(name: str, options: SheetOptions) -> str:
    limit = max(options.tile // CHARACTER_WIDTH, 4)
    return name if len(name) <= limit else f"{name[: limit - 3]}..."


def caption_lines(tile: Tile, options: SheetOptions) -> tuple[str, ...]:
    scale = tile.provider_scale(options.provider_edge)
    return (
        shortened(tile.name, options),
        f"stored {size_text(tile.stored)}, EXIF {tile.orientation}, upright {size_text(tile.upright)}",
        f"provider scale {scale_text(scale)}",
    )


def report_line(tile: Tile, options: SheetOptions) -> str:
    scale = scale_text(tile.provider_scale(options.provider_edge))
    return f"{tile.name}\t{size_text(tile.stored)}\t{tile.orientation}\t{size_text(tile.upright)}\t{scale}"


def render_sheet(pillow: Pillow, tiles: Sequence[Tile], options: SheetOptions) -> PillowImage:
    columns = min(options.columns, len(tiles))
    rows = math.ceil(len(tiles) / columns)
    cell_width = options.tile + GAP
    cell_height = options.tile + CAPTION_TOP + CAPTION_LINES * LINE_HEIGHT + GAP
    sheet = pillow.image.new(COLOR_MODE, (columns * cell_width + GAP, rows * cell_height + GAP), BACKGROUND)
    drawing = pillow.draw.Draw(sheet)
    font = pillow.font.load_default(FONT_SIZE)
    for index, tile in enumerate(tiles):
        left = GAP + (index % columns) * cell_width
        top = GAP + (index // columns) * cell_height
        sheet.paste(tile.preview, (left, top))
        for line_index, line in enumerate(caption_lines(tile, options)):
            baseline = top + options.tile + CAPTION_TOP + line_index * LINE_HEIGHT
            drawing.text((left, baseline), line, fill=INK, font=font)
    return sheet


def positive(text: str) -> int:
    value = int(text)
    if value < 1:
        raise argparse.ArgumentTypeError(f"expected a number of at least 1, got {text}")
    return value


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="contact_sheet.py",
        description="one captioned sheet of images: EXIF orientation applied, stored and upright pixel sizes",
    )
    parser.add_argument("sources", nargs="+", type=Path, help="image files or folders of images")
    parser.add_argument("--out", required=True, type=Path, help="the sheet to write, .png or .jpg")
    parser.add_argument("--tile", type=positive, default=DEFAULT_TILE, help="longest edge of a tile on the sheet")
    parser.add_argument("--columns", type=positive, default=DEFAULT_COLUMNS, help="tiles per row")
    parser.add_argument(
        "--provider-edge",
        type=positive,
        default=None,
        help="longest edge the provider keeps; tiles above it show the factor the provider scales them by",
    )
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    arguments = build_parser().parse_args(argv)
    options = SheetOptions(tile=arguments.tile, columns=arguments.columns, provider_edge=arguments.provider_edge)
    sources: list[Path] = list(arguments.sources)
    output = Path(str(arguments.out))
    pillow = load_pillow()
    entries = [read_entry(pillow, path, options) for path in image_paths(sources)]
    tiles = [entry for entry in entries if isinstance(entry, Tile)]
    for skipped in (entry for entry in entries if isinstance(entry, Skipped)):
        print(f"skipped {skipped.name}: {skipped.reason}", file=sys.stderr)
    if not tiles:
        print("no readable image among the sources", file=sys.stderr)
        return EXIT_NOTHING_READ
    output.parent.mkdir(parents=True, exist_ok=True)
    render_sheet(pillow, tiles, options).save(str(output))
    print(REPORT_HEADER)
    for tile in tiles:
        print(report_line(tile, options))
    print(f"sheet: {output}")
    return EXIT_OK


if __name__ == "__main__":
    sys.exit(main())
