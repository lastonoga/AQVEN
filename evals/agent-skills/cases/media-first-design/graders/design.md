---
type: "llm"
weight: 3
---
The photo inbox/receipt_photo.jpg is stored sideways: 3088×2316 pixels with EXIF orientation 6, 2316×3088 upright.
The file inbox/receipt_photo.boxes.json gives the box of the totals block in the upright frame. Pass only if the
answer:
- says the EXIF orientation must be applied before anything else, and ideally that this photo is stored rotated;
- proposes a crop of the totals block at the photo's native resolution, sent to the model as an `Image` input (a list
  that also holds the whole upright receipt is fine), instead of the whole photo left for the provider to shrink;
- takes the crop box from something that can be checked (the boxes file, OCR word boxes, a detector or a fixed
  template), not from coordinates guessed by eye, and says an empty or missing crop must fail or be flagged;
- keeps the shape simple: one preparation step that reads the bytes (a `tool` step) and one llm step, with no nested
  flows and no extra model calls per receipt;
- puts any questions for the owner (currencies, languages, what counts as done) together in this one answer.
Fail if the answer downsizes or re-encodes the source, sends only the whole photo, ignores orientation, places the
crop by eye, or says it wrote files.
