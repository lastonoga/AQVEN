---
title: Model Capabilities
description: Match a model route to the modalities, tool behavior, structured-output mode, and streaming your workflow requires.
---

Before selecting a model, list what the node actually needs: text, image/audio/video/document input, model tool calls, strict structured output, and streaming. A provider prefix or OpenAI-compatible endpoint does not prove all of those features work.

Use declared provider capabilities to prevent invalid assumptions, then run `uv run {{CLI_COMMAND}} models check --project .`. Use `--live` only after credentials and cost policy are ready. [Types and Structured Output](/engineering/types/#media-fields-images-audio-video-documents) covers media; [Structured Output](/engineering/structured-output/) covers response modes.
