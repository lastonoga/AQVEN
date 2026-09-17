# AQVEN project structure

> Status: standard layout as of 2026-09-17 (owner decisions O14–O22 in
> [examples/showcase/DESIGN.md](../examples/showcase/DESIGN.md) §1). Reference project: `examples/showcase/lumen/src/lumen`.
> This file is source material for the library documentation and for AI agents that edit AQVEN projects.

## 1. The idea in one paragraph

An AQVEN project is a Python package whose workflows are described by YAML files next to the code they use. The file
system is the source of truth: an entity's identity is its path, the kind comes from `kind:` inside the file, and there
is no `id` field. Every kind of entity has exactly one standard place. A workflow step is the unit of layout: each
top-level node owns a folder, and everything that belongs only to that step lives in it under the step's name. Things
used from several places move up to the one root folder for their kind. Types are declared once in YAML and Python
models are generated from them, so code never re-declares a shape.

## 2. Principles

| # | Principle | Why |
|---|---|---|
| 1 | **Files are the source of truth.** Id = file name up to the first dot (`triage.node.yaml` → node `triage`); a flow's id is its folder name (`flows/support_case/flow.yaml` → `support_case`). No `id:` keys. | Renames are file moves, git history is the change log, the database is a rebuildable index. |
| 2 | **The loader finds files by content, not by location.** Every `*.yaml` with `apiVersion: aqven/v1` is loaded and dispatched by `kind`. Only `aqven.yaml` at the root is fixed. | Users may deviate from the standard; the standard is a convention, not a cage (O14, O18). |
| 3 | **One place per kind.** `types/`, `fragments/`, `code/`, `evals/`, `agents/`, `tools/`, `mcp/`, `flows/` exist only at the module root. | An agent or a person always knows where to look; no competing "shared" folders at different depths (O22). |
| 4 | **The step is the unit of layout.** Each top-level node of a flow has `nodes/<node>/`; all its descendants (bodies of `parallel`, `map`, `loop`, cases of `switch`) sit flat in that same folder. | One folder shows everything a step does; deep nesting of node folders is avoided (O16, O22). |
| 5 | **Companions share the prefix.** Files that belong to an entity sit next to it and start with its id: `<id>.inference.yaml`, `<id>.prompt.md`, `<id>.variants/`, `<id>.py`, `<id>.instructions.md`. | Convention replaces configuration keys; the prefix makes ownership visible in a plain file listing. |
| 6 | **Convention first, explicit override second.** An inference next to its node needs no `inference:` key; a prompt next to its inference needs no `prompt:` key; a bare function name resolves to `<id>.py` next to the declaring file. Explicit keys exist for reuse and exceptions. | Short files for the common case, full control when needed (O15, O18, O20). |
| 7 | **Types live only in YAML; models are generated.** `aqven generate` writes `types.py` at the module root, next to the `types/` folder of YAML; project code imports models from `<module>.types` and never writes its own copy of a declared shape. | One declaration, no drift between YAML and Python, schemas stay identical for the model, the API and the code (O19). |
| 8 | **Reuse by reference, not by copy.** A shared inference stays with its owner node and is referenced by id; a reusable subgraph is a separate flow called by a `call` node; shared prompt text is a fragment; value sets used in code come from generated enum types. | Copies drift silently; references are checked by `aqven check`. |
| 9 | **Short references in files, absolute references in the IR.** Code refs may use short forms; the compiler stores only absolute refs. | Moving a file changes only resolution, never run records or hashes of unrelated entities (O20). |

## 3. Standard tree

