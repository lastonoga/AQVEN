---
title: Media has real limits on both sides of a model call
description: Every modality a provider takes in or produces has a ceiling, and crossing it either reshapes your data silently or refuses the call outright — a rule worth knowing for any modality, not only the ones this page happened to research.
---

## In short

Every modality a provider accepts or produces has some ceiling, and crossing it does one of exactly two
things: the provider quietly reshapes what you sent — a resize, a downsample, a truncation — so the call
still succeeds but on different material than you gave it, or it refuses the request outright with no
partial result. Which one happens depends on the provider and the model, never on anything AQVEN
controls: AQVEN passes an `Image`, `Audio`, `Video` or `Document` field's bytes to the provider exactly
as declared, and hands back whatever the provider generates exactly as produced. Whether a model takes a
modality at all is the provider's call too: `aqven check` keeps no table of what each model reads, and a model
that refuses an image, audio, video or document input fails the step with `MODEL_FEATURE_UNSUPPORTED` and the hint to
choose a model that accepts it. Image resolution, video duration, audio length, document size — same two
behaviors, a different unit each time. An oversized *input* can be prepared down to size before the call, on
your own terms; an *output* past what one generation call can produce cannot be shrunk after the fact, because
it doesn't exist yet — the workflow itself has to become more than one call.

## The same shape, whatever the modality

This generalizes past any one provider or media type, and it's worth stating as a rule you can apply to
a modality this page never researched, not just the ones below:

1. **A ceiling exists, even when nothing in AQVEN's type system says so.** The provider is always the
   real constraint, whether or not AQVEN — or you — wrote one down anywhere.
2. **Crossing it does one of two things, and you don't get to assume which without checking.** Silent
   reshaping is the more dangerous of the two, because the call still reports success — the model just
   saw something other than what you sent, and nothing tells you that happened. A hard rejection is
   safer in that sense, since you get an explicit error to handle, but it breaks the flow if nothing
   catches it.
3. **The specific number is not durable.** A resolution tier, a duration cap, a character limit — these
   are exactly what a provider changes between model releases, sometimes doubling overnight the way one
   video model's duration cap did between two of its own versions. Treat every figure on this page,
   including the current ones below, as something to re-verify against the provider's own documentation
   before you design around it, not as a fact to hardcode into your judgment once and reuse forever.
4. **The fix has two different shapes, and they don't substitute for each other.** Prepare an oversized
   input down to size before the call, since you still control that data. A capped output can't be
   shrunk after the fact — the only fix is redesigning the flow to ask for it across more than one call.

Everything below — image resolution, video duration, audio length — is real, current evidence for this
rule, not an exhaustive catalog of it. There is no exhaustive catalog: new providers, new modalities, and
new limits inside modalities already covered here (aspect ratio, frame rate, sample rate, color space,
page count) show up faster than any page could track. What's durable is the rule above; look up the
number every time.

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
through unchanged. The type system enforces presence and MIME shape, not size — which is exactly why
rule 1 above matters: nothing in the project itself will ever tell you a ceiling exists.

A dataset case can point at a media file in the project with `file` instead of a `blob_id`. That changes
where the bytes live, not what the engine checks: the file becomes this same blob-backed value before the
run starts, with its real size and no limit on it. See
[how to keep case media as files in the project](/engine/dataset-media-files/).

## Evidence: the input side, across three providers

Three providers, real current numbers — proof of the pattern above, not the full list of providers or
modalities it applies to. Every general-purpose vision or video model has a working resolution or
duration it was trained and served at, and a request past that gets reshaped before the model ever sees
it, verified against each provider's own current documentation:

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

## Evidence: the output side, in a harsher form

An input limit degrades a result — a downscaled image, a sampled video. A generation limit refuses the
request outright: there is no partial fifteen-minute video, only an error or a request for something
shorter. Both directions are real in AQVEN today, but not through the same mechanism:

- **Image generation is a normal `llm` node output.** The showcase's `illustrate` node's `out` field is
  simply `type: "Image"` — the `painter` agent returns an instruction image the same way another agent
  returns structured text. No separate mechanism, no polling. That `out` type is what asks the model for an
  image, whatever the model: AQVEN keeps no table of which models draw, so a model that can't fails the step —
  refused by the provider, or by Pydantic AI before the request when its profile for that model has no image
  output.
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
left off — the provider's own answer to the same problem this page is about, and a preview of the exact
shape the next section describes generically.

## How this shapes what you do

Three rules generalize past every example above; the tactics below are how they play out for image,
video and audio specifically, not the rules themselves.

1. **Before you wire any modality into a call, find its real current ceiling** for that specific
   provider and model, in the direction you're using it — input or output — rather than assuming a
   number from memory, a past project, or this page a year from now.
   [`aqven models check`](/engine/check-providers/) confirms what an agent's models support
   structurally; it does not check media limits, so this discovery step is always manual, against the
   provider's own current documentation.
