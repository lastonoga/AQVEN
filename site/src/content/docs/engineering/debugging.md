---
title: Debugging a Workflow
description: Find the first broken contract or runtime step, reproduce it, and verify the repair.
---

Debug in order: definition, wiring, rendered request, execution trace, then model behavior. Do not change a prompt or provider until you know which layer failed.

## 1. Check the project

```bash
uv run {{CLI_COMMAND}} generate .
uv run {{CLI_COMMAND}} check .
```

`check` validates files, identifiers, references, field bindings, callable signatures, provider compatibility, and simulated paths. Use `--static` when you need only structural diagnostics. A successful check does not make a live model call.

## 2. Locate the definition

```bash
uv run {{CLI_COMMAND}} tree .
uv run {{CLI_COMMAND}} refs node:reply .
```

Use `tree` to see discovered entities and `refs` to find an entity’s incoming and outgoing references. This is safer than changing an ID by text search alone.

## 3. Preview the request

For a model request, inspect the rendered prompt before using a provider:

```bash
uv run {{CLI_COMMAND}} prompt preview answer_question.reply --project .
```

Confirm that variables are present, untrusted input is represented correctly, the intended variant was chosen, and the requested output has the expected shape.

## 4. Inspect the first differing node

Open the run in Studio. Start at the first node whose input, output, status, or attempt differs from the expected path. Check its binding source, node contract, prompt or code implementation, tool result, and the preceding output. Avoid diagnosing a final answer before checking the value that caused it.

## 5. Preserve the failure

Add a dataset case with the smallest input that reproduces the behavior. Add boundary fixtures when the failure begins in the middle of a flow. Then rerun the case and the relevant evaluation after the repair.

| Symptom | First place to inspect |
| --- | --- |
| YAML or type error | `{{CLI_COMMAND}} check .` and generated reference |
| Missing input at a node | Binding path and earlier node output |
| Prompt has an unexpected value | Prompt preview and inference bindings |
| Model response cannot validate | Output type, agent output mode, provider capability |
| Tool effect is unsafe or repeated | Tool contract, idempotency, approval policy |
| Run is waiting | Studio Review and the human or deferred-tool request |

[Datasets](/engineering/datasets/) and [Testing and Evaluation](/engineering/testing-and-evaluation/) turn this loop into repeatable evidence.
