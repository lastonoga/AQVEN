# Wave 6 research — Concepts (9 remaining pages)

Ground truth for the 9 remaining Concepts pages (design doc §4, items 2, 3, 4, 5, 6, 7, 8, 10, 11 —
items 1 "На чём это построено" and 9 "Инженерный цикл" are already published from Wave 1). Produced by
9 parallel research passes against real code on 2026-09-22, plus one manual verification pass that
caught a wrong claim in one of the nine (noted under item 10 below).

**Citations in this file are for the plan/page authors only — never copy a `file:line` reference, an
ADR number, or an internal class name into a published page.** See `apps/site/CONVENTIONS.md`.

**The real showcase project is `examples/lumen/`** — a materialized, non-template project (not a
`.tmpl` file), already used as the example source in Waves 1–5. It has two real flows,
`support_case` and `judge_panel`, both usable for every page below.

---

## 2. Прогон переживает падение процесса (a run survives a process crash)

**What the page should say:** The whole flow run is one DBOS workflow; every node execution passes
through a durable checkpoint before the run moves on. If the process crashes or redeploys, DBOS
itself — not AQVEN's own code — finds every pending workflow in its local SQLite file on the next
launch and automatically re-enqueues it, no user action needed. The run's function then replays from
the top, but every already-recorded step just returns its cached result instead of re-running — only
the one step genuinely in flight when the process died gets redone. A `human` node's wait is the same
mechanism taken to its extreme: it blocks on a durable receive with only a 1-second floor and no
ceiling, so it can legitimately wait for weeks with the server not even running.

**Key facts:**
- Checkpoint granularity is *not* uniformly "one node": `code`/`tool` nodes get one checkpoint per
  attempt; `llm` nodes are checkpointed *finer* than one node — each model turn and each tool call
  inside it is its own separate checkpoint; pure control-flow nodes (`switch`, `narrow`, `call`) are
  **not** step-wrapped at all — no side effects to lose, so no need to checkpoint them.
  (`packages/aqven/src/aqven/engine/interpreter.py:355-368,519,632`,
  `packages/aqven/src/aqven/engine/steps.py:15-36`,
  `packages/aqven/src/aqven/engine/assembly/steps.py:26-35`,
  `packages/aqven/src/aqven/engine/registry.py:19-45`)
- Recovery is fully automatic: `EngineLifecycle.launch()` calls `DBOS.launch()`; DBOS's own internal
  recovery thread fetches every pending workflow for the local executor and re-enqueues it — confirmed
  in the installed `dbos==2.31.1` package source, not assumed.
  (`packages/aqven/src/aqven/engine/lifecycle.py:91-92`,
  `.venv/lib/python3.14/site-packages/dbos/_dbos.py:663-677`,
  `.venv/lib/python3.14/site-packages/dbos/_recovery.py:14-27`)
- The system database is a local SQLite file at `.aqven/dbos.sqlite`, not a separate service.
  (`packages/aqven/src/aqven/engine/config.py:44-53`, `packages/aqven/src/aqven/engine/protocol.py:11-12`)
- What does NOT survive: only work that happened *inside* a step's body but never returned (an
  in-flight model/tool call at the moment of a hard kill). A normal node failure (an exception during
  execution) is itself caught and turned into a checkpointed outcome, not lost — only SIGKILL/OOM/power
  loss mid-step loses that step's in-flight work.
  (`packages/aqven/src/aqven/engine/interpreter.py:345-352`)
- `HumanNodeSpec.timeout_seconds` has a 1-second floor and **no upper bound** — confirmed in the spec,
  not just in prose. `/engine/human-node/` (already published) states this correctly and remains
  accurate.
  (`packages/aqven/src/aqven/spec/nodes.py:62`, `packages/aqven/src/aqven/engine/human/waiter.py:160-175`)
- A real way to observe this: `GET /api/runs/{run_id}` reads DBOS's own workflow status; the CLI prints
  `run <run_id>` and, on a suspended human wait, prints the waiting address and exits code 3.
  (`packages/aqven/src/aqven/server/routes/runs.py:88-90`, `packages/aqven/src/aqven/console/run.py:197-213,240`)