2. **On the input side, prepare the media yourself in a `tool` node before the call**, instead of
   letting the provider reshape it invisibly. This has to be a `tool` node, not a `code` node: reading or
   writing the real bytes behind an `Image`, `Audio`, `Video` or `Document` field goes through
   `ToolContext.blobs`, an async `get`/`put` pair a `code` node's synchronous function never receives — a
   `code` node only ever sees a media field's metadata (`media_type`, `blob_id`, `size_bytes`), never its
   content. Which preparation is right depends on whether the task needs the excess fidelity: a single
   downscale or trim is the cheap default when it doesn't; splitting into several pieces that each fit the
   ceiling is the move when it does, at the cost of more calls or tokens.
3. **On the output side, if the task needs more than one generation call can produce, restructure the
   flow into several calls** instead of trying to ask for more in one. Whether those calls chain
   sequentially or run independently is a judgment about the task, not a fixed recipe — and either way,
   something downstream has to reassemble the pieces.

What that looks like for the modalities this page actually researched:

- **Images (rule 2):** a single downscale to the model's working resolution is right when the task only
  needs the image's general content — is there a scratch, what room is this, what does the label say if
  the text is already large. It's wrong when the answer depends on detail spread across the whole image
  at a resolution the downscale throws away — reading dense small print on a page, finding a small
  defect that could be anywhere in a large product photo. There, split the image into several crops,
  each already inside the model's real resolution ceiling, and send them as separate image blocks in one
  request instead of one oversized block: providers support several images per call precisely for this
  (Anthropic's own guidance treats a multi-page document the same way — several image blocks, one per
  page, each labeled so the model can refer back to a specific one). More crops means more tokens and a
  `tool` node that knows how to tile and label them, so it's a real cost, worth paying only when the task
  actually needs full-resolution detail everywhere. The showcase's own sample case hides this, because
  its photo is already reasonably sized — test with a real, oversized phone photo before you trust the
  flow either way.
- **Video and audio input (rule 2):** trim to the moment that matters rather than relying on a
  provider's sampling to find it. A model sampling three hours of video at low resolution to answer a
  question about ten seconds of it is both slower and less accurate than a `tool` node that clips first.
- **Video generation past a duration cap (rule 3):** if a case genuinely needs a five-minute video from
  a model capped at fifteen or thirty seconds per call, the flow becomes several nodes, and which node
  kind ties them together depends on how the segments relate to each other. A later segment that depends
  on an earlier one's actual result — continuing from the last frame the way Veo's own `extend` does, so
  the cut doesn't jump, and you don't know in advance how many segments the target duration will take —
  is what a [`loop` node](/engine/loop-node/) is for: `init` seeds the first segment, `body` generates
  one segment per pass conditioned on the last, `stop` ends the loop once the accumulated duration
  reaches the target. Segments that can be planned and generated independently — a known shot list, a
  fixed number of scenes that don't need to flow from one to the next — are a job for
  [`parallel` or `map`](/engine/map-node/) instead, generating every segment at once. Either way, a final
  `tool` node concatenates the pieces — combining real video files is a blob read/write, not deterministic
  logic — and what differs is only the shape above it, and rule 3 is why: the
  provider's cap decided a pipeline was needed, the dependency between pieces decided which one.
- **Long generation, any modality (rule 3, the general case):** a long document past a model's maximum
  output length, a long narration past a text-to-speech endpoint's input cap, a poster past a diffusion
  model's resolution ceiling — same shape as the video example, different unit. Chunk the target, decide
  whether the chunks depend on each other, and pick `loop` or `parallel`/`map` by that answer, not by
  which modality happens to be involved.
- **Concurrency is the same ceiling, on a different axis.** [`parallel` and `map` nodes](/engine/map-node/)
  multiply how many attachments or generation requests reach a provider inside one flow run — rule 1
  applies to a rate limit or a concurrent-request cap exactly as it does to a single oversized file or an
  over-long generation: find the real number before you fan out, don't assume the provider will just
  queue what doesn't fit.

## See also

- [Field constraints](/engine/field-constraints/) — what AQVEN's type system does enforce on other field kinds
- [The `llm` node](/engine/llm-node/) — where a media field reaches a model, and where image generation
  is just another `out` field
- [How to give an agent a tool](/engine/tool-node/) — where a resize, trim, tile or transcode step
  actually belongs, `ToolContext.blobs` included, and where generation past what `llm` supports directly
  lives, `wait` included
- [The `code` node](/engine/code-node/) — deterministic logic with no blob access; confirms why media
  preparation doesn't belong here
- [How to repeat a step with a limit](/engine/loop-node/) — for chaining capped generations that depend
  on each other, one pass at a time
- [The `map` node](/engine/map-node/) — concurrency, provider rate limits, and for chaining capped
  generations that don't depend on each other
- [What happens when a model is called](/concepts/what-happens-when-a-model-is-called/)
