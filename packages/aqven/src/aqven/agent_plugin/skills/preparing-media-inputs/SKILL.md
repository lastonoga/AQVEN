---
name: preparing-media-inputs
description: "Prepares images, scans, PDFs, audio and video for AQVEN flows so the model sees what production sends: native resolution, orientation, region crops, synthetic inputs that have their label. Use when a flow, dataset or experiment takes media, and before code crops, cuts or edits it."
---

## MUST

- The model sees what production sends: sources at native resolution, orientation applied, crops and segments
  within the provider's limit. Experiments measure the production path, never a downscaled stand-in.
- Never pre-shrink or re-encode a source. Derived files are rebuilt from the sources by a script in the project.
- Apply EXIF orientation before any crop, in scripts and in the production step alike.
- A synthetic input has the property it is labelled with, where the prompt looks for it, on a base that does not
  have it at level zero.
- An empty list of crops or segments is an error or a visible flag, never a silent success.
- Look at the contact sheet yourself and record a decision for every crop and synthetic input before a series.

## Procedure

| # | Step | Exit criterion |
|---|---|---|
| 1 | Inspect the sources. Images: pixel size, format (HEIC → JPEG with `sips -s format jpeg <file> --out <file>.jpg`), EXIF orientation tag; the contact sheet script below prints stored size, tag and upright size. PDFs: page count, text layer or scanned pages, page size. Audio and video: duration, sample rate or frame rate, resolution, channels (`ffprobe` where installed) | a table per file |
| 2 | Sources at native resolution go into the project (`<package>/samples/<dataset_id>/`), never into `/tmp` | derived files rebuild from the sources with one script |
| 3 | Orientation: applied before any crop. In production, bytes are read and written only in a `tool` node (`ctx.blobs`); a `code` node sees only `media_type`, `blob_id` and `size_bytes` | the contact sheet shows every image upright |
| 4 | Provider limits: fine detail goes as several native-resolution crops in one `Image[]` input, each within the model's limit; long audio or video goes as segments within the model's duration and size limits. Look the numbers up in the provider's current docs every time | no image is downscaled by the provider more than twice (`--provider-edge` shows the factor); no segment is over the limit |
| 5 | Crop boxes and segment bounds come from something you can check (OCR word boxes, an object detector, a fixed form template, silence or speaker-change timestamps, coordinates the owner confirmed), not from eyeballing; try a library with `uv run --with <package>==<version>` before asking the owner to add it | every crop hits its region and holds the area the prompt compares against; no segment cuts a sentence |
| 6 | Synthetic input: build the property first, then check it. The base at level zero does not have it; the change is what the prompt's definition says, where it says; a graded series has even steps; edits leave no seams or artifacts | the synthetic sheet is looked at before any run |
| 7 | Contact sheet of every crop and synthetic input with captions (render PDF pages and video frames to images first): accept or reject each | a decision per item is written down |
| 8 | An empty crop or segment list fails the step or is flagged in the output | a run without crops cannot pass as a success |
| 9 | In the trace: `run_get_node` of the llm node shows what the model received (number of attachments, their names and sizes) | it matches the production path |

## Contact sheet script

`scripts/contact_sheet.py` in this skill's folder: images or folders in, one captioned sheet out, EXIF
orientation applied, stored and upright pixel sizes on each tile, plus a tab-separated table on stdout. It
declares Pillow inline, so `uv run` fetches it in a throwaway environment and the project gets no new dependency:

```bash
uv run <this skill's folder>/scripts/contact_sheet.py <folder or files> --out <sheet.png> --provider-edge 1568
```

`--tile` sets the tile edge on the sheet (480 by default), `--columns` the tiles per row (4), and
`--provider-edge` the longest edge the provider keeps: a tile above it shows the factor it would be scaled by.
Unreadable files and HEIC are listed on stderr with the fix. Open the sheet image and look at every tile.

## Pitfalls

A pitfall is a general rule; the illustration after it is one instance.

| What goes wrong | Do instead |
|---|---|
| A detail too small after the provider's resize: a 4000 px invoice scan sent as one image came out with unreadable line items | native-resolution crops of the regions as `Image[]` |
| Pre-shrunk sources made the crop step find nothing, and the run passed with an empty crop list | never pre-shrink; an empty list fails |
| The experiment measured a stand-in: a downscaled whole page, while production sent region crops at three times the pixels | the experiment's flow reproduces the production path |
| Orientation applied nowhere: phone photos of receipts reached the model sideways | orientation first, checked on the sheet |
| Crops placed by eye: the "totals" crop of a contract page held the signature block | boxes from a detector or template, then the sheet |
| A synthetic input without its label's property: a "blurry receipt" was darker overall, the text stayed sharp, and the model that said "sharp" was right | the change is the labelled property, where the prompt looks; check it before the run |
| The base already had the property at level zero: the "clean" catalogue photo already carried a watermark | a clean base, checked on the sheet |
| The crop cut away what the prompt compares against: "a stain darker than the fabric around it" with no fabric left in the crop | the crop holds the comparison area |
| Edits left visible seams, so the model could spot the synthetic cases by the seam | inspect the synthetic sheet |
| Audio cut at fixed 30 s marks split a sentence of a meeting across two segments | cut at silences or speaker changes, listed in a table |

## Tools and commands

- Bash: `sips` for format and size on macOS, `ffprobe` for audio and video where installed; the contact sheet
  script above.
- `aqven` MCP `run_start` (`mode: "live"`), `run_get_node`.
- Media import into datasets and case building: `building-datasets`.

## References

- `references/engine/image-preparation.md`: EXIF orientation, crops, synthetic inputs, the contact sheet,
  checking the trace. Read before step 3 and before building any synthetic input.
- `references/concepts/media-has-real-limits-on-both-sides.md`: provider limits for images, audio, video and
  documents, silent reshaping, why preparation happens in a `tool` node. Read at step 4.
- `references/reference/media.md`: the media value types (`Image`, `Audio`, `Video`, `Document`) and their fields.
  Read before typing a media input.
