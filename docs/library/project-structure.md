# AQVEN project structure

> Status: standard layout as of 2026-09-17 (owner decisions O14–O22 in
> [examples/DESIGN.md](../../examples/DESIGN.md) §1). Reference project: `examples`.
> This file is source material for the library documentation and for AI agents that edit AQVEN projects.
> How to build a flow well inside this layout — data wiring, prompts, models and output modes, scenario tests
> and check diagnostics — is [building-flows.md](building-flows.md).

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

A project is **one** Python project: one `pyproject.toml`, the module under `src/<package>`, `tests/`, `samples/` when
the example needs input files, and at most one `main.py`. There is no `app/` folder and no second package for the host.

```
<project>/                                  one pyproject, e.g. examples
  pyproject.toml                            name, dependency aqven, [tool.pytest.ini_options] aqven_project = "src/<package>"
  main.py                                   optional single host file: builds the ASGI app and runs a flow in-process
  .mcp.json                                 stdio MCP server for Claude Code: uv run aqven mcp src/<package>
  .gitignore                                .env, .aqven/, .venv/, __pycache__/, src/<package>/types.py
  CLAUDE.md, AGENTS.md                      rules for coding agents; CLAUDE.md is @AGENTS.md plus the MCP tool names
  .claude/settings.json, .claude/hooks/     PostToolUse runs aqven check --static, Stop runs the full aqven check
  tests/                                    scenario tests, offline by default
  samples/                                  sample inputs and media, when the project needs them
  src/<package>/                            the AQVEN module, everything below is described by this document
```

