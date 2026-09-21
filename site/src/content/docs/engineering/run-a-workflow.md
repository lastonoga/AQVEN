---
title: Run a Workflow
description: Execute a flow locally with JSON input, declared context, scripted human answers, and readable event output.
---

Run a flow from a project environment with an input JSON file:

```bash
uv run {{CLI_COMMAND}} run answer_question \
  --root . \
  --input samples/question.json
```

Add `--context KEY=VALUE` for a declared run-context key, repeat it for more keys, and use `--human-answers FILE_JSON` when a test needs scripted human decisions. Choose an output format appropriate for a terminal or automation consumer.

This path runs locally and may make real provider calls. Use [Automated Tests](/engineering/automated-tests/) and cassettes for repeatability. The generated [CLI Reference](/engineering/reference/cli/) reflects current flags.
