---
title: Safety and Reliability
description: Keep trust boundaries, checks, and recovery visible.
---

Treat user text, retrieved documents, and tool results as data. An `untrusted_input` prompt fragment can tell the model not to follow instructions found inside that content. The project can declare PII trace masking and redaction in `aqven.yaml`.

Put a check close to the output it protects. An inference may check citations against retrieved chunks, limit answer length, and reject PII. A failed check can retry, fail, or flag according to `on_fail` in the inference contract. The generated [Inference reference](/engineering/reference/inference/) lists its fields.

For long-running work, AQVEN uses DBOS workflow and step primitives. A completed step can be recovered after interruption; a human step can wait and resume. This does not make every external effect safe by itself. Declare tool effects accurately and design any write operation so a retry cannot silently duplicate it.

When debugging, start with [Studio Runs](/studio/runs/): identify the first node whose input, output, or check differs from the intended behavior. Then reproduce it with a dataset case and run `{{CLI_COMMAND}} check` after the fix. [Architecture](/engineering/architecture/) explains the runtime boundary.
