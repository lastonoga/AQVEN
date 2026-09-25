---
title: How to prepare images for a flow
description: Keep photos at their native resolution, apply the EXIF orientation, send crops as Image[], look at a contact sheet and at synthetic images before a series, and confirm in the trace what the model received.
---

## When you need this

Read this before a flow, a dataset or an experiment takes photos, scans or rendered images, and before any code
crops, scales or paints them. A model can only judge what it receives. A photo that was shrunk, turned on its
side or cropped to the wrong place gives a confident answer about the wrong picture, and every run on it is wasted.

The same rules hold for scanned documents: a PDF can go as a `Document` when the provider reads it natively,
and when the model needs a small detail, such as the line items of an invoice, render the pages to images and
crop them like photos. For audio and video the idea is the same with time instead of pixels: keep the original
file, cut segments at boundaries you can check, and render video frames onto a contact sheet before a series.

## What AQVEN does with an image

- An `Image` value is a blob: AQVEN stores the bytes you upload and sends those bytes to the provider unchanged.
  It does not resize, rotate, re-encode or crop anything. The provider may shrink a large image before the model
  sees it; [media has real limits](/concepts/media-has-real-limits-on-both-sides/) lists what each provider does.
- An inference attaches its own top-level media inputs only. Each item of an `Image[]` input is its own
  attachment, in list order. An `Image` inside a record input is not attached, and `{{CLI_COMMAND}} check` does not
  report it; rendering it in a prompt gives only the warning `W_PROMPT_VALUE_UNREADABLE`. Bind the media field
  itself: `from: "$input.photos"`, not the whole record.
- The engine carries no image library. Preparation happens in a script in your project that declares its own
  dependencies inline and runs with `uv run`, so nothing is added to the project's environment.

## Steps

1. **Inspect the sources.** For every file: pixel size, format, and the EXIF orientation tag. HEIC photos from a
   phone need converting to JPEG first (`sips -s format jpeg photo.heic --out photo.jpg` on macOS).
2. **Keep the originals.** Store the sources at the resolution they came in, inside the project, for example
   `<package>/samples/<dataset_id>/`. Never keep only a downscaled copy: every derived file is rebuilt from the
   originals by the script.
3. **Apply the orientation before anything else.** A phone often stores the pixels sideways plus a tag that says
   how to turn them. Write the turned pixels, and do the same in the production step that prepares images, so a
   crop box means the same thing in both.
4. **Send details as crops, at native resolution.** When the model has to see a small detail, cut it out of the
   original and pass the crops as an `Image[]` input, each one within the provider's size limit, so no crop is
   shrunk on the way. Do not shrink the whole photo to fit it into one image.
5. **Place crops by something you can check, not by eye.** Compute the boxes from a detector, OCR word boxes, a
   fixed form template or a grid, or take coordinates the owner confirmed. Try a library with
   `uv run --with <package>` before you add it anywhere. Every crop has to contain the area the prompt compares
   against: a crop of a scratch that shows no intact wood around it cannot answer "darker than the wood around it".
6. **Make a synthetic image really have its labelled property.** When you edit images so the answer is known,
   start from a base that does not have the property, and change exactly what the prompt's definition names,
   where it names it: a "blurry receipt" must be blurry where the text is, not just darker overall. Keep the
   levels of a graded series evenly spaced, and leave no seams from the editing or the mask that would give the
   synthetic images away. An image that cannot meet the definition the prompt reads measures nothing.
7. **Look at a contact sheet.** Put every original, crop and synthetic image on one sheet with its name, size and
   orientation. Open it, accept or reject each image, and write the decision down before any series runs.
8. **Treat an empty crop list as an error.** A step that finds nothing to crop fails or marks the case; it never
   sends an empty list that passes as a success.