**Real example:** the run-status query cycle (start a run, kill the process, restart, query
`/api/runs/{run_id}` again — nodes before the crash point don't re-emit events). For the human-wait
side, link to `/engine/human-node/`'s existing showcase example (`support_case`'s `lead` approval node,
`timeout_seconds: 14400`) rather than re-quoting it.

**Corrections:** none to the design doc's claims. One precision worth stating on the page: checkpoint
granularity is not "one node = one checkpoint" uniformly — finer for `llm` nodes, absent for pure
control-flow nodes.

**Cross-references:** link to `/concepts/what-this-is-built-on/` (DBOS row) instead of repeating its
fact table; link to `/engine/human-node/` for the node's own field reference and example — this page
only adds "why it can wait that long."

---

## 3. Файлы как источник правды (files as source of truth)

**Scope: layout + identity only** — NOT editing mechanics (that's item 11, a separate page).

**What the page should say:** A node is a *folder*, not a single file —
`flows/<flow_id>/nodes/<node_id>/` holds every file for that node: its step spec
(`<node_id>.node.yaml`), and for an `llm` node also its call contract (`<node_id>.inference.yaml`) and
its prompt (`<node_id>.prompt.md`) as sibling files sharing the same stem — never a prompt string
inside YAML. Identity is the file path, not a field: no spec model has an `id` key anywhere; a node's
id is its filename up to the first dot, a flow's id is its folder name. Nested/branch nodes (a parallel
branch, a loop/map body) sit *flat* in the parent node's folder, qualified by a `parent__child` id —
not one directory deeper. The one place identity survives a rename is an explicit, append-only
`renames:` list living inside `aqven.yaml` itself. There is no separate rebuildable database — the
running server just rereads the whole tree from disk on every state check.

**Key facts:**
- Correction to the design doc's own gloss: it is NOT `nodes/<node_id>.yaml` (flat file). It's
  `nodes/<node_id>/` (a directory). Get this right on the page.
