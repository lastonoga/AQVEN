---
title: How to prepare audio, video, documents and text for a flow
description: Inspect PDFs, recordings, clips, long documents and tables before a model reads them, keep the originals, cut them at boundaries you can check, keep every piece within the provider's limits, look at each piece before a series, and confirm in the trace what the model received.
---

## When you need this

Read this before a flow, a dataset or an experiment takes a PDF or a scan, a recording, a video clip, a long
document or a table, and before any code splits, trims, transcribes or edits one. A model answers from what it
receives: a call mixed down to one channel, a clip sampled past the moment that matters, or a contract cut off
after its first part gives a confident answer about something else. Photos and other images have their own page:
[How to prepare images for a flow](/engine/image-preparation/).

## What AQVEN does with these inputs

- `Audio`, `Video` and `Document` values are blobs, like `Image`: AQVEN sends the stored bytes to the provider
  unchanged. It does not transcode, trim, split, transcribe or render anything. A `Document` takes an
  `application/…` or `text/…` media type, so a PDF, a CSV file or a plain-text file can go as a document. Whether
  the provider reads that type is the provider's call; one run on a real case proves it.
- An inference attaches its own top-level media inputs only, one attachment per item of a list such as `Audio[]`
  or `Document[]`, the same rule as for images.
- Long text and table rows are ordinary values, not blobs: a `Text` field, or a list of records. AQVEN does not
  compare a prompt's length with the model's context window. A prompt past the window fails at the provider, or
  some providers shorten it without an error; [media has real limits](/concepts/media-has-real-limits-on-both-sides/)
  names one.
- A `code` node sees only the `media_type`, `blob_id` and `size_bytes` of a media value, so reading or writing
  its bytes (a transcript, a rendered page, a trimmed clip) happens in a [`tool` node](/engine/tool-node/)
  through `ctx.blobs`. A `code` node can split `Text` and rows, because they are plain values.

## Steps

1. **Inspect the sources.** Note, for every file:

   | Kind | What to note | How |
   | --- | --- | --- |
   | PDF or scan | page count, whether pages have a text layer or are scanned images, page size, rotation | `pdfinfo <file>` from Poppler, or a script with pypdf |
   | Audio | duration, sample rate, channels, language, number of speakers | `ffprobe -v error -show_entries stream=codec_name,sample_rate,channels:format=duration <file>` |
   | Video | duration, frame rate, resolution, whether there is an audio track | `ffprobe -v error -show_entries stream=codec_type,width,height,r_frame_rate:format=duration <file>` |
   | Long text | characters, estimated tokens against the model's context window, language, structure (headings, pages, speaker turns) | a script; English prose averages about four characters per token, many other languages take more tokens per character |
   | Table | rows, columns, column types, empty cells, encoding, delimiter, decimal separator | a script with Python's `csv` module |

   Set a case's `$media` from the real format, which `file <path>` prints, not from the file name.
2. **Keep the originals.** Store every source as it came, inside the project, the way
   [How to keep case media as files in the project](/engine/dataset-media-files/) describes. Never keep only a
   transcoded, trimmed, mixed-down or truncated copy: every derived file is rebuilt from the originals by a script.
3. **Apply stored rotation first.** A PDF page can carry a rotation (`Page rot` in `pdfinfo`). Render and crop
   pages upright, and do the same in the production step, so a region means the same thing in both.
4. **Fit every piece into the provider's limits.** Look the numbers up in the provider's current documentation;
   [media has real limits](/concepts/media-has-real-limits-on-both-sides/) explains why they change.
   - **Audio and video:** send segments within the model's duration and size limits. When the answer sits in a
     short moment, trim a clip around it, or choose a model or setting that samples densely enough, and check the
     frames sent: a provider that samples one frame per second can miss a half-second event.
   - **Long text:** never rely on silent truncation. Which option fits depends on where the answer lives, and
     none is right by default:
     - a model whose context window holds the whole text: one call sees every part, at the price of a long
       prompt;
     - the sections the question needs, selected before the call by structure or a search, when the answer
       lives in a known part;
     - chunks cut by structure, run once each with a [`map` node](/engine/map-node/) and merged in a later
       step, when each part can be answered on its own: each call is blind to the others, and the merge is a
       step of its own. Choose the map's `on_item_error` so a failed chunk cannot vanish from the merged
       answer: `fail`, or a merge that reads `$failed`;
     - a first pass that locates the evidence, then a call on those parts only.

     When more than one fits, compare them with an [experiment](/engine/experiments/), as in step 8.
   - **Tables:** send only the rows the question needs. When every row is a question of its own, such as a
     transaction to classify or a sensor reading to judge, the row can be the case and the input instead of the
     whole file.
   - **Small print in a PDF:** send the PDF as a `Document` when the model reads it natively and the print
     survives, or render the pages and treat them as images: one page image when only general content matters,
     crops at native resolution when small detail does. Compare the two when both fit.