```
<module>/                                   Python package, e.g. examples/src/lumen
  .env                                      provider API keys, gitignored; .env.example is committed
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

`.env` and `.aqven/` sit next to `aqven.yaml`, that is, inside the module folder. Runtime state lives in `.aqven/`
(drafts, lock, transactions, blobs, the simulation cache, SQLite databases); it is never hand-edited and never
committed. A build must exclude `.aqven`, `.env` and `.env.example` from the wheel and sdist, because the build
backend does not read `.gitignore`.

`aqven new <path>` writes exactly this tree from a template; see §9.

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

## 7. Providers, models and output mode

`aqven.yaml` lists the providers the project may use; an agent names a model as `provider:model`. Every model request is
streamed, so a provider that cannot stream is rejected by `aqven check`, not at run time.

| Key of a `providers[]` entry | Meaning |
|---|---|
| `id` | the provider prefix used in `model:` (`openrouter:openai/gpt-oss-20b`) |
| `kind` | `catalog` (default), `code` or `openai_compatible` |
| `api_key` | `ref:env/NAME`; optional for a keyless provider (Ollama, vLLM, Bedrock) |
| `base_url` | required for `openai_compatible` |
| `run` | `module:function` factory, only with `kind: code` |
| `params`, `capabilities` | extra settings passed to the factory; declared modalities, `tools`, `json_schema_output` |
| `data_policy`, `routing` | PII and retention policy, OpenRouter routing (`data_collection`, `zdr`) |

**Catalog providers.** `kind: catalog` forwards `provider:model` to the Pydantic AI provider registry. A provider is
installed as an extra: `uv add "aqven[groq]"`. A missing extra is `E_PROVIDER_EXTRA_MISSING` with that exact command in
the hint; a provider that cannot stream is `E_PROVIDER_NO_STREAMING` (Cohere in pydantic-ai-slim 2.43.0 has no
`request_stream`). `openai:` goes to the OpenAI Responses API; `openai-chat:` is chat completions.

**Custom providers.** Three ways, in precedence order project > installed package > built-in catalog:

| Way | How |
|---|---|
| YAML only | `kind: openai_compatible` with `base_url` and an optional `api_key`; builds an `OpenAIChatModel` over the AQVEN `httpx2` client with retries off |
| Project code | `kind: code` with `run: "@root.code.<module>:<function>"`; the function is `def build(model_name: str, context: ProviderContext) -> Model` |
| Installed package | an entry point in the group `aqven.providers`, name = provider id, pointing at the same kind of factory |

`ProviderContext` carries the resolved key, `base_url`, an `httpx2.AsyncClient` to use, the `params` from `aqven.yaml`
and the model settings. The returned object is a plain `pydantic_ai.models.Model`, so a custom provider goes through the
same guarantee chain as a catalog one (outcome gate, PII redaction, cassettes, budget, backoff). `aqven check` resolves
the factory and reports `E_PROVIDER_FACTORY_INVALID` (missing `run`, unresolvable ref, wrong signature, missing
`base_url`) and `E_PROVIDER_ID_RESERVED` (an id that shadows a built-in). Adapter authors test against the conformance
kit: `from aqven.testing import AdapterCase, check_adapter` runs text streaming, structured output per mode, usage,
clean cancellation and exactly one request per failed call.

**Output mode.** An agent declares `output.mode: auto | tool | native | prompted` (default `auto`).

| Mode | What the model is asked to do |
|---|---|
| `tool` | call an output tool with the declared schema |
| `native` | use the provider's native structured-output support |
| `prompted` | answer with JSON described in the instructions |
| `auto` | resolved once at compile time: a table of known models shipped inside aqven first, then the Pydantic AI model profile; mixed fallback models resolve to `prompted` |

`auto` is deterministic. There is no environment flag and no automatic switch at run time. The resolved mode, where it
came from and why are visible in `aqven tree`, in the compiled IR and over the Studio API; `aqven check` reports
`W_OUTPUT_MODE_RESOLVED` when `auto` differs from the profile default, and `E_OUTPUT_MODE_UNSUPPORTED` when an explicit
mode is impossible for that model. `output.strict` still applies to `tool` and `native` only. A structured-output
failure at run time carries a code and a fix hint: `MODEL_NO_STRUCTURED_OUTPUT`, `MODEL_INVALID_JSON`,
`MODEL_SCHEMA_MISMATCH`, `MODEL_FEATURE_UNSUPPORTED`, `MODEL_RETRIES_EXHAUSTED`, shown in run events, the CLI, logs, the
Studio API and MCP. `aqven models check [TARGET] [--project PATH] [--live]` prints what each mode would do for an agent
or a `provider:model`, and with `--live` sends one tiny request per mode.

## 8. Secrets: the project `.env`

Provider API keys live in `<module>/.env`, next to `aqven.yaml`. The file is gitignored; `.env.example` is committed
with the variable names and no values.

- A process environment variable wins over the `.env` entry of the same name; the resolved source is reported as
  `environment` or `dotenv`. There is no SQLite storage of keys.
- `api_key: "ref:env/NAME"` in `aqven.yaml` names the variable; without it the provider's default variable is used
  (`OPENROUTER_API_KEY`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY` and so on).
- The API never returns a secret value, only a mask; a key never reaches DBOS step inputs and outputs, run events, logs
  or cassettes.
- Studio chat agents cannot read or edit `.env` files. Claude uses deny rules, a `PreToolUse` hook and a permission
  callback. Codex uses a project-scoped filesystem profile that denies `.env` and `.aqven/server.json`. Both receive
  a stripped process environment without provider keys.

Studio Settings → Chat agent selects Claude Code or Codex for new threads in this project. Sign in to the selected
CLI first (`claude /login` or `codex login`); the app does not store either login. The chat panel lists all project
threads, including those made with the other agent. Select an existing thread to continue its original agent, or
choose **New thread** to start a separate conversation with the currently selected agent. Both agents see the same
project files and AQVEN MCP tools, but a new thread does not inherit another thread's messages.

## 9. Commands and the runtime environment

