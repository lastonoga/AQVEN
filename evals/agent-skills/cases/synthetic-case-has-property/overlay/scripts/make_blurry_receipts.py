# /// script
# requires-python = ">=3.12"
# dependencies = ["pillow==12.3.0"]
# ///
import json
import sys
from pathlib import Path

from PIL import Image, ImageEnhance

BLUR_LEVELS = (1.0, 0.85, 0.7, 0.55, 0.4)
PREVIEW_DIVISOR = 3


def make_ladder(source: Path, out: Path) -> None:
    out.mkdir(parents=True, exist_ok=True)
    base = Image.open(source).convert("RGB")
    small = base.resize((base.width // PREVIEW_DIVISOR, base.height // PREVIEW_DIVISOR))
    labels: dict[str, int] = {}
    for level, factor in enumerate(BLUR_LEVELS):
        blurred = ImageEnhance.Brightness(small).enhance(factor)
        name = f"receipt_blur_{level}.jpg"
        blurred.save(out / name, quality=85)
        labels[name] = level
    (out / "labels.json").write_text(json.dumps(labels, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    make_ladder(Path(sys.argv[1]), Path(sys.argv[2]))