5. **Cut at boundaries you can check, never at fixed offsets.** A 30-second grid splits sentences and a
   4,000-character grid splits clauses.

   | Kind | Cut at |
   | --- | --- |
   | PDF | page breaks, section headings, form fields |
   | Audio | silences, speaker turns, the channels of a call recorded one speaker per channel |
   | Video | scene changes, a known event time plus a margin |
   | Long text | headings, pages, speaker turns of a transcript |
   | Table | row boundaries, or a group key such as an account or a device |

   Every piece carries the context the prompt compares against: the definitions a clause refers to, the header
   row of a table, the names of the speakers. Keep the channels of a stereo call: mixed down to mono, it loses who
   said what.
6. **Make a synthetic input really have its labelled property.** Start from a base that does not have it, and
   change exactly what the prompt's definition names, where it names it, leaving nothing else the model could
   spot:
   - audio: noise at a stated signal-to-noise ratio, splices that cut no word and leave no click;
   - video: the event at a known timestamp;
   - documents and text: a clause or a field value planted on a known page or section, in the document's own
     wording and format;
   - tables: anomalies planted in known rows that look like real values, not all round numbers.
7. **Look at every derived item.** Render PDF pages with `pdftoppm -r 150 -png <file.pdf> <folder>/<prefix>` and
   video frames with `ffmpeg -ss <seconds> -i <clip> -frames:v 1 <frame.png>`, and put them on a contact sheet as
   the image page shows. For audio, keep a segment table with start, end and the first line of each segment's
   transcript, and listen to the cut points. For text, read the first and last line of every chunk. For a table,
   read a few rows of every group with their parsed types. Accept or reject each item and write the decision down
   before any series runs.
8. **Decide between native input and a text stage by an experiment.** Many models read audio, PDFs or video
   directly; others need a transcript, OCR text or frame captions first. Neither is right by default: a transcript
   drops tone and overlapping speech, OCR drops layout, a caption drops what it did not mention, and a native read
   can skip small print. Put the text stage in a `tool` node and compare the two paths with an
   [experiment](/engine/experiments/): the text stage's own errors are part of what you measure.
9. **Treat an empty list as an error.** A step that finds no segment, chunk or page fails or marks the case; it
   never sends an empty list that passes as a success.
