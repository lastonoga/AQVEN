---
title: Media has real limits on both sides of a model call
description: Whatever an Image, Audio or Video field carries goes to the provider as declared, and whatever a model generates back is capped the same way — a provider's real limit, on either side of the call, can force the workflow itself to change shape, not just the data.
---

## In short

AQVEN does not reshape media on either side of a model call. An `Image`, `Audio`, `Video` or `Document`
field's bytes go to the provider exactly as declared, and whatever the model generates back — an image,
an audio narration — comes back exactly as the provider produced it. Every provider caps both directions:
an oversized attachment gets resized or rejected; a generation request past a duration or length limit
gets refused outright, with no partial result. For input, the fix is usually a `code` node that prepares
the media before the call. For generation, a limit below what the task needs is not something a `code`
node can paper over — it means the workflow itself becomes a chain of smaller generations instead of one.

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

## The provider reshapes what you send in, on its own terms

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

## Generating media has the same problem, in a harsher form

An input limit degrades a result — a downscaled image, a sampled video. A generation limit refuses the
request outright: there is no partial fifteen-minute video, only an error or a request for something
shorter. Both directions are real in AQVEN today, but not through the same mechanism:

- **Image generation is a normal `llm` node output.** The showcase's `illustrate` node's `out` field is
  simply `type: "Image"` — the `painter` agent returns an instruction image the same way another agent
  returns structured text. No separate mechanism, no polling.
- **Audio generation, in the showcase, goes through a `tool` node instead.** The `voice` node calls
  `synthesize_voice`, a plain synchronous function that hits OpenAI's text-to-speech endpoint and
  returns `type: "Audio"` from the tool's own `out`. That endpoint caps its `input` text at exactly
  4096 characters per request — the showcase's tool already declares `maxLength: 1500` on its own `text`
  field, well under that ceiling, so a long reply never has a chance to hit the provider's limit.
- **Video generation has no example anywhere in AQVEN**, because no built-in mechanism generates one:
  the engine's own media-output wiring (`aqven_llm`'s `MediaOutput`) carries an `image` flag and an
  `audio` setting, nothing for video. A video-generation step is a `tool` node calling a video model's
  API directly — the same shape as `voice`, but usually with `wait`, since these are asynchronous jobs
  you submit and poll rather than a request that returns immediately.

Real current numbers on that last point, since a video model's duration cap is exactly the kind of thing
worth checking before you design around it, not assuming: ByteDance's Seedance 2.0 generates up to 15
seconds per request, from a fixed set of allowed durations (4, 5, 6, 8, 10, 12, 15); Seedance 2.5 doubles
that to 30 seconds. Google's Veo 3.1 caps a single clip at 8 seconds, but ships a documented `extend`
feature that takes a 1–30 second source clip and appends a further 7 seconds, continuing from where it
left off — the provider's own answer to the same problem this page is about.

## How this shapes what you do

**For input**, treat an attachment field's real constraint as the model's, not the type's, and put the
correction where you can see and test it: a `code` node between where the attachment enters the flow and
the `llm` node that reads it, doing the same downscale or trim the provider would do anyway, on your
terms instead of theirs.

- **Resize images before the call, not after a bad answer** — but resizing is not the only move, and
  picking between it and the alternative is a judgment about the task, not a default. A single downscale
  to the model's working resolution is the cheap fix, and it's the right one when the task only needs
  the image's general content: is there a scratch, what room is this, what does the label say if the
  text is already large. It's the wrong one when the answer depends on detail spread across the whole
  image at a resolution the downscale throws away — reading dense small print on a page, finding a small
  defect that could be anywhere in a large product photo. There, the move is to split the image into
  several crops, each already inside the model's real resolution ceiling, and send them as separate
  image blocks in one request instead of one oversized block: providers support several images per
  call precisely for this (Anthropic's own guidance treats a multi-page document the same way — several
  image blocks, one per page, each labeled so the model can refer back to a specific one). More crops
  means more tokens and a `code` node that knows how to tile and label them, so it's a real cost, not a
  free upgrade — worth paying only when the task actually needs full-resolution detail everywhere, not
  as a reflex. The showcase's own sample case hides this, because its photo is already reasonably sized
  — test with a real, oversized phone photo before you trust the flow either way.
- **Trim video and audio to the moment that matters**, rather than relying on a provider's sampling to
  find it. A model sampling three hours of video at low resolution to answer a question about ten
  seconds of it is both slower and less accurate than a `code` node that clips first.

**For generation**, a limit below what the task needs cannot be absorbed by a `code` node at all, because
there's no oversized thing to shrink — the shortfall is on the output side, and the only fix is asking
for the output in pieces. If a case genuinely needs a five-minute video from a model capped at fifteen or
thirty seconds per call, the flow is not one `llm` or `tool` node anymore; it's several, structured the
way a [`loop` node](/engine/loop-node/) already is: `init` seeds the first segment, `body` generates one
segment per pass — each one a `tool` node call that, like Veo's own `extend`, conditions on the previous
segment's last frame so the cut doesn't jump — `stop` ends the loop once the accumulated duration reaches
the target instead of running to an arbitrary cap, and a final `code` node concatenates the segments a
loop's `select` can't hand back on its own. That's a materially different flow than the one-node version
someone reaches for first, and the redesign is the whole point: the provider's cap decided the shape of
the pipeline before a single node was written.

- **Concurrency has the same shape as size.** [`parallel` and `map` nodes](/engine/map-node/) multiply
  how many attachments or generation requests reach a provider inside one flow run — the same "the
  provider decides, not AQVEN" logic applies to rate limits and concurrent-request caps, not only to a
  single oversized file or an over-long generation.
- **Check the actual current provider docs before you pick a number, for every modality.** The figures
  above are what each provider states today; a resolution tier, a token multiplier, or a duration cap is
  exactly the kind of number a provider changes between releases — Seedance itself doubled its cap from
  one version to the next. [`aqven models check`](/engine/check-providers/) confirms what an agent's
  models support structurally; it does not check media limits, so verify those against the provider's
  own current documentation, not against this page a year from now.

## See also

- [Field constraints](/engine/field-constraints/) — what AQVEN's type system does enforce on other field kinds
- [The `llm` node](/engine/llm-node/) — where a media field reaches a model, and where image generation
  is just another `out` field
- [The `code` node](/engine/code-node/) — where a resize, trim or transcode step belongs
- [How to give an agent a tool](/engine/tool-node/) — where generation past what `llm` supports directly
  lives, `wait` included
- [How to repeat a step with a limit](/engine/loop-node/) — the mechanism behind chaining several capped
  generations into one longer result
- [The `map` node](/engine/map-node/) — concurrency and provider rate limits
- [What happens when a model is called](/concepts/what-happens-when-a-model-is-called/)
