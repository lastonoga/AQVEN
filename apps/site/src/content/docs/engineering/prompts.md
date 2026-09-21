---
title: Prompts
description: Keep model instructions next to the inference and preview them before a run.
---

An inference's prompt lives in a Markdown file beside its `.inference.yaml`. This makes the text reviewable in Git and keeps it separate from node wiring.

```text
reply.node.yaml
reply.inference.yaml
reply.prompt.md
```

AQVEN supports plain instruction text, a checked template, or a Python-rendered prompt. A template can use input variables and `{{ output_format }}`. The output marker inserts the declared output contract; do not maintain another copy of the schema in prose.

```liquid
Answer the question using only the supplied text.
<question>{{ text }}</question>
{{ output_format }}
```

Before running a model, preview the rendered request for a node:

```bash
uv run {{CLI_COMMAND}} prompt preview answer_question.reply --project .
```

The preview shows the messages, attachments, tools, and output contract AQVEN plans to send. If a prompt uses an optional input, handle its absence in the template. [Inspect the call in Studio](/studio/runs/) after execution.