```
<module>/                                   Python package, e.g. lumen/src/lumen
  aqven.yaml                                kind Project: providers, data policies, trust defaults
  types.py                                  generated models (aqven generate), gitignored, first line: DO NOT EDIT header
  agents/
    <agent>.yaml                            kind Agent: model "provider:model", settings, output settings, limits
    <agent>/                                agent with companion files becomes a folder
      <agent>.yaml
      <agent>.instructions.md               agent instructions
      <inference>.inference.yaml            inference of a subagent that no node owns
      <inference>.prompt.md
  tools/
    <tool>.yaml                             kind Tool: run ref, effect read|write, secrets, in/out
    functions.py                            tool functions, referenced as @root.tools.functions:<fn>
  mcp/<server>.yaml                         kind McpServer
  types/
    enums/<type>.yaml                       kind Type, type enum
    ids/<type>.yaml                         kind Type, type id (pattern, allowed sets)
    records/<type>.yaml                     kind Type, type record
    unions/<type>.yaml                      kind Type, type union
    values/<type>.yaml                      bounded scalars, e.g. Score
  fragments/<fragment>.md                   static prompt text shared by several prompts
  code/<module>.py                          Python used from several places (several nodes, node + eval, several flows)
  evals/<flow>/
    <dataset>.yaml                          kind Dataset
    <eval>.yaml                             kind Eval
  flows/<flow>/
    flow.yaml                               kind Flow: input, output, returns, context, order
    nodes/<top_node>/
      <top_node>.node.yaml                  kind Node
      <top_node>.inference.yaml             inference of an llm node (no inference: key needed)
      <top_node>.prompt.md                  prompt of that inference (no prompt: key needed)
      <top_node>.variants/<slot>/<case>.md  prompt variants
      <top_node>.py                         step code, custom checks and policies, level-3 prompt function
      <child>.node.yaml                     any descendant at any depth, flat, same prefix rule
      <child>.inference.yaml, .prompt.md, .variants/, .py
```

Host application around the module (see `examples/showcase`): `app/` (embedding or remote client), `tests/`,
`pyproject.toml`, `.gitignore` with `<module>/types.py`. Runtime state of a project lives in `.aqven/` (drafts, lock,
transactions, blobs, SQLite databases); it is never hand-edited and never committed.

## 4. Kind → location

| Kind | Standard place | Id comes from |
|---|---|---|
| Project | `aqven.yaml` at the module root | — |
| Agent | `agents/<agent>.yaml`, or `agents/<agent>/<agent>.yaml` when it has companions | file name |
| Tool | `tools/<tool>.yaml`; functions in `tools/functions.py` | file name |
| McpServer | `mcp/<server>.yaml` | file name |
| Type | `types/{enums,ids,records,unions,values}/<type>.yaml` | file name in snake_case → PascalCase TypeId (`case_intent.yaml` → `CaseIntent`) |
| Fragment | `fragments/<fragment>.md` | file name |
| Flow | `flows/<flow>/flow.yaml` (or builder `flow.py`) | folder name |
| Node (top level) | `flows/<flow>/nodes/<node>/<node>.node.yaml` | file name |
| Node (descendant) | flat in the folder of its top-level node: `<child>.node.yaml` | local id from the file name; expanded id `parent__child` from the parent's `body`/`cases` |
| Inference of a node | next to the node, same prefix: `<node>.inference.yaml` | file name |
| Shared inference | next to its owner node under the owner's name; others use `inference: <id>` | file name |
| Subagent inference | `agents/<agent>/<inference>.inference.yaml` | file name |
| Prompt | `<inference>.prompt.md` next to the inference | inference id |
| Prompt variants | `<inference>.variants/<slot>/<case>.md` | slot and case names |
| Step code | `<node>.py` next to the node | node id |
| Python shared by several places | `code/<module>.py` | module path |
| Dataset, Eval | `evals/<flow>/<id>.yaml` | file name |
| Generated models | `types.py` at the module root | — |

Folders never change an id. A node belongs to the flow whose `flow.yaml` is in the nearest folder above it. Ids are unique
per kind; a duplicate is `E_ID_DUPLICATE` with both paths. A suffix that contradicts `kind` (`x.node.yaml` with
`kind: Inference`) is `E_KIND_PATH_MISMATCH`.

## 5. Resolution rules

### 5.1. Inference of an llm node

