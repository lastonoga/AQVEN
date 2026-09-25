---
name: building-flows
description: "Writes AQVEN flows: node kinds, flat layout, prompt levels and variants, map and parallel, call slots, code steps, prompt_preview, flow_patch. Use before changing, renaming or removing files in flows/ or experiments/<id>/{nodes,prompts,flows}/, and on aqven check errors there."
---

## MUST

- Never `rm`, `mv`, `cp -r` or one regex over several project files. Adding, removing, renaming or moving a
  node, renaming a flow or an agent and deleting an agent go through MCP `flow_patch`. One file: Edit or Write.
- `flow_patch` cannot delete a flow: remove an empty flow folder with one `rm -r flows/<flow_id>` only after
  `uv run aqven refs flow:<flow_id> <package>` finds no reference. In an experiment folder, delete one file with
  one `rm <file>` only after `aqven check` names it in `W_ALTERNATIVE_UNUSED`.
- The project flow stays flat: every step is visible in one `flow.yaml`. A `call` slot for comparing patterns
  lives in a local flow of an experiment and leaves with the experiment.
- After changing a prompt, a fragment, a variant slot, an inference or a type, read the `prompt_preview` of every
  changed llm node in full.
- No comments and no docstrings in step and check code, and never a docstring moved into a `#` line above `def`.

## Procedure

| # | Step | Exit criterion |
|---|---|---|
| 1 | Read `FINDINGS.md`, `EXPERIMENTS.md`, `uv run aqven tree <package>`, `references/concepts/ten-kinds-of-nodes.md` and `references/concepts/three-prompt-levels.md` | every step has a node kind and a reason |
| 2 | Shape: one `llm` node per real decision of the contract, `code` for deterministic work; the same work over a list is `map`, independent opinions are `parallel`; `call` only for a reused flow or a comparison slot in an experiment; no formatter nodes, the prompt template shapes text | every llm node maps to a decision of the contract |
| 3 | Names: a node id names its role and kind (`extract_each_page`, not `gemini`); inference ids are unique across the project | ids read without opening files; no `E_ID_DUPLICATE` |
| 4 | Answer the questions of `hardening-flows` for each step | every step has an answer to "what if it fails" |
| 5 | File order: `flow.yaml` with `input`, `output` and `order` → types (`designing-output-contracts`) → agents (`choosing-models`) → nodes, inference, prompts → `returns`. Run `aqven_check` after each file | no `E_ORPHAN_FILE`, no `E_NODE_UNORDERED` |
| 6 | llm node: bindings in `in`; an inference whose output fits the model; the prompt file `<stem>.prompt.md` next to `<stem>.inference.yaml`; variable wording as a variant slot, shared text as a fragment | `aqven_check` clean |
| 7 | `prompt_preview` of every changed llm node: `{flow_id, node_id}` without `input` (samples come from the inference input schema) or with an input of the inference, never of the flow; force a slot with `variants: {<slot>: <case>}` (CLI `--variant <slot>=<case>`) | no empty or literal placeholder; the count and size of attachments as intended; the text agrees with the number of attachments |
| 8 | `code` step: parameters match `in` one for one, typed with `<package>.types`; the constraints in the signature are the type's own (`Annotated`, `Field`); the return type is the generated record; new output fields also go into `returns` | `pyright_check` and `aqven_check` clean |
| 9 | Structure through `flow_patch`: a fresh ULID `client_op_id` per call; `expects[{path, file_hash}]` for every file the ops touch (`"sha256-"` + sha256 of the current bytes, `null` when the file must not exist); a rename also lists `aqven.yaml`, which gets the `renames` entry | the patch applied; on `STALE_FILE` read the file again and replay the intent |
| 10 | Experiment folders: an alternative is an ordinary node in `experiments/<id>/nodes/<alt>/<alt>.node.yaml` (with its `.py`, `.inference.yaml`, `.prompt.md`) with the slot's `in` and `out`; a prompt alternative is text only in `experiments/<id>/prompts/<name>.md`; a local flow is `experiments/<id>/flows/<flow_id>/` in the usual format, with an id no project flow has | `aqven_check` gives no factor codes (`designing-experiments`) |
| 11 | One live run on a real input: MCP `run_start` with `mode: "live"` and `dataset_item_id: "<dataset_id>/<case_name>"` or `input`, then `run_get_node` of each llm node to see what the model received | the run finished, outputs are plausible, the run view reads well |

Binding grammar: `$input.<field>`, `$<node>.out.<field>`, `[*]` over a list, `[n]` for one item. Inside a map body
`$item` and `$index`. In the `out` of a `parallel` node `$branch.<key>` (never `$branch.<key>.out`) and
`$ok[*].<field>`; a `map` or `parallel` node collects successful items with `from: "$ok"`.

A variant slot of a prompt lives in the inference, its texts in `<stem>.variants/<slot>/<case>.md`:

```yaml
variants:
  lamp_guide:
    on: "product.lamp_kind"
    cases:
      mains: "mains"
      rechargeable: "rechargeable"
    default: "unknown"
```

The Liquid prompt prints it with `{{ variants.lamp_guide }}`, shares text with `{% include "fragments/<name>" %}`
and places `{{ output_format }}` exactly once. A plain-text prompt (no `{{ }}`, no `{% %}`) gets inputs and the
output contract appended by the engine.

## Pitfalls

