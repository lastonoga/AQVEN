---
title: Names, IDs, and Paths
description: Use stable identifiers, safe paths, and explicit references across an AQVEN project.
---

AQVEN derives most entity IDs from file names. A project stays navigable when its paths, IDs, and references are stable and describe the domain.

## File names define IDs

| Entity | Source location | ID source |
| --- | --- | --- |
| Project | `aqven.yaml` | One project per root |
| Flow | `flows/<flow_id>/flow.yaml` | Flow folder name |
| Node | `flows/<flow_id>/nodes/<node_id>/<node_id>.node.yaml` | Node file stem |
| Type | `types/.../<type_id>.yaml` | Type declaration and file name |
| Agent | `agents/<agent_id>.yaml` | File stem |
| Tool | `tools/<tool_id>.yaml` | File stem |
| Dataset | `datasets/<dataset_id>.yaml` | File stem |
| Evaluation | `evals/.../<eval_id>.yaml` | File stem |

Lowercase IDs use letters, digits, and underscores. Type names start with an uppercase letter. Prefer `answer_question`, `classify_intent`, and `OrderId` over names tied to a prompt version or provider.

## Value paths move data

Use value paths in field bindings to move a value into a node or return it from a flow:

```yaml
in:
  - name: "question"
    from: "$input.question"
  - name: "locale"
    from: "$run.context.locale"
```

Common roots are `$input`, `$in`, `$out`, `$item`, `$index`, `$case`, `$acc`, `$iter`, `$loop`, `$ok`, `$failed`, `$branch.<name>`, `$run.context`, and `<node_id>.out`. The checker verifies the referenced path exists and matches the receiving type. [Field Bindings](/engineering/field-bindings/) explains each scope and [Fields and bindings reference](/engineering/reference/fields/) gives the raw schema.

## Paths for files and code

`@root/` starts at the project root. `@flow/` starts at the current flow. A code reference names a Python callable:

```yaml
run: "@root/tools/functions.py:lookup_order"
```

Prompt files can be relative to their node or anchored with `@root/`. [Code References and Aliases](/engineering/code-references-and-aliases/) covers reusable aliases and signature checks.

## Rename deliberately

An ID can appear in another flow, a dataset, an evaluation, an external caller, or an existing run. Before renaming, use:

```bash
uv run {{CLI_COMMAND}} refs flow:answer_question .
```

Update every source reference, then record a rename in project configuration when historical runs or external users need the mapping. Run `{{CLI_COMMAND}} check .` before accepting the change.