9. **Check what the model received.** Before a run, `uv run {{CLI_COMMAND}} prompt preview <flow>.<node>` lists
   the attachments of the call. After a run, the MCP tool `run_get_node` (or the node in Studio's run view) shows
   the prompt as it was sent: one `image` part per attachment, with its blob, name and size in bytes. Compare them
   with the files you prepared.

### Example

`scripts/prepare_images.py` sits in the project root, next to `pyproject.toml`. It turns every photo in a folder
upright, writes the crops listed in a JSON file at native resolution, flags any image whose long edge is over the
limit you pass, and writes `contact_sheet.jpg`. The block at the top is inline script metadata (PEP 723): `uv run`
reads it and installs Pillow for this script alone.

```python title="scripts/prepare_images.py"
# /// script
# requires-python = ">=3.14"
# dependencies = ["pillow==12.3.0"]
# ///
import argparse
import json
from collections.abc import Iterator, Mapping
from dataclasses import dataclass
from pathlib import Path
from typing import Final

from PIL import Image, ImageDraw, ImageFont, ImageOps

ORIENTATION_TAG: Final = 0x0112
IMAGE_SUFFIXES: Final = frozenset({".jpg", ".jpeg", ".png", ".webp"})
CELL: Final = 360
LABEL_HEIGHT: Final = 44
COLUMNS: Final = 4

type Box = tuple[int, int, int, int]


@dataclass(frozen=True, slots=True)
class Prepared:
    name: str
    path: Path
    width: int
    height: int
    orientation: int


def orientation_of(image: Image.Image) -> int:
    value = image.getexif().get(ORIENTATION_TAG, 1)
    return value if isinstance(value, int) else 1


def upright(source: Path, target_dir: Path) -> Prepared:
    with Image.open(source) as image:
        orientation = orientation_of(image)
        turned = ImageOps.exif_transpose(image).convert("RGB")
    target = target_dir / f"{source.stem}.jpg"
    turned.save(target, quality=95)
    return Prepared(source.stem, target, turned.width, turned.height, orientation)


def cropped(photo: Prepared, name: str, box: Box, target_dir: Path) -> Prepared:
    left, top, right, bottom = box
    if not (0 <= left < right <= photo.width and 0 <= top < bottom <= photo.height):
        raise SystemExit(f"crop {name} of {photo.name}: box {box} is outside {photo.width}x{photo.height}")
    target = target_dir / f"{photo.name}__{name}.jpg"
    with Image.open(photo.path) as image:
        image.crop(box).save(target, quality=95)
    return Prepared(f"{photo.name}__{name}", target, right - left, bottom - top, 1)


def crops_of(photo: Prepared, boxes: Mapping[str, list[int]], target_dir: Path) -> Iterator[Prepared]:
    for name, box in boxes.items():
        left, top, right, bottom = box
        yield cropped(photo, name, (left, top, right, bottom), target_dir)


def label(item: Prepared, max_edge: int) -> str:
    warning = " OVER LIMIT" if max(item.width, item.height) > max_edge else ""
    return f"{item.name}\n{item.width}x{item.height} exif {item.orientation}{warning}"


def contact_sheet(items: list[Prepared], max_edge: int, target: Path) -> None:
    rows = -(-len(items) // COLUMNS)
    sheet = Image.new("RGB", (COLUMNS * CELL, rows * (CELL + LABEL_HEIGHT)), "white")
    draw = ImageDraw.Draw(sheet)
    font = ImageFont.load_default(size=14)
    for index, item in enumerate(items):
        x, y = index % COLUMNS * CELL, index // COLUMNS * (CELL + LABEL_HEIGHT)
        with Image.open(item.path) as image:
            image.thumbnail((CELL - 8, CELL - 8))
            sheet.paste(image, (x + 4, y + 4))
        draw.multiline_text((x + 4, y + CELL), label(item, max_edge), fill="black", font=font)
    sheet.save(target, quality=90)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("sources", type=Path)
    parser.add_argument("target", type=Path)
    parser.add_argument("--crops", type=Path)
    parser.add_argument("--max-edge", type=int, default=1568)
    arguments = parser.parse_args()
    arguments.target.mkdir(parents=True, exist_ok=True)
    boxes: dict[str, dict[str, list[int]]] = json.loads(arguments.crops.read_text()) if arguments.crops else {}
    files = sorted(path for path in arguments.sources.iterdir() if path.suffix.lower() in IMAGE_SUFFIXES)
    photos = [upright(path, arguments.target) for path in files]
    missing = sorted(set(boxes) - {photo.name for photo in photos})
    if missing:
        raise SystemExit(f"crops name photos that are not in {arguments.sources}: {', '.join(missing)}")
    crops = [crop for photo in photos for crop in crops_of(photo, boxes.get(photo.name, {}), arguments.target)]
    items = [*photos, *crops]
    if not items:
        raise SystemExit(f"no images in {arguments.sources}")
    contact_sheet(items, arguments.max_edge, arguments.target / "contact_sheet.jpg")
    for item in items:
        print(label(item, arguments.max_edge).replace("\n", "  "))


if __name__ == "__main__":
    main()
```

The crop boxes are in pixels of the upright photo, `[left, top, right, bottom]`, keyed by the photo's file name
without its extension:

```json
{
  "table_top": {
    "scratch": [100, 1200, 1700, 2600],
    "corner": [0, 0, 800, 800]
  }
}
```

```bash
uv run scripts/prepare_images.py skill_snippets/samples/oak_table skill_snippets/samples/oak_table_prepared --crops crops.json --max-edge 1568
```

It prints one line per image and stops with an error when a box falls outside its photo or names a photo that
is not in the folder:

```text
table_legs  1200x900 exif 1
table_top  3000x4000 exif 6 OVER LIMIT
table_top__scratch  1600x1400 exif 1 OVER LIMIT
table_top__corner  800x800 exif 1
```

`table_top` was stored sideways (`exif 6`) and is now upright, 3000×4000. It and the `scratch` crop are larger
than the 1568-pixel limit passed with `--max-edge`, so the provider would shrink them: split the scratch into two
crops, or ask whether the whole photo is needed at all. Set `--max-edge` to the limit of the provider your agent
uses.

## See also

- [Media has real limits on both sides of a model call](/concepts/media-has-real-limits-on-both-sides/) — what each
  provider does with a large image, video or audio file.
- [How to write a prompt](/engine/prompts/) — how an attached image is referred to in the prompt text.
- [Tested snippets](/engine/snippets/) — a flow with an `Image[]` input and a dataset case with a photo.
- [Media and dynamic values](/reference/media/) — the fields of a media value.