10. **Check what the model received.** Before a run, `uv run {{CLI_COMMAND}} prompt preview <flow>.<node>` lists
    the attachments of the call. After a run, the MCP tool `run_get_node` (or the node in Studio's run view)
    shows the prompt as it was sent: one `audio`, `video` or `document` part per attachment, with its blob, name
    and size in bytes, and the full text, so you can see how much of a long document reached the model.

### Example

This example is for the case where chunking is the option chosen in step 4.
`scripts/chunk_by_heading.py` sits in the project root, next to `pyproject.toml`. It splits a long Markdown
document at its `## ` headings into chunks under a character budget, never inside a section, and repeats the text
before the first heading (the title and the parties) at the top of every chunk. A section longer than the budget
becomes a chunk of its own, marked `OVER LIMIT`. It writes one file per chunk and prints the first and last line of
each, so you can see where every chunk starts and ends. It needs nothing outside the standard library.

```python title="scripts/chunk_by_heading.py"
# /// script
# requires-python = ">=3.14"
# dependencies = []
# ///
import argparse
import re
from collections.abc import Sequence
from itertools import pairwise
from pathlib import Path
from typing import Final

SECTION_HEADING: Final = re.compile(r"^## ")
SEPARATOR: Final = "\n\n"
CHARACTERS_PER_TOKEN: Final = 4
PREVIEW: Final = 60


def split_sections(lines: Sequence[str]) -> tuple[str, list[str]]:
    starts = [index for index, line in enumerate(lines) if SECTION_HEADING.match(line)]
    preamble = "\n".join(lines[: starts[0] if starts else len(lines)]).strip()
    return preamble, ["\n".join(lines[start:end]).strip() for start, end in pairwise([*starts, len(lines)])]


def packed(sections: Sequence[str], budget: int) -> list[list[str]]:
    chunks: list[list[str]] = []
    for section in sections:
        last = chunks[-1] if chunks else None
        if last is not None and len(SEPARATOR.join((*last, section))) <= budget:
            last.append(section)
            continue
        chunks.append([section])
    return chunks


def preview(line: str) -> str:
    return line if len(line) <= PREVIEW else f"{line[: PREVIEW - 3]}..."


def describe(number: int, chunk: str, parts: Sequence[str], limit: int) -> str:
    first = parts[0].splitlines()[0]
    last = parts[-1].splitlines()[-1]
    size = f"{len(chunk)} chars, ~{len(chunk) // CHARACTERS_PER_TOKEN} tokens"
    flag = " OVER LIMIT" if len(chunk) > limit else ""
    return f"chunk {number}: {size}{flag}\n  first: {preview(first)}\n  last:  {preview(last)}"


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path)
    parser.add_argument("target", type=Path)
    parser.add_argument("--max-chars", type=int, default=12000)
    arguments = parser.parse_args()
    preamble, sections = split_sections(arguments.source.read_text(encoding="utf-8").splitlines())
    if not sections:
        raise SystemExit(f"no '## ' sections in {arguments.source}: nothing to chunk")
    budget = arguments.max_chars - len(preamble) - len(SEPARATOR)
    arguments.target.mkdir(parents=True, exist_ok=True)
    for number, parts in enumerate(packed(sections, budget), start=1):
        chunk = SEPARATOR.join(part for part in (preamble, *parts) if part)
        (arguments.target / f"{arguments.source.stem}__{number}.md").write_text(chunk, encoding="utf-8")
        print(describe(number, chunk, parts, arguments.max_chars))


if __name__ == "__main__":
    main()
```

On a hosting agreement of about 35,000 characters in 14 numbered sections:

```bash
uv run scripts/chunk_by_heading.py my_project/samples/hosting_agreement.md my_project/samples/hosting_agreement_chunks --max-chars 12000
```

```text
chunk 1: 9567 chars, ~2391 tokens
  first: ## 1. Definitions
  last:  Monthly availability below 99.5% entitles the Customer to...
chunk 2: 11759 chars, ~2939 tokens
  first: ## 4. Fees and invoicing
  last:  The Provider reports a security incident within 24 hours.
chunk 3: 11757 chars, ~2939 tokens
  first: ## 8. Subcontractors
  last:  On exit, the Provider returns all customer data within 30...
chunk 4: 2234 chars, ~558 tokens
  first: ## 14. General
  last:  The courts of Munich decide any dispute under this agreem...
```

Every chunk starts at a section heading and ends with the last sentence of a section, so no clause is cut. Only
the title and the parties travel with each chunk, though: sections 4 to 14 no longer see the definitions in
section 1. When clauses use defined terms, carry that section into every chunk too, and confirm it on the printed
lines. When the flow chunks at all, the same splitting belongs in a [`code` step](/engine/code-node/) before the
`map` node that runs over the chunks, so an experiment measures the chunks production sends. Chunking is one of the
long-text options of step 4; compare it with the others that fit before you build it into the flow.

## See also

- [How to prepare images for a flow](/engine/image-preparation/) — orientation, crops, synthetic images and the
  contact sheet.
- [Media has real limits on both sides of a model call](/concepts/media-has-real-limits-on-both-sides/) — what
  providers do with a large file, a long recording or a long prompt.
- [How to keep case media as files in the project](/engine/dataset-media-files/) — `file:` references, private
  files, and where bulk downloads wait.
- [How to give an agent a tool](/engine/tool-node/) — where transcription, OCR, rendering and trimming run,
  with `ctx.blobs`.
- [How to run a step over a collection](/engine/map-node/) — one call per chunk or segment, and what a failed
  item does.
- [Media and dynamic values](/reference/media/) — the fields of a media value.
