---
title: What happens to media before a model sees it
description: AQVEN sends an Image, Audio, Video or Document field's bytes to the provider exactly as declared — nothing resizes, samples or caps it first, so an oversized attachment is more cost and worse fidelity, not more signal.
---

## In short

AQVEN does not resize an image, sample a video, trim an audio clip or cap a document before an `llm`
node sends it to a model. Whatever bytes an `Image`, `Audio`, `Video` or `Document` field carries go to
the provider exactly as declared. The provider then does its own thing with an oversized attachment —
usually downscaling it to a resolution or duration it can actually use, sometimes rejecting it outright
— and that reshaping happens whether or not it helps the answer. Design as if it will happen, in a
`code` node before the call, not after a bad answer shows up.

## Media fields carry no size limit AQVEN enforces

[Field constraints](/engine/field-constraints/) covers `maxLength` on `Text`, `pattern` and `enum` on
`Text`, `minimum`/`maximum` on `Int`/`Float`, `maxItems` on any list. `Image`, `Audio`, `Video` and
`Document` have no equivalent: the engine's `MediaValue` shape — `media_type`, `blob_id`, `size_bytes`,
an optional `name` — only requires `size_bytes` to be zero or more. There is no `maxSizeBytes`, no
`maxDurationSeconds`, no `maxResolution` a type YAML can declare. The showcase's `case_request` type
shows this directly:

```yaml
- name: "photo"
  type: "Image?"
  description: "Photo of the defect or the packaging; null when none was attached"
- name: "video"
  type: "Video?"
  description: "Video of the defect; null when none was attached"
```

Nothing here caps what `photo` or `video` can hold. A phone photo at 12,000×9,000 pixels and a
two-minute video are both valid values for these fields, and `check` and runtime validation pass them
through unchanged. The type system enforces presence and MIME shape, not size.

## The provider reshapes what you send, on its own terms

Every general-purpose vision or video model has a working resolution or duration it was trained and
served at, and a request past that gets reshaped before the model ever sees it — verified against each
provider's own current documentation:

- **Anthropic** downscales an oversized image automatically to fit the model's tier: 1568px long edge /
  1568 visual tokens on standard-tier models, 2576px / 4784 tokens on Claude 4.7 and later. A 3840×2160
  image on a standard-tier model gets resized to 1456×819 before Claude sees it — the extra pixels you
  sent bought nothing but token cost. At Claude Opus 5's high-resolution pricing, that same 4K image
  costs roughly 18 times what a 1000×1000 image of the same scene costs, for a result Claude sees at a
  fraction of the original detail. Anthropic's own guidance: "your image might be resized if it is too
  large... Consider pre-resizing your images, cropping them, or both."
- **OpenAI** resizes to fit each model's pixel and patch limits, preserving aspect ratio, and only
  rejects a request outright once an image still exceeds a 30,000-patch ceiling after that resize.
- **Google Gemini** caps video by duration, not just file size: a 1M-context model accepts up to 3 hours
  of video at low sampling resolution, or 1 hour at high resolution — the same footage costs a
  different share of the context window depending on a setting your workflow controls.

None of this is an AQVEN behavior to configure. It is what happens on the provider's side of the call
your `llm` node makes, and it happens the same way whether the extra resolution or duration was
deliberate or just whatever the customer's phone produced.

## How this shapes what you do

Treat an attachment field's real constraint as the model's, not the type's, and put the correction where
you can see and test it: a `code` node between where the attachment enters the flow and the `llm` node
that reads it, doing the same downscale or trim the provider would do anyway, on your terms instead of
theirs.

- **Resize images before the call, not after a bad answer.** If the model downscales to roughly 1568px
  on the long edge anyway, sending 1568px costs the same tokens as sending 4K and skips the guesswork
  about which crop or region survives the provider's own resize. The showcase's own sample case hides
  this, because its photo is already reasonably sized — test with a real, oversized phone photo before
  you trust the flow.
- **Trim video and audio to the moment that matters**, rather than relying on a provider's sampling to
  find it. A model sampling three hours of video at low resolution to answer a question about ten
  seconds of it is both slower and less accurate than a `code` node that clips first.
- **Concurrency has the same shape as size.** [`parallel` and `map` nodes](/engine/map-node/) multiply
  how many attachments reach a provider inside one flow run — the same "the provider decides, not AQVEN"
  logic applies to rate limits and concurrent-request caps, not only to a single oversized file.
- **Check the actual current provider docs before you pick a number.** The figures above are what each
  provider states today; a model-specific resolution tier, a token multiplier, or a duration cap is the
  kind of number a provider changes between releases.
  [`aqven models check`](/engine/check-providers/) confirms what an agent's models support structurally;
  it does not check media limits, so verify those against the provider's own current documentation, not
  against this page a year from now.

## See also

- [Field constraints](/engine/field-constraints/) — what AQVEN's type system does enforce on other field kinds
- [The `llm` node](/engine/llm-node/) — where a media field actually reaches a model
- [The `code` node](/engine/code-node/) — where a resize, trim or transcode step belongs
- [The `map` node](/engine/map-node/) — concurrency and provider rate limits
- [What happens when a model is called](/concepts/what-happens-when-a-model-is-called/)