- `<node>.inference.yaml` next to `<node>.node.yaml` is the node's inference; the node has no `inference:` key.
- `inference: <id>` references an inference with a different name and is used only for reuse.
- Both at once → `E_SOURCE_CONFLICT`.
- Owner of a shared inference: the first node in flow order that uses it and whose id differs from the agent id. Example:
  `revise` lives in `flows/support_case/nodes/polish/` and is used by `drafts__gpt`, `drafts__claude`, `drafts__gemini`
  and the eval `reply_quality`.

### 5.2. Prompt

- No `prompt:` key → `<inference>.prompt.md` next to the inference.
- Explicit `prompt:` → a path to `.md` (relative to the inference folder, `@flow/` from the flow folder, `@root/` from
  the module root) or a function ref (level-3 prompt, e.g. `prompt: "illustrate_prompt"` → `illustrate.py`).
- Nothing resolves → `E_PROMPT_MISSING`; an explicit path while `<inference>.prompt.md` exists → `W_PROMPT_SHADOWED`.
- Prompts are never strings inside YAML.

### 5.3. Variants

Declared in the inference (`variants.<slot>` with `on`, `cases`, `default`); files are
`<inference>.variants/<slot>/<case>.md` or explicit `.md` paths; the prompt prints `{{ variants.<slot> }}`. A file with the
inference prefix that no prompt can reach → `E_ORPHAN_FILE`.

### 5.4. Includes

`{% include "fragments/brand_voice" %}` resolves from the including file, the inference folder or the module root;
`@root/` forces the root. Fragments are static text without variables. `@flow/` inside `include` is not supported yet.

### 5.5. Code references

Write the shortest form that works; the loader turns it into an absolute ref.

| Form | Resolves to | Use for |
|---|---|---|
| `<function>` | `<id>.py` next to the declaring file, loaded by file path | step code, custom checks, custom policies, level-3 prompts |
| `@root/<path>.py:<function>` | file from the module root, loaded by file path | rare explicit file refs |
| `@here.<module>:<function>` | import path from the YAML folder | — |
| `@flow.<path>:<function>` | import path from the flow folder | code shared inside one flow |
| `@<flow_id>.<path>:<function>` | import path from another flow's folder | — |
| `@root.<path>:<function>` | import path from the package root | `tools/functions.py`, `code/*.py` |
| `<package>.<module>:<function>` | as written | what `aqven refs` prints |

Errors: `E_ALIAS_UNKNOWN`, `E_ALIAS_RESERVED` (a flow named `here`, `flow` or `root`), `E_ALIAS_OUTSIDE_PACKAGE`,
`E_CODE_NOT_FOUND`, `E_CODE_REF_UNRESOLVED`.

Node code is loaded by file path (`importlib.util.spec_from_file_location`), so modules with the same name in different
node folders never clash and node folders need not be valid Python identifiers. Dotted import paths are for shared code
in `code/` and `tools/`.

## 6. Generated models

`aqven generate` writes `types.py` at the module root. Its first line is the only comment the project allows:

```
# Generated by aqven generate. DO NOT EDIT: changes are overwritten; edit the YAML and run aqven generate.
```

The file is gitignored and is not a source: it is rebuilt from the YAML. `types/` next to it holds YAML only and has no
`__init__.py`, so `import <module>.types` resolves to the generated file (a module file wins over a namespace folder in
CPython and in pyright). A `types/__init__.py` would shadow the generated file: `aqven check` reports `E_TYPES_PACKAGE`.
The module folder itself must never be on `sys.path` or `PYTHONPATH`, otherwise `types.py` shadows the standard
library module `types`: `aqven check` reports `W_TYPES_SHADOWS_STDLIB`; put the parent folder (`lumen/src`) on the path
instead or start Python with `-P`. Wheels include the file because the build backend does not read `.gitignore`;
a clean checkout has no `types.py`, so run `aqven generate` before `uv build`.

Order is fixed: registry types, inference models, tool models, code-node models.

