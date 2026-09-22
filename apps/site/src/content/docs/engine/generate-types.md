---
title: How to generate types and editor schemas
description: What {{CLI_COMMAND}} generate and {{CLI_COMMAND}} schema each write to disk, when a type change does and doesn't show up, and how to point your editor at the schema files.
---

## When you need this

`{{CLI_COMMAND}} generate` turns your project's type YAML into a `types.py` you can import from
`code` nodes and your own scripts. `{{CLI_COMMAND}} schema` writes JSON Schema files your editor can
use to validate and autocomplete the YAML files themselves. `{{CLI_COMMAND}} new` already runs
`generate` once when it creates a project; run it again yourself whenever you add or change a type and
want `types.py` to catch up without running the full [`check`](/engine/check/). `schema` never runs on
its own — run it once after creating a project, and again if you upgrade AQVEN and want the schema
files to match.

## Steps

- `{{CLI_COMMAND}} generate <path>` reads every type file under `types/` and writes it into
  `types.py` at the project root — a record becomes a Pydantic model, an enum or id type becomes a
  plain type alias. It also writes a Pydantic model for the input and output shape of every inference,
  tool, and `code` node. It always overwrites the whole file and prints `types.py` — the path it
  wrote, relative to the project root — whether or not anything actually changed.
- A field you add to a type shows up as a field on the matching class the next time you run `generate`.
  A type that can't be built at all — most often because one of its fields points at a type id that
  doesn't exist — is silently left out of `types.py` instead of stopping the command. `generate` still
  prints `types.py` and exits `0`; nothing on screen tells you a type went missing.
- `check` is what actually validates type references. It calls the same generation step internally
  before it checks anything else, so a bad reference shows up there as `E_TYPE_UNKNOWN` on the type
  file itself, plus an `E_CODE_REF_UNRESOLVED` on every node, tool, or eval whose Python code tried to
  import the class that generation dropped. If you just ran `generate` and a name you expected in
  `types.py` isn't there, that's your signal to run `check` next and read the real error.
- `{{CLI_COMMAND}} schema <path>` writes ten JSON Schema files to `.aqven/schema/`, one per kind of
  definition file: `project`, `type`, `flow`, `node`, `dataset`, `eval`, `inference`, `agent`, `tool`,
  and `mcpserver`. These describe the shape of the YAML files themselves — the keys a `flow.yaml` or a
  node file is allowed to have — not the types your project declares. They come out the same whether
  your project's types resolve cleanly or not, because `schema` doesn't load your project's type or
  flow definitions at all; it only needs to know where the project root is.
- Point your editor's YAML schema support at these files to get validation and autocomplete while you
  edit a definition file — most editors, including VS Code with the YAML extension, let you map a glob
  pattern to a local schema path. Match the schema to the `kind:` a file declares: `node.schema.json`
  for a `kind: Node` file, `flow.schema.json` for `flow.yaml`, and so on.

### Example

Create the showcase project if you don't already have one:

```bash
{{CLI_COMMAND}} new my_project --template showcase
cd my_project/my_project
```

`{{CLI_COMMAND}} new` already ran `generate` once, so running it again with nothing changed just
confirms `types.py` is current:

```bash
{{CLI_COMMAND}} generate .
```

```text
types.py
```

Add a field to `types/records/money.yaml`:

```yaml
- name: "currency"
  type: "CurrencyCode"
  description: "Валюта суммы"
- name: "note"
  type: "Text?"
  description: "Комментарий к сумме"
  maxLength: 50
```

Run `generate` again, and the new field appears on the matching class in `types.py`:

```bash
{{CLI_COMMAND}} generate .
```

```text
types.py
```

```diff
 class Money(BaseModel):
     model_config = GENERATED_CONFIG
     amount_minor: Annotated[int, Field(ge=0, le=1000000000)]
     currency: CurrencyCode
+    note: Annotated[str, StringConstraints(max_length=50)] | None
```

Now break a type on purpose, somewhere else in the project: `types/records/intent_ballot.yaml`'s
`intent` field points at `CaseIntent`; typo it to `CaseIntentTypo` and run `generate` again:

```text
types.py
```

Same output, exit code `0`. But `IntentBallot` is gone from `types.py` entirely — nothing referencing
an unresolved type can be built, so `generate` drops it rather than failing. `check` is what tells you
why:

```bash
{{CLI_COMMAND}} check . --static
```

```text
flows/support_case/nodes/tally/tally.node.yaml:5:1: error E_CODE_REF_UNRESOLVED run: reference tally → @root/flows/support_case/nodes/tally/tally.py:tally does not resolve: ImportError: cannot import name 'IntentBallot' from 'my_project.types'
types/records/intent_ballot.yaml:11:3: error E_TYPE_UNKNOWN fields[1].type: type CaseIntentTypo is neither built in nor declared in the project
errors: 2, warnings: 0
```

The real error, `E_TYPE_UNKNOWN`, is on the last line; the line above it is `tally`, the one node whose
Python code imports `IntentBallot` by name and can no longer find it in `types.py`. Fix the typo back to
`CaseIntent` and both commands go back to reporting a clean project.

`{{CLI_COMMAND}} schema` writes the editor schema files, listing each one it wrote:

```bash
{{CLI_COMMAND}} schema .
```

```text
.aqven/schema/project.schema.json
.aqven/schema/type.schema.json
.aqven/schema/flow.schema.json
.aqven/schema/node.schema.json
.aqven/schema/dataset.schema.json
.aqven/schema/eval.schema.json
.aqven/schema/inference.schema.json
.aqven/schema/agent.schema.json
.aqven/schema/tool.schema.json
.aqven/schema/mcpserver.schema.json
```

This still works even with the `CaseIntentTypo` mistake from above still in place — `schema` doesn't
read your project's types, so it has nothing to fail on.

## See also

- [Quickstart](/start/quickstart/) — `{{CLI_COMMAND}} new`, which runs `generate` once when it
  creates a project.
- [How to check a project before committing](/engine/check/) — the command that actually validates
  type references, by running the same generation step and then checking what it produced.
- [How to write a step in Python](/engine/code-node/) — importing generated classes from `types.py`
  in a `code` node's own Python function.
- [Diagnostics and error codes](/reference/diagnostics/) — `E_TYPE_UNKNOWN`, `E_CODE_REF_UNRESOLVED`,
  and every other code `check` can report.
- [CLI commands](/reference/cli/) — every other command, including `check`, `tree`, and `refs`.