- Real project's actual top-level directories: `agents/, code/, datasets/, evals/, flows/, fragments/,
  mcp/, samples/, tools/, types/` plus `aqven.yaml`, `.env`/`.env.example`. No `components/`, `models/`,
  shared `prompts/`, `context/`, or `environments/` — those appear in older internal design docs but not
  in the real project. Shared prompt *fragments* live in `fragments/*.md` (Liquid includes), not a
  standalone prompts folder.
- Names are restricted to `^[a-z][a-z0-9_]{0,62}$` (case-insensitive-filesystem collision avoidance).
  (`packages/aqven/src/aqven/spec/names.py:5`)
- The project root marker is `aqven.yaml` (`kind: Project`).
  (`packages/aqven/src/aqven/loader/layout.py:9`, `packages/aqven/src/aqven/spec/project.py:92-100`)
- The rename journal is real and populated — `examples/lumen/aqven.yaml` already has a live entry
  recording a real node rename.
- No database index exists in current code (contrary to older internal design docs describing a
  Postgres schema) — only an in-memory, per-process rebuild-from-disk. File-tree change detection uses
  `watchfiles`, publishing change events to Studio live.
- Git as AQVEN's own history mechanism (its own commit-per-edit model) has **zero matching
  implementation** — a project's history today is just whatever git history its repo happens to have.

**Real example:** the real file tree of `examples/lumen/flows/judge_panel/` (a small, complete flow —
verified via `find`), showing the directory-per-node layout and the flat nested-node placement
(`judges__deepseek` etc. sitting beside `judges.node.yaml`).

**Cross-references:** link to `/engine/inspect-project/` (the `aqven tree` how-to, which already prints
the full id→path map for this exact project) instead of repeating a listing; link to `/engine/prompts/`
for "a prompt is always a separate file," not the level 1/2/3 mechanics. Must NOT cover editing
mechanics (flow_patch/CAS/hooks) — that's item 11.

---

## 4. Agent, Inference и узел llm (three real entities behind the llm node)

**What the page should say:** One YAML node (`node: "llm"`) is actually backed by three separately
typed, separately filed entities: an **Agent** (which model, at what settings, with what
tools/instructions — "how to call"), an **Inference** (the typed in/out contract plus the prompt that
fills it — "what to ask"), and the llm **Node** itself (where this call sits in the flow, how flow data
binds into the inference's input — "when, with what"). The Node references the other two by id rather
than embedding them; neither an Agent nor an Inference is runnable alone. This split is not
theoretical: the showcase project reuses one Agent (`gemini`) across three unrelated Inferences, and
separately reuses one Inference (`revise` — one prompt, one contract) across three different Agents
(gemini/gpt/mistral) to get three independent drafts from three model families — proving Agent and
Inference vary independently. **No ADR documents this rationale and no other page describes it — this
is the one place it's written down**, so the page should be thorough.

**Key facts:**
- `AgentSpec`: model, fallback_models, settings, output (mode/strict/retries/on_refusal/on_truncated),
  instructions, tools, mcp_servers, subagents, approval, limits, capabilities — nothing about
  input/output shape or prompt text.
  (`packages/aqven/src/aqven/spec/agent.py:89-103`)
- `InferenceSpec`: in (typed input fields), out (typed output fields), prompt, variants, allowed_sets,
  examples, checks, display — nothing about which model runs it.
  (`packages/aqven/src/aqven/spec/inference.py:74-93`)
- `LlmNodeSpec`: only `agent` (required), `inference` (optional in the raw spec — auto-fills from a
  colocated `<node_id>.inference.yaml` by filename convention if omitted), and `in_` (field bindings).
  (`packages/aqven/src/aqven/spec/nodes.py:42-45`, `packages/aqven/src/aqven/loader/project.py:418-429`)
- At runtime, both are resolved by id from the compiled project and a fresh `pydantic_ai.Agent` is
  built per call, combining the Agent's model/tools/instructions with the Inference's rendered
  output_type/prompt — genuinely assembled from both, not either alone.
  (`packages/aqven/src/aqven/engine/llm/agents.py:119-171`)
- Even node-level behavior threads back through the Agent: the compiled `output_mode` (structured-output
  strategy) is resolved from the Agent, not declared on the Node.

**Real example (not the triage example — already used in full on `/engine/llm-node/`):** the
`drafts/*` reuse in `examples/lumen/flows/support_case/` — three Node files
(`drafts/gemini.node.yaml`, `drafts/gpt.node.yaml`, `drafts/mistral.node.yaml`), same `inference:
"revise"`, three different `agent:` ids, proving one prompt+contract can be asked of three models by
swapping one id per node.

**Cross-references:** link to `/engine/llm-node/` for "how do I make one" (it already fully covers the
triage example); link to `/concepts/what-this-is-built-on/` for Pydantic AI "under the hood" facts.
Must not duplicate the file-layout convention (item 3) or the ten-node-kinds overview (item 5).

---

## 5. Десять видов узлов (overview map of the 10 node kinds)

**What the page should say:** a pure map/index page, minimal new content — list all 10 kinds with a
one-line purpose each (reusing each how-to's own established framing) and link out. No new example
needed.

**Key facts:**
- Exactly 10 kinds, confirmed in three independent places in code, same order:
  `llm, code, tool, human, parallel, map, switch, loop, call, narrow`. No drift from the design doc's
  assumption.
  (`packages/aqven/src/aqven/spec/nodes.py:106-144`, `packages/aqven/src/aqven/spec/names.py:63-73`)
- **Do not use** `docs/DECISIONS.md`'s Node table row as a source — it's stale, still listing 5 rejected
  kinds (`const, seq, race, gate, try`) alongside the real 10. Use `spec/nodes.py`/`spec/names.py`
  directly.
- One genuine, code-visible grouping: three kinds (`parallel`, `map`, `loop`) declare a `body` field
  referencing child node(s) and are wired together under one dataclass in a dedicated engine package;
  the other 7 don't have this. `switch` also references other nodes (via `cases`) but is *not* grouped
  with those three in the engine. This is optional to use — phrase in reader-facing terms if used, never
  by internal class name (e.g. "three of these run other nodes as their body: parallel runs branches at
  once, map runs one body node per item, loop repeats a body pass after pass").
- One-line framing per kind, already established on each published how-to (llm = "how to call a model,"
  code = "how to write a step in Python," tool = "how to give an agent a tool," human = "how to pause
  for a person," parallel = "how to branch into parallel steps," map = "how to run a step over a
  collection," switch = "how to route by a value," loop = "how to repeat a step with a limit," call =
  "how to reuse a flow as a step," narrow = "how to narrow a dynamic value to a type").

**Cross-references:** link to all 10 `/engine/<kind>-node/` pages; link to the "Agent, Inference и узел
llm" concept page for the llm kind's internals instead of re-explaining. `/engine/index.md` already has
an informal one-paragraph enumeration of the same 10 kinds — this page can supersede it as the canonical
map.

---

## 6. Три уровня промта (three prompt levels — when to use which)

**Scope: decision criteria only** — mechanics are already fully covered by `/engine/prompts/` (Wave 2).
Do not repeat file naming, the level-detection mechanism, the `{% message %}` tag, `{% include %}`, or
the level-3 function signature — all already there.

**What the page should say:** a strict capability/guarantee ladder, not just three syntaxes. Level 1
(plain text) is enough whenever the prompt has no branching and no lists — AQVEN writes the
Inputs/Output-fields sections for you. Reach for level 2 (Liquid) the moment wording needs to change
based on an input — an optional field's presence, an enum's value, a bounded list — and you want that
logic checked at compile time. That safety net is also level 2's real ceiling: filters are entirely
disallowed, `{% if %}` can only test a field against enum/bool/nil (no numeric thresholds — the checker
tells you to derive a Bool field instead), loops can't nest, and `{% case %}` can't have a catch-all
`{% else %}` (must be exhaustive). Reach for level 3 (a Python function) only once you hit one of those
literal ceilings — numeric/threshold logic, string post-processing, a lookup table keyed by something
other than a bare enum switch — and accept the tradeoff: the checker only verifies the function's
signature and return type, not that it uses its inputs or produces anything sane.

**Key facts:**
- Level is picked automatically at compile time from what the file contains — the moment a prompt has
  any `{{ }}` interpolation or a real Liquid tag, it's level 2; otherwise level 1.
- Level 2 filters: entirely disallowed (empty allow-list) — "formatting belongs in code, not in the
  template." Level 2 tags: only `if/elsif/else, case/when, for, include, comment`, plus one AQVEN
  message tag. `{% if %}` can only compare a field to enum/bool/nil literals — no numeric comparisons.
  `{% for %}` capped at depth 1, must target a declared array field with a `maxItems` bound. `{% case
  %}` must be exhaustive over every enum value, no catch-all `else`.
- Level 3 must be synchronous; checked only for signature/return-type match, not usage or output
  sanity — most of levels 1-2's static guarantees disappear.
- In the real showcase, every level-2 prompt reaches that level for an enum-exhaustive `{% case %}`, a
  presence check on an optional attachment, or a loop over a bounded array. Exactly one prompt in the
  whole project is level 3 (`illustrate_prompt`), and notably it reaches level 3 by *choice* (an
  f-string lookup), not necessity — the same enum-keyed logic could fit a level-2 `{% case %}`, useful
  as a "level 3 isn't only for what level 2 literally can't do" caveat.

**Do not mention:** GEPA / prompt optimization as a level-3 tradeoff — `optimize` is an unimplemented
stub command; `apps/site/CONVENTIONS.md` explicitly forbids describing it even as "how it will work."

**Cross-references:** link to `/engine/prompts/` for all mechanics; link to
`/concepts/what-this-is-built-on/` for the python-liquid attribution instead of re-explaining it.

---

## 7. Пять случаев динамической формы входа/выхода (5 dynamic shape cases — overview)

**Scope: the map + the decision rule** — mechanics of case 5 only are already covered by
`/engine/dynamic-shape/` (Wave 2). **Important correction:** that how-to only ever fully documents case
5 (and briefly gestures at case 4) — it does not itself name "5 cases." The actual source of the 5-case
framework is an internal ADR's table, not the how-to page.

**The 5 cases, in reader's terms (escalation ladder, take the least dynamic case that solves the
task):**
1. Only *values* vary (IDs, codes, choice options) → an allowed-set. Structure stable.
2. Which of several *known-in-advance* structural variants → a discriminated union + switch node
   (already covered by `/engine/switch-node/`). Stable; compiler sees every variant.
3. A set of fields given by *configuration*, same-typed values → unrolled into `{key, value}` rows with
   an allowed-set on the key.
4. A static core *plus* one open-ended extension from data → static fields plus one `Dynamic` field.
   Core stable, extension varies.
5. The shape as a whole is unknown ahead of time → `Dynamic` + `schema_from` + `limits` + a later
   `narrow` step. Changes on every run; compiler sees only the limits and the narrowing point. This is
   what `/engine/dynamic-shape/` documents in full.

**Why this matters:** collapsing everything into "schema from data" loses static type-checking between
nodes, template-usage checking, a stable schema hash, and the provider's structured-output grammar
cache. Forbidding dynamism entirely means you can't express a node whose real fields depend on
run-time data at all.

**Key facts:**
- Cases 1-3 never use the `Dynamic` type at all — case 2 is fully covered by `/engine/switch-node/`.
- Case 4 is real and distinct from case 5: the showcase's `triage` node has 4 static output fields plus
  exactly one `Dynamic` field (`intake_extra`, built from a per-marketplace-channel field list) that is
  never narrowed downstream — taken as plain data by the next inference and rendered as a whole template
  slot. This is a genuinely different, verified example from `/engine/dynamic-shape/`'s own (case-5)
  walkthrough.
- AQVEN enforces opacity everywhere a `Dynamic` value might be read by field (switch condition, prompt
  template variable, typed binding) — this is what actually forces a `narrow` step or whole-value
  consumption, not a convention.
- What's still deferred to run time even after all static checks pass: the actual per-run output schema
  for a `Dynamic` field is built fresh from resolved field data at call time, not at `aqven check` or
  `aqven generate` time — only `aqven check`'s simulation pass exercises this before a real run does.

**Real example:** the `triage`/`intake_extra` case-4 example above (a genuinely different angle from
`/engine/dynamic-shape/`'s own case-5 example) — don't re-walk that how-to's YAML, just reference it by
name for case 5.

**Cross-references:** link to `/engine/dynamic-shape/` (case 5 mechanics), `/engine/narrow-node/`,
`/engine/switch-node/` (case 2), `/engine/check/` (what check does/doesn't verify for dynamic fields).
Link to the "Ten kinds of nodes" concept page for `narrow` as a node kind instead of re-listing it.

---

## 8. Что происходит при вызове модели (outcomes, retry, PII redaction)

**This is the most safety-critical page in the wave — the research found a real gap between design
intent and current code. Do not describe automatic recovery from refusal/truncation as working: it
is not wired.**

**What the page should say:** every model call resolves to one of three real, named outcomes — `ok`,
`refusal`, or `truncated` — decided *before* any JSON parsing, from the provider's own finish reason.
This exists so a cut-off answer can never be silently "repaired" into a fake complete object. There are
two genuinely automatic retry mechanisms, at different layers: (1) a transport-level retry for
network/HTTP transient failures (429/408/5xx/dropped connection), honoring the provider's `retry-after`
header, a handful of attempts within a time budget; (2) a structured-output repair retry that only
fires when the outcome was `ok` but the response failed schema validation — the model is re-prompted
with the validation errors, up to a per-agent configurable number of extra attempts. **Neither retries a
refusal or a truncation by re-sending the same prompt** — today, a refusal or truncation simply fails
the node. PII redaction is real but narrower than "everything is scrubbed": there is one small,
always-on, zero-config redactor (5 fixed patterns — email, IBAN, card number, phone, IP address) that
unconditionally redacts the raw model-output text captured into a **failed attempt's** error details —
this is what shows up in run history for a failure. A broader mechanism that can redact the full
outgoing prompt and response on the wire exists and is tested, but is **off by default** with no
project-config path yet to turn it on — do not imply it runs automatically for every call.

**Key facts:**
- `CallOutcome = Literal["ok", "refusal", "truncated"]` — a real type, the per-call classification field
  on the run-history record.
- Transport retry: real, tested — a 429 with a `retry-after` header is retried honoring that header; a
  plain 400 is never retried; retries stop at whichever of attempt-count or time budget is hit first.
- Structured-output repair retry: a real, bounded, author-facing field (`output.retries`, default 1, max
  5) — fires only on the `ok` branch. A real showcase agent overrides it to 4.
- **The gap:** the design's intended route for a refusal/truncation (bump `max_tokens` once, then
  fallback to a larger-window model, or fail/escalate) has real IR fields for it
  (`on_refusal`/`on_truncated`, default FAIL) — but **nothing in the engine code reads them**, and the
  fallback mechanism actually built uses a default that wouldn't catch those exception types anyway. So
  today a refusal or truncation fails the node, full stop.
- PII: the always-on, zero-config redaction of failed-attempt error-detail text is safe to describe as
  automatic (5 fixed patterns, verified by real tests). The broader wire/cassette redaction mechanism is
  real and tested when explicitly configured, but is not turned on anywhere in the live engine
  composition today, and the project-level YAML schema for a PII policy exists but nothing reads it.

**Real example:** the real transport-retry test (a 429 twice with `retry-after: 2`, succeeding on the
third attempt); the real showcase agent's `output.retries: 4` field; the real redaction test (an email
in a failed attempt's raw output becomes `<EMAIL>` in the stored record).

**Cross-references:** link to `/concepts/what-this-is-built-on/` instead of re-pitching "this is a layer
on Pydantic AI" — that page already states the reader-facing summary of all three behaviors; this page
goes one level deeper into mechanics and ordering. Check `/engine/llm-node/` before writing, in case it
already documents `output.retries`/`on_refusal`/`on_truncated` as reference fields — link there for the
literal field names rather than re-listing them.

---

## 10. Как найти узел, где воркфлоу свернул не туда (node_id, branch_key, iteration, item_index)

**Verification note:** one claim in the original research pass for this topic was wrong and has been
corrected here — it claimed no materialized example project exists outside the showcase template. This
is false: `examples/lumen/` is a real, already-generated project (used throughout Waves 1–5), with real
`drafts` (parallel), `record` (loop), and `vote` (map) nodes. **Use `examples/lumen/` for this page's
example**, not synthetic engine-test fixtures.

**What the page should say:** every step execution the engine runs is addressed by 4 fields —
`node_id` (always set), `branch_key`, `iteration`, `item_index` (each optional) — because a parallel
branch, a loop pass, or a map item can all run the same node more than once inside one run. Each control
construct sets exactly one of the three optional fields on its children: `parallel` sets `branch_key` to
the branch's key, `loop` sets `iteration` to the pass number (0-based) for every node in its body each
pass, `map` sets `item_index` to the item's position in the list. `switch` *also* sets `branch_key` (for
a matched case's inline node) — so `branch_key` isn't exclusively a parallel concept. The container
node's own execution (the parallel/loop/map node itself) doesn't carry the field it hands to its
children — e.g. a loop's own execution has `iteration: null`; its per-pass child executions have
`iteration: 0, 1, 2...`. Nesting composes: a step inside a loop inside a parallel branch keeps the outer
`branch_key` while `iteration` gets added. Which *retry attempt* of one execution ran is deliberately
**not** part of the address — a retried attempt is still "the same execution," addressed the same way,
with `attempt` as a separate field.

**Key facts:**
- Exact field names and types confirmed against the real pydantic model backing every run/execution
  record, and independently confirmed live by actually running the real engine code (parallel/loop/map
  executors) against minimal fixtures — not just reading the type definition.
- Real, already-published pages already use this exact model in reader-facing prose:
  `/mcp-cli/runs/` (a real captured trace example), `docs/23-studio-api.md` §6.2 (internal, not for
  citing, but confirms the field table matches), and `/studio/investigate-a-run/` (UI-level, doesn't
  define the field names — this new page is what that page's link should resolve to).
- Real showcase node ids to reuse for continuity with already-published pages: `drafts__gpt`,
  `drafts__mistral`, `drafts__gemini` (parallel, `/engine/parallel-node/`'s own example);
  `record__extract`, `record__validate` (loop, `/engine/loop-node/`'s own example); `vote__ballot` (map,
  `/engine/map-node/`'s own example).
- A rejected alternative worth knowing (don't necessarily publish, but explains the "why 4 fields not a
  string" question if the page addresses it): string-concatenated keys like `nodeId#branch` were
  considered and rejected because they'd conflate iteration 0 with the node-level (no-iteration) result.

**Real example:** reuse the already-established showcase node ids above rather than inventing new ones —
e.g. a failed step inside `drafts` would surface as
`{node_id: "drafts__mistral", branch_key: "mistral", iteration: null, item_index: null}`; a failed pass
2 of `record` as `{node_id: "record__validate", branch_key: null, iteration: 1, item_index: null}`.

**Cross-references:** link to `/concepts/engineering-loop/` (already tells the reader *why* addressing
exists, same showcase story, one level above this page). Link to `/studio/investigate-a-run/` (this page
is what that page's "same address the engine itself records" line should resolve to). Link to
`/engine/parallel-node/`, `/engine/loop-node/`, `/engine/map-node/` for what those node kinds *are* —
this page only covers how their executions are *addressed*. Link to `/mcp-cli/runs/` for querying one
execution's detail programmatically.

---

## 11. Два способа менять проект (direct file edit vs flow_patch)

**What the page should say:** AQVEN has two real, working edit paths onto the same files. **Direct
edit**: an agent or human edits a YAML/prompt/`.py` file directly with ordinary file tools — nothing on
disk stops this, even for a structural, cross-file change like a rename. Validation happens *after* the
write, via a project hook that runs the real `aqven check` command and blocks (in an agent's harness)
if the tree is now invalid — a broken file can still be saved and committed, it just can't be released.
**`flow_patch`**: a real MCP tool (and REST route) that validates and applies structural operations
atomically *before* anything touches disk, guarded by a real compare-and-swap — the caller declares the
file hash it last read; if the file changed since, the whole call is rejected with zero bytes written,
before any change happens. A retry-safe id makes replaying the same call idempotent. A structural rename
through `flow_patch` also appends a real, verified entry to the project's own rename journal in the same
transaction — a hand-edit of the same rename leaves no such entry, and any tool reading lineage by path
loses the connection between the old and new id. Direct edit for a point change (prompt text, one node's
description); `flow_patch` for a structural or cross-file change (a rename, adding/removing a node) — the
distinction matters especially for an agent, which can fire off many fast edits with no human watching
each diff, exactly the class of conflict the compare-and-swap is built to catch.

**Key facts:**
- Direct-edit validation is real and literally implemented: a project hook runs `aqven check` after
  every file write and blocks the agent with the check's real error output if the tree is now invalid —
  but this is a convention the project's own agent-harness configuration wires up, not a property of
  AQVEN itself, and nothing prevents the file from being saved/committed regardless.
- `flow_patch`'s CAS mechanics are real, not just design intent: the caller declares an expected file
  hash per file it touches; the server re-hashes immediately before writing and rejects with a typed
  conflict error if anything changed, touching zero bytes; a stale hash produces the current hash back so
  the caller can decide how to reconcile. Verified against real passing tests, including a hostile-race
  test (an outside process overwrites the file between read and write — the conflict is caught, nothing
  is silently overwritten).
- A retry-safe request id makes replaying the same call return the first result verbatim without
  re-checking or re-writing anything — verified by a real test.
- `flow_patch` is a genuine MCP tool the connecting agent is told about directly in its very first
  message from the server — the split is not something the agent has to infer.
- Nothing technically *prevents* hand-editing multiple files for what should be a structural change —
  the safety net is only the after-the-fact hook, by which point an invalid intermediate state is
  already on disk (diffable, committable, just not releasable).
- The set of structural operations `flow_patch` actually supports today is real and finite — don't
  imply it covers every kind of rename (e.g. renaming a type or a tool) if the current operation set
  doesn't yet include those; check what's real before naming examples.

**Real example:** a minimal `flow_patch` request/response pair (a `set` operation with an expected file
hash, a success, then a second call reusing the stale hash producing a real conflict response) —
consistent with what's already published in more detail on `/mcp-cli/edit-a-flow/`. A rename's real
journal entry, contrasted with a hand-edit of the same rename leaving no such entry.

**Cross-references:** must link to (not restate) `/mcp-cli/edit-a-flow/` (every operation, the full CAS
field-by-field breakdown, real request/response JSON) and `/engine/check/` (what the validation actually
checks). Link to `/mcp-cli/read-project-structure/`, which already gestures at this exact split from the
how-to side ("edit the file directly for a point change, or call flow_patch for a structural or
cross-file one") — this concept page is the natural forward-link target from that line. Link to the
"Files as source of truth" concept page (item 3) for what a project looks like on disk — don't restate
the layout here.
