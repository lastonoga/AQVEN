# /// script
# requires-python = ">=3.14"
# dependencies = ["pillow==12.3.0"]
# ///
import argparse
import hashlib
import importlib
import json
import sys
from collections.abc import Sequence
from dataclasses import dataclass
from pathlib import Path
from typing import Final, Protocol, cast

FIXTURE: Final = Path(__file__).resolve().parent / "media"
PHOTO_NAME: Final = "receipt_photo.jpg"
BOXES_NAME: Final = "receipt_photo.boxes.json"
UPRIGHT_SIZE: Final = (2316, 3088)
ORIENTATION_TAG: Final = 0x0112
ROTATED_CLOCKWISE: Final = 6
STORE_ROTATION: Final = 2
QUALITY: Final = 80
TABLE: Final = (118, 96, 78)
PAPER: Final = (246, 244, 236)
INK: Final = (40, 40, 44)
FADED_INK: Final = (150, 150, 156)
PAPER_BOX: Final = (430, 260, 1890, 2140)
MARGIN: Final = 90
LINE_HEIGHT: Final = 92
FONT_SIZE: Final = 64
TOTAL_FONT_SIZE: Final = 84
EXIT_OK: Final = 0

type Box = tuple[int, int, int, int]
type Colour = tuple[int, int, int]


class Exif(Protocol):
    def __setitem__(self, key: int, value: int) -> None: ...

    def tobytes(self) -> bytes: ...


class PillowImage(Protocol):
    @property
    def size(self) -> tuple[int, int]: ...

    def getexif(self) -> Exif: ...

    def transpose(self, method: int) -> PillowImage: ...

    def save(self, fp: str, format: str, *, quality: int, exif: bytes) -> None: ...


class Font(Protocol):
    def getlength(self, text: str) -> float: ...


class Drawing(Protocol):
    def rectangle(self, xy: Box, fill: Colour) -> None: ...

    def text(self, xy: tuple[int, int], text: str, fill: Colour, font: Font) -> None: ...

    def line(self, xy: Box, fill: Colour, width: int) -> None: ...


class ImageModule(Protocol):
    def new(self, mode: str, size: tuple[int, int], color: Colour) -> PillowImage: ...


class ImageDrawModule(Protocol):
    def Draw(self, im: PillowImage) -> Drawing: ...


class ImageFontModule(Protocol):
    def load_default(self, size: float) -> Font: ...


@dataclass(frozen=True, slots=True)
class Pillow:
    image: ImageModule
    draw: ImageDrawModule
    fonts: ImageFontModule


@dataclass(frozen=True, slots=True)
class ReceiptLine:
    label: str
    amount: str


HEADER: Final = ("NORTHSIDE HARDWARE", "12 Mill Road", "Receipt 004817   2026-09-12 14:32")
ITEMS: Final = (
    ReceiptLine("Wood screws 4x40 (200)", "6.90"),
    ReceiptLine("Wall plugs 6 mm (100)", "3.40"),
    ReceiptLine("Masking tape 38 mm x2", "7.80"),
    ReceiptLine("Sanding sheets P120 x10", "5.60"),
    ReceiptLine("Paint roller 180 mm", "8.25"),
    ReceiptLine("Drop cloth 4x5 m", "4.99"),
)
TOTALS: Final = (
    ReceiptLine("Subtotal", "36.94"),
    ReceiptLine("VAT 20% included", "6.16"),
)
TOTAL_DUE: Final = ReceiptLine("TOTAL", "36.94")
FOOTER: Final = ("Paid by card ****4431", "Thank you for shopping local")


def load_pillow() -> Pillow:
    return Pillow(
        image=cast(ImageModule, importlib.import_module("PIL.Image")),
        draw=cast(ImageDrawModule, importlib.import_module("PIL.ImageDraw")),
        fonts=cast(ImageFontModule, importlib.import_module("PIL.ImageFont")),
    )


def write_row(pen: Drawing, font: Font, top: int, line: ReceiptLine, colour: Colour) -> None:
    left, _, right, _ = PAPER_BOX
    pen.text((left + MARGIN, top), line.label, colour, font)
    amount_left = right - MARGIN - round(font.getlength(line.amount))
    pen.text((amount_left, top), line.amount, colour, font)


def write_header(pen: Drawing, font: Font, top: int) -> int:
    left, _, right, _ = PAPER_BOX
    for text in HEADER:
        centre = (left + right - round(font.getlength(text))) // 2
        pen.text((centre, top), text, INK, font)
        top += LINE_HEIGHT
    return top + LINE_HEIGHT // 2


def write_items(pen: Drawing, font: Font, top: int) -> int:
    for line in ITEMS:
        write_row(pen, font, top, line, INK)
        top += LINE_HEIGHT
    return top


def write_totals(pen: Drawing, font: Font, total_font: Font, top: int) -> tuple[int, Box]:
    left, _, right, _ = PAPER_BOX
    pen.line((left + MARGIN, top + 20, right - MARGIN, top + 20), INK, 4)
    block_top = top + 50
    top = block_top
    for line in TOTALS:
        write_row(pen, font, top, line, INK)
        top += LINE_HEIGHT
    write_row(pen, total_font, top, TOTAL_DUE, INK)
    top += LINE_HEIGHT + 30
    return top, (left + MARGIN // 2, block_top - 20, right - MARGIN // 2, top)


def write_footer(pen: Drawing, font: Font, top: int) -> None:
    left, _, _, _ = PAPER_BOX
    for text in FOOTER:
        pen.text((left + MARGIN, top + LINE_HEIGHT // 2), text, FADED_INK, font)
        top += LINE_HEIGHT


def painted(pillow: Pillow) -> tuple[PillowImage, Box]:
    canvas = pillow.image.new("RGB", UPRIGHT_SIZE, TABLE)
    pen = pillow.draw.Draw(canvas)
    pen.rectangle(PAPER_BOX, PAPER)
    font = pillow.fonts.load_default(FONT_SIZE)
    total_font = pillow.fonts.load_default(TOTAL_FONT_SIZE)
    top = write_header(pen, font, PAPER_BOX[1] + MARGIN)
    top = write_items(pen, font, top)
    top, totals_box = write_totals(pen, font, total_font, top)
    write_footer(pen, font, top)
    return canvas, totals_box


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="write the receipt photo of the eval media fixture")
    parser.add_argument("--out", default=str(FIXTURE), help="folder that receives the photo and its boxes")
    arguments = parser.parse_args(argv)
    folder = Path(arguments.out)
    folder.mkdir(parents=True, exist_ok=True)
    upright, totals_box = painted(load_pillow())
    stored = upright.transpose(STORE_ROTATION)
    exif = stored.getexif()
    exif[ORIENTATION_TAG] = ROTATED_CLOCKWISE
    photo = folder / PHOTO_NAME
    stored.save(str(photo), "JPEG", quality=QUALITY, exif=exif.tobytes())
    boxes = {"frame": "upright", "size": list(UPRIGHT_SIZE), "totals": list(totals_box)}
    (folder / BOXES_NAME).write_text(json.dumps(boxes, indent=2) + "\n", encoding="utf-8")
    width, height = stored.size
    print(f"{PHOTO_NAME}\tstored {width}x{height}\texif {ROTATED_CLOCKWISE}\tsha256-{digest(photo)}")
    print(f"{BOXES_NAME}\ttotals {list(totals_box)} in the upright frame")
    return EXIT_OK


if __name__ == "__main__":
    sys.exit(main())
