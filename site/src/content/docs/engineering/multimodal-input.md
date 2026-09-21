---
title: Images, Audio, Video, and Documents
description: Pass media as typed data and keep the text prompt honest about it.
---

A request type can include optional media fields:

```yaml
fields:
  - name: "photo"
    type: "Image?"
    description: "Optional image to inspect"
  - name: "voice_note"
    type: "Audio?"
    description: "Optional spoken description"
  - name: "video"
    type: "Video?"
    description: "Optional video evidence"
  - name: "invoice"
    type: "Document?"
    description: "Optional supporting document"
```

An LLM node binds the fields it needs from `$input`. AQVEN sends media to the Pydantic AI model request as media parts. The text prompt can tell the model how to use an attachment when it exists; it should not pretend that an absent attachment was inspected.

Provider capabilities differ. Check that the selected model accepts the modality you need before using it in a workflow. Keep a text-only case in your dataset, too, so optional media paths are exercised. [Studio Runs](/studio/runs/) lets you inspect the input and resulting call; the generated [Media reference](/engineering/reference/media/) lists the exact value shapes.