| Source | Generated names |
|---|---|
| Type `types/**/<type>.yaml` | `<TypeId>` |
| Inference `<id>.inference.yaml` | `<Inference>In`, `<Inference>Out` (`TriageIn`, `TriageOut`) |
| Tool with `run` | `<Tool>In`, `<Tool>Out` (`SearchKbIn`, `SearchKbOut`); MCP tools have no generated shape |
| Code node | `<Flow><Node>In`, `<Flow><Node>Out`, node part = local id (`SupportCaseCaseFormOut`, `JudgePanelAggregateOut`) |

Rules for code:

- Import every model from `<module>.types` (`from lumen.types import CaseRequest`). Do not write `BaseModel` classes that
  repeat a declared shape.
- A function whose output equals a registry type returns that type (`pick` → `PanelOutcome`, `finalize` → `CaseOutcome`).
- Dynamic form fields (`FieldSpec`) reference registry types by TypeId (`type="OrderId"`, `type="DefectSymptom"`); the
  constraints come from the type. Copying `pattern`, `enum`, `maxLength`, `minimum` or `maximum` onto a registry type is
  `E_TYPE_CONSTRAINT_MISMATCH`.
- Hand-written models are acceptable only for shapes that no YAML declares: parameters of a custom policy (`with:`) and
  responses of an external API parsed inside a tool function.
- A name collision between generated models is `E_ID_DUPLICATE`; a stale or hand-edited file is `W_GENERATED_STALE`
  (this file is generated, edits are overwritten, change the YAML source). `aqven check` regenerates the file before
  checking, so it may rewrite `types.py`.

## 7. Where to put a new thing (checklist for agents)

| Task | Do |
|---|---|
| New LLM step | `flows/<flow>/nodes/<node>/<node>.node.yaml` with `node: llm`, `agent:` and `in` bindings; `<node>.inference.yaml` + `<node>.prompt.md` next to it |
| Same prompt/contract for another node | reference the existing inference with `inference: <id>`; do not copy files |
| Step inside a `parallel`/`map`/`loop`/`switch` | flat file in the top-level node's folder, listed in the parent's `body` or `cases` |
| Python for one step | `<node>.py` next to the node, `run: "<function>"` |
| Python used by several nodes, flows or evals | `code/<module>.py`, `run: "@root.code.<module>:<function>"` |
| New tool | `tools/<tool>.yaml` + function in `tools/functions.py`; nodes never configure tools, agents list them |
| New model or model settings | `agents/<agent>.yaml`; nodes only name the agent |
| Prompt text used by several prompts | `fragments/<name>.md` and `{% include "fragments/<name>" %}` |
| Prompt that depends on a value | `variants` in the inference, files in `<inference>.variants/<slot>/` |
| New value set, id format or record | `types/<category>/<type>.yaml`, then `aqven generate`; use the generated model or Literal in code instead of copying values |
| Reusable subgraph | a new flow in `flows/<flow>/`, called by a `call` node |
| Dataset or eval | `evals/<flow>/<id>.yaml`; the id is the file name, no `name:` key |
| Structural change across files (rename, move, add node) | the `flow_patch` operation, not hand edits; then `aqven check` |

## 8. Known gaps

- `include` does not accept `@flow/` yet (O20 allows it in prompt paths).
- A node or inference `out` is a list of fields and cannot reference a type, so some generated models duplicate a
  registry type (`JudgePanelPickOut` = `PanelOutcome`, `SupportCaseFinalizeOut` = `CaseOutcome`, `BallotOut` =
  `IntentBallot`, `CritiqueOut` = `Critique`, `TieBreakOut` = `JudgeVerdict`).
- Tool and step functions still restate parameter constraints inline; `aqven check` compares their schemas with `in`, so
  drift is caught, but the functions do not take the generated `In` models.
- Lookup tables keyed by enum values are typed with generated Literals: a wrong key is a type error, a missing key after a
  new enum value is found only at run time.
- Value lists that exist only in Python (marketplace intake fields in `prepare.py`) are not registry types yet.