| What goes wrong | Right | Code |
|---|---|---|
| `parallel` written with `branches:` | `body` (key → node) and `join` | `E_UNKNOWN_KEY` |
| `MapItemError` imported from `aqven.policies` | `from aqven.spec import MapItemError` | import error |
| `[]` in a list path; `$index` outside a map body | `[*]`; `$index` only inside a map body | `E_REF_SYNTAX`, `E_REF_SCOPE` |
| `on_item_error: skip` | `on_item_error:` with `use: "skip"` on the next line | `E_SPEC_INVALID` |
| `{{ output_format }}` twice or never in a Liquid prompt | exactly once | `E_PROMPT_OUTPUT_FORMAT` |
| a declared input or slot never printed by the prompt | print `{{ variants.<slot> }}` or drop the input | `E_PROMPT_INPUT_UNUSED` |
| wording assembled as a string in Python | a variant slot and fragments; model: Lumen `revise.inference.yaml` in `references/engine/lumen-patterns.md` | none: review |
| comments in YAML; YAML dumped with anchors or flow style | no comments; a dumper with `ignore_aliases`, block style, no key sorting | `E_YAML_COMMENT`, `E_YAML_ANCHOR`, `E_YAML_FLOW_STYLE` |
| a docstring in a step or check function, then moved into a comment | neither; the meaning goes into the node's `description` or `experiment.md` | `E_DOCSTRING` |
| a check's `context` typed as `object`; `Text` limits in a signature differ from the type | `context: EvalContext[<In>, <Out>]` with generated types; `Annotated` limits copied from the generated type | `E_CODE_SIGNATURE_MISMATCH` |
| new output fields missing from `returns` | add them | `E_BINDING_TYPE` |
| a schema built at run time (`FieldSpec`) passed across a `call` boundary | build it in the flow that reads it | `E_SIM_NODE_FAILED` |
| Liquid `join` filter, nested loops | forbidden; a plain-text prompt lists inputs by itself | `E_PROMPT_FILTER_FORBIDDEN`, `E_PROMPT_TAG_FORBIDDEN` |
| an `Image` output next to other fields; audio or video as an llm output | an `Image` output is the only field | `E_MODALITY_UNSUPPORTED` |
| `Image` inside a nested record of the input | `Image` or `Image[]` at the top level of the inference input | compile or run error |
| guessed names of generated classes | read them from `uv run aqven tree` and `uv run aqven refs`; names change on collisions | `E_CODE_REF_UNRESOLVED` |
| display asked for on a `code` node or the flow output | display exists only on an llm node's inference; tell the owner | none |
| the prompt text disagrees with what is attached ("compare the two scans" when the preview shows one) | match the wording to the attachments the preview lists | none: preview |
| a nested flow per part of the input (one flow per section of a contract) | a flat flow: `map` over the parts; text that differs per kind of part is a variant slot | none: review |
| a node named after its model (`gemini`) | a name of role and kind: `extract_each_page` | none: review |
| `prompt_preview` with a node path or the flow input | `flow_id` and `node_id`; the inference input or none | `NOT_FOUND`, `INPUT_INVALID` |
| `run_start` without `mode` | `mode: "live"` | `REQUEST_INVALID` |
| an invented `client_op_id`; `expects` without `aqven.yaml` on a rename | a real ULID; every touched path; the error lists the missing paths with their current hashes | `REQUEST_INVALID` |

## Tools and commands

- `aqven` MCP `flow_patch`, `aqven_check`, `prompt_preview`, `pyright_check`, `run_start`, `run_get_node`.
- `uv run aqven tree <package>`, `uv run aqven refs <kind>:<id> <package>`, `uv run aqven generate <package>`.
- `uv run aqven prompt preview <flow_id>.<node_id> --project <package> --variant <slot>=<case>`.

## References

- `references/engine/snippets.md`: verified snippets (code-step signature, binding paths, `parallel` with `body`
  and `join`, `map` with `use: "skip"`, a variant slot and a fragment, a display template, allowed Liquid, a YAML
  dumper for scripts, a ULID). Read before writing any file of a kind you have not written in this session.
- `references/engine/lumen-patterns.md`: real Lumen files for a variant slot, `map`, `parallel`, `call` and every
  factor kind. Read before a variant slot, a container node or an experiment folder.
- `references/concepts/ten-kinds-of-nodes.md`, `references/reference/nodes.md`: node kinds and every node key.
  Read at step 1 and before a node kind you have not used.
- `references/concepts/three-prompt-levels.md`, `references/engine/prompts.md`, `references/reference/prompts.md`:
  plain text, Liquid and code prompts. Read before writing a prompt.
- `references/engine/llm-node.md`, `references/engine/code-node.md`, `references/engine/parallel-node.md`,
  `references/engine/map-node.md`, `references/engine/call-node.md`: one page per node kind. Read before that kind.
- `references/engine/display-templates.md`: readable run output. Read when the owner asks for a readable run view.
- `references/concepts/two-ways-to-change-a-project.md`, `references/mcp-cli/edit-a-flow.md`: files versus
  `flow_patch`. Read before the first structural change.
- `references/mcp-cli/preview-a-prompt.md`: `prompt_preview` input and output. Read before step 7.
- `references/reference/flows.md`, `references/reference/inference.md`: every key of a flow and an inference.
- `references/engine/experiments.md`: the experiment folder and its `nodes/`, `prompts/`, `flows/`. Read before
  step 10.
- `references/reference/diagnostics.md`: every `aqven check` code. Read on a code this skill does not name.