| Command | Does |
|---|---|
| `aqven new <path> [--template minimal\|showcase] [--package NAME]` | writes a project from a template, runs `uv sync`, then `aqven generate` |
| `aqven dev [PATH]` (alias `aqven studio`) | starts the server, watches files and opens Studio in the browser |
| `aqven serve [PATH]` | the same server without a browser: Studio API, engine and MCP |
| `aqven check [PATH] [--static] [--simulation-only] [--no-cache]` | static checks, then a simulated run of every flow |
| `aqven generate`, `aqven tree`, `aqven refs` | write `types.py`, print the flow tree with resolved modes, print code refs |
| `aqven run <flow>`, `aqven models check`, `aqven prompt preview <flow>.<node>` | run a flow, probe models, print the exact request a node will send |
| `aqven mcp [PATH]` | stdio MCP bridge; starts a headless server if none is running |

`aqven check` runs in two stages. The static stage checks references, types, prompts, code signatures, provider extras
and output modes. The simulated stage then runs every flow end to end with values generated from the schemas and
simulated model answers — no network, no tokens, `ALLOW_MODEL_REQUESTS=False` — and reports `E_SIM_NODE_FAILED`,
`E_SIM_PROMPT_RENDER`, `E_SIM_OUTPUT_INVALID`, `E_SIM_RUN_FAILED` and `W_SIM_NODE_UNREACHED`. Its results are cached per
flow in `.aqven/cache/simulation.json`, keyed by the flow hash, a digest of every `.py` file in the project and the
installed aqven version; `--no-cache` ignores the cache.

Runtime settings, in precedence order explicit argument > process environment or `.env` > default:

| Variable | Controls | Default |
|---|---|---|
| `AQVEN_STUDIO` | serve the Studio SPA | on for `dev`, off for `serve` |
| `AQVEN_HOST` | bind address | `127.0.0.1` |
| `AQVEN_PORT` | port | `5180`, next free when taken |
| `AQVEN_OPEN_BROWSER` | open the browser after the server is ready | on for `dev` |

## 10. AQVEN as a library

The engine is a library first; Studio is one client of it. A host project chooses how much of it to use.

| Use | API |
|---|---|
| Run a flow in-process | `Project.load(<module>)`, `project.flow_typed(flow_id, In, Out)`, `await flow.run(input, RunOptions(...))` |
| Mount the API inside an existing ASGI app | `create_local_app(<module>, LocalAppOptions(access=...))`, then `host.mount("/aqven", app)` under `local_app_lifespan(app)` |
| Pluggable auth | `LocalAppOptions.access` takes any `AppAccess`; `LocalTokenAccess` is the bundled bearer-token implementation |
| Standalone MCP server | `create_mcp_server(<module>)`, or `aqven mcp` over stdio, or `/mcp/` on the running server |
| Any HTTP client | OpenAPI at `/api/openapi.json`, run events as SSE at `/api/runs/{run_id}/events`; the event registry is `/api/schemas/events` |
| Any MCP client | the same operations as tools over streamable HTTP or stdio |
| Scenario tests | the bundled pytest plugin: the `aqven_engine` fixture, `FixedModels`, cassettes, `RunOptions(outputs=(node_output(...),))` to force a branch |

Everything public is importable from the `aqven` package root (`from aqven import Project, RunOptions, create_local_app`).
`examples/main.py` shows all three shapes in one file: an in-process `handle_case`, `host_application()` that
mounts the app under `/aqven`, and `serve()` that runs it with uvicorn.

## 11. Where to put a new thing (checklist for agents)

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

## 12. Known gaps

- `include` does not accept `@flow/` yet (O20 allows it in prompt paths).
- A node or inference `out` is a list of fields and cannot reference a type, so some generated models duplicate a
  registry type (`JudgePanelPickOut` = `PanelOutcome`, `SupportCaseFinalizeOut` = `CaseOutcome`, `BallotOut` =
  `IntentBallot`, `CritiqueOut` = `Critique`, `TieBreakOut` = `JudgeVerdict`).
- Tool and step functions still restate parameter constraints inline; `aqven check` compares their schemas with `in`, so
  drift is caught, but the functions do not take the generated `In` models.
- Lookup tables keyed by enum values are typed with generated Literals: a wrong key is a type error, a missing key after a
  new enum value is found only at run time.
- Value lists that exist only in Python (marketplace intake fields in `prepare.py`) are not registry types yet.
