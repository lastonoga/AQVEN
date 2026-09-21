# AQVEN Docs IA — Wave 6 ("Концепции") Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fill the remaining 9 Concepts pages (`apps/site/src/content/docs/concepts/`) — design doc §4
items 2, 3, 4, 5, 6, 7, 8, 10, 11. Items 1 ("На чём это построено") and 9 ("Инженерный цикл") are already
published from Wave 1 and are not touched by this plan.

**This is the last content wave.** After this plan merges, the only remaining work on the design doc's
scope is the cross-wave example-simplification pass (§7) — a separate pass over the whole site, not part
of this plan.

**Architecture:** Same site as Waves 1–5. Sidebar's "Concepts" group already exists with 2 entries; this
plan appends 9 more. Ground truth: `docs/research/site-ia-concepts-wave6.md` (committed, 9 sections,
one per page) — **read the exact section for each task before writing that page**. Each research section
already lists what to cover, what NOT to repeat, and which already-published pages to link to — this
plan quotes those instructions verbatim per task rather than re-summarizing them.

**Tech Stack:** Astro 7 + Starlight 0.42.1. Verification: `pnpm --filter @aqven/site check` and
`pnpm --filter @aqven/site build` (Node ≥24.21.0, nvm — `export NVM_DIR="$HOME/.nvm" && source
"$NVM_DIR/nvm.sh" && nvm use 24.21.0` in every fresh shell).

---

## Before any task: two findings from research that must not be lost

**Item 8 ("Что происходит при вызове модели") — a real gap between design and code.** The design doc
assumed a model refusal or a truncated response automatically recovers (retry with more room, or fall
back to another model). The research (docs/research/site-ia-concepts-wave6.md §8) found this is **not
true of the current engine**: the IR carries `on_refusal`/`on_truncated` fields for exactly this, but
nothing in `packages/aqven/src/aqven/engine/` reads them, and the fallback mechanism that IS built
doesn't catch those exception types either. **The page must describe current behavior — a refusal or a
truncation fails the node, full stop — not the designed-but-unbuilt recovery route.** Only two things are
genuinely automatic and safe to describe as such: transport-level retry (network/HTTP transient
failures) and structured-output repair retry (schema-validation failures on an `ok` outcome only).

**Item 10 ("Как найти узел") — a wrong claim in the research to ignore.** One of the nine research
passes claimed no materialized example project exists outside a template, and proposed using synthetic
engine-test-fixture data instead. **This claim is wrong and has already been corrected in the research
doc** (docs/research/site-ia-concepts-wave6.md §10, "Verification note"): `examples/lumen/` is a real,
already-generated project, used throughout Waves 1–5, with real `drafts` (parallel), `record` (loop),
and `vote` (map) nodes. **Use `examples/lumen/` for this page's example, the same showcase node ids
already established on `/engine/parallel-node/`, `/engine/loop-node/`, `/engine/map-node/`** — do not use
synthetic fixture data.

---

## Process notes carried forward from Waves 1–5

- **Re-verify against live code, not just the research file.** The research file is current as of
  2026-09-22 — other engine work may have moved forward since. Before writing any page, spot-check its
  key claims against the actual files/line ranges cited in the research doc.
- **If verifying an example with `aqven new --template showcase`**, confirm the scaffold's `.venv` is
  actually linked to the local worktree code, not a published PyPI wheel (check
  `.venv/lib/python*/site-packages/aqven-*.dist-info/direct_url.json`, or just run `uv run` from the
  worktree/repo root directly instead of the scaffold's own separately-synced environment) — a Wave 4
  implementer found scaffold `uv sync` can silently pull the published package.
- **The generated reference may drift mid-wave.** Phase 3 regenerates it before the final build, same as
  every prior wave.
- **Keep pages small — do not repeat already-published content.** Each task below quotes its research
  section's "Cross-references" and "must NOT repeat" instructions directly. Follow them exactly; do not
  re-explain mechanics that another page already owns.
- **No internal citations, ADR references, file:line notes, or internal class/module names in published
  text** — verification sources (this plan, the research file, code) are for the author, not the reader.
  See `apps/site/CONVENTIONS.md`.

---

## Phase 0: Sidebar wiring

### Task 0.1: Wire all 9 new Concepts slugs into the sidebar

**Files:** Modify: `apps/site/astro.config.mjs` (the `"Concepts"` group)

- [ ] Find the current `"Concepts"` group:
  ```js
  {
    label: "Concepts",
    items: [
      { slug: "concepts/what-this-is-built-on" },
      { slug: "concepts/engineering-loop" },
    ],
  },
  ```
- [ ] Replace with (order matches design doc §4's Концепции list — items 1 and 9 stay where they are,
  the 9 new ones inserted in their designed order):
  ```js
  {
    label: "Concepts",
    items: [
      { slug: "concepts/what-this-is-built-on" },
      { slug: "concepts/run-survives-a-crash" },
      { slug: "concepts/files-as-source-of-truth" },
      { slug: "concepts/agent-inference-and-the-llm-node" },
      { slug: "concepts/ten-kinds-of-nodes" },
      { slug: "concepts/three-prompt-levels" },
      { slug: "concepts/five-dynamic-shape-cases" },
      { slug: "concepts/what-happens-when-a-model-is-called" },
      { slug: "concepts/engineering-loop" },
      { slug: "concepts/finding-the-node-that-went-wrong" },
      { slug: "concepts/two-ways-to-change-a-project" },
    ],
  },
  ```
  (Note: `engineering-loop` — design doc item 9 — sits between items 8 and 10 per the design doc's own
  numbering; this is intentional, not a mistake to fix.)
- [ ] Run `pnpm --filter @aqven/site check` (missing-file errors for the 9 new slugs are expected and
  fine until Phases 1–2 create them).
- [ ] Commit:
  ```bash
  git add apps/site/astro.config.mjs
  git commit -m "docs: wire up the 9 remaining Concepts sidebar slugs"
  ```

**Slugs fixed by this task — use these exact filenames in every later task:**
| Design doc item | Slug | File |
|---|---|---|
| 2 | `concepts/run-survives-a-crash` | `apps/site/src/content/docs/concepts/run-survives-a-crash.md` |
| 3 | `concepts/files-as-source-of-truth` | `apps/site/src/content/docs/concepts/files-as-source-of-truth.md` |
| 4 | `concepts/agent-inference-and-the-llm-node` | `apps/site/src/content/docs/concepts/agent-inference-and-the-llm-node.md` |
| 5 | `concepts/ten-kinds-of-nodes` | `apps/site/src/content/docs/concepts/ten-kinds-of-nodes.md` |
| 6 | `concepts/three-prompt-levels` | `apps/site/src/content/docs/concepts/three-prompt-levels.md` |
| 7 | `concepts/five-dynamic-shape-cases` | `apps/site/src/content/docs/concepts/five-dynamic-shape-cases.md` |
| 8 | `concepts/what-happens-when-a-model-is-called` | `apps/site/src/content/docs/concepts/what-happens-when-a-model-is-called.md` |
| 10 | `concepts/finding-the-node-that-went-wrong` | `apps/site/src/content/docs/concepts/finding-the-node-that-went-wrong.md` |
| 11 | `concepts/two-ways-to-change-a-project` | `apps/site/src/content/docs/concepts/two-ways-to-change-a-project.md` |

---

## Phase 1: Foundational concepts (cited by most of the others)

These three are referenced by several of Phase 2's pages, so write them first.

### Task 1.1: `concepts/files-as-source-of-truth.md`

**Files:** Create: `apps/site/src/content/docs/concepts/files-as-source-of-truth.md`

Follow the Concept template from `apps/site/CONVENTIONS.md`: H1 (statement/question) / `## In short`
(2-3 sentences, self-sufficient for partial retrieval) / content sections / mandatory `## How this
shapes what you do` / `## See also`.

- [ ] Frontmatter: `title: Files as source of truth`, one-sentence `description`.
- [ ] Ground in `docs/research/site-ia-concepts-wave6.md` §3 in full. **Scope: layout + identity only —
  do NOT cover editing mechanics** (direct edit vs `flow_patch`/CAS/hooks/drafts) — that's Task 2.6
  (item 11), a separate page.
- [ ] Cover: a node is a *folder* (`flows/<flow_id>/nodes/<node_id>/`), not a single file — correct the
  design doc's own one-line gloss on this point, per the research section's "Corrections" field. Cover
  identity-is-the-path (no `id` field anywhere in any spec model), nested/branch nodes sitting flat in
  the parent's folder with a `parent__child` qualified id, the real top-level directories that actually
  exist (and the ones that don't, per the research section), the append-only `renames:` journal inside
  `aqven.yaml`, and that there is no separate rebuildable database — the server rereads the tree from
  disk.
- [ ] Re-verify live before writing: confirm `examples/lumen/flows/judge_panel/`'s file tree still
  matches the research section's captured `find` output, and that `examples/lumen/aqven.yaml` still has
  a `renames:` entry.
- [ ] Real example: the `examples/lumen/flows/judge_panel/` file tree from the research section (already
  verified there) — a small, complete flow showing directory-per-node layout and flat nested placement.
- [ ] Cross-references (from the research section, quote directly — link to, do not repeat): "link to
  `apps/site/src/content/docs/engine/inspect-project.md` (the `aqven tree` how-to, which already prints
  the full real id→path map for this exact project — this concept page should point there instead of
  repeating the listing) and `apps/site/src/content/docs/engine/prompts.md` (three prompt levels — this
  page should say 'prompt is always a separate file' and defer the level-1/2/3 mechanics there)." Must
  explicitly NOT cover, and instead forward-reference, item 11's page for editing mechanics. Must also
  avoid re-explaining "what AQVEN is built on" — link to `/concepts/what-this-is-built-on/` instead.
- [ ] Run `pnpm --filter @aqven/site check`, commit:
  `git commit -m "docs: add concepts/files-as-source-of-truth"`.

### Task 1.2: `concepts/agent-inference-and-the-llm-node.md`

**Files:** Create: `apps/site/src/content/docs/concepts/agent-inference-and-the-llm-node.md`

- [ ] Frontmatter: `title: Agent, Inference, and the llm node`, one-sentence `description`.
- [ ] Ground in `docs/research/site-ia-concepts-wave6.md` §4 in full. This page is, per the design doc's
  own note (confirmed by research), **the only place this information is written down anywhere** — no
  ADR documents it either. Be thorough.
- [ ] Cover: the three entities (Agent = "how to call," Inference = "what to ask," Node = "when/with
  what"), that the Node references the other two by id rather than embedding them, that neither Agent
  nor Inference is runnable alone, and that they vary independently (proven by the showcase's two
  reuse directions — one Agent across three Inferences, one Inference across three Agents).
- [ ] Re-verify live before writing: confirm `examples/lumen/flows/support_case/nodes/drafts/*.node.yaml`
  still show the `agent`/`inference` pairing described in the research section, and that
  `examples/lumen/agents/gemini.yaml` and `agents/gpt.yaml` still exist with the cited settings.
- [ ] Real example: the `drafts/*` reuse example from the research section (three Node files, same
  `inference: "revise"`, three different `agent:` ids) — the research section explicitly says NOT to
  reuse the triage example, since `/engine/llm-node/` already covers that one in full.
- [ ] Cross-references (quote directly): "Must link to (not repeat): `apps/site/src/content/docs/engine/
  llm-node.md` for the how-to of creating an llm node... the concept page should send readers there for
  'how do I make one' and instead answer 'why are there three files and how do they fit together at
  runtime'. Must link to `apps/site/src/content/docs/concepts/what-this-is-built-on.md` for the Pydantic
  AI 'Under the hood' facts... rather than re-explaining what Pydantic AI does. Should NOT duplicate: the
  file-layout/colocation-by-filename convention (that's Task 1.1's page); the ten node kinds overview
  (Task 1.3's page)."
- [ ] Run `pnpm --filter @aqven/site check`, commit:
  `git commit -m "docs: add concepts/agent-inference-and-the-llm-node"`.

### Task 1.3: `concepts/ten-kinds-of-nodes.md`

**Files:** Create: `apps/site/src/content/docs/concepts/ten-kinds-of-nodes.md`

- [ ] Frontmatter: `title: Ten kinds of nodes`, one-sentence `description`.
- [ ] Ground in `docs/research/site-ia-concepts-wave6.md` §5. This is a pure map/index page — minimal
  new content, no new example needed per the research section.
- [ ] Re-verify live before writing: confirm the Node discriminated union in
  `packages/aqven/src/aqven/spec/nodes.py` still lists exactly these 10, in this order: `llm, code,
  tool, human, parallel, map, switch, loop, call, narrow`. **Do not use `docs/DECISIONS.md`'s Node table
  as a source — it is stale** (still lists 5 rejected kinds alongside the real 10), per the research
  section.
- [ ] List all 10 with a one-line purpose each, reusing each kind's established framing (quoted in full
  in the research section §5, under "Established one-line framing per kind") — read each
  `apps/site/src/content/docs/engine/<kind>-node.md` page's own opening to confirm the framing hasn't
  drifted since Wave 2.
- [ ] Optional grouping (per the research section, a judgment call, not required): three kinds
  (`parallel`, `map`, `loop`) run other nodes as their body — if used, phrase in reader's own words
  ("three of these run other nodes as their body: parallel runs branches at once, map runs one body
  node per item, loop repeats a body pass after pass"), never by internal class/module name.
- [ ] Cross-references: link out to all 10 `/engine/<kind>-node/` pages; link to
  `/concepts/agent-inference-and-the-llm-node/` (Task 1.2) for the llm kind's internals instead of
  re-explaining. `apps/site/src/content/docs/engine/index.md` already has an informal one-paragraph
  enumeration of the same 10 kinds — this page supersedes it as the canonical map (leave `engine/
  index.md` itself unmodified, just be aware the new page duplicates its function more precisely).
- [ ] Run `pnpm --filter @aqven/site check`, commit:
  `git commit -m "docs: add concepts/ten-kinds-of-nodes"`.

---

## Phase 2: Remaining 6 concept pages

### Task 2.1: `concepts/run-survives-a-crash.md`

**Files:** Create: `apps/site/src/content/docs/concepts/run-survives-a-crash.md`

- [ ] Frontmatter: `title: A run survives a process crash`, one-sentence `description`.
- [ ] Ground in `docs/research/site-ia-concepts-wave6.md` §2 in full.
- [ ] Cover: the whole flow run is one durable workflow; checkpoint granularity is NOT uniformly "one
  node" (finer for `llm` nodes — each model turn and tool call is its own checkpoint; absent for pure
  control-flow nodes with no side effects to lose); recovery on restart is fully automatic, no user
  action; what does and doesn't survive a hard crash (only in-flight work inside a step that never
  returned is lost — a normal node failure is itself checkpointed as data, not lost); the human node's
  wait has a 1-second floor and no ceiling, confirmed at the spec level.
- [ ] Re-verify live before writing: confirm `packages/aqven/src/aqven/spec/nodes.py`'s
  `HumanNodeSpec.timeout_seconds` still has no upper bound, and that
  `apps/site/src/content/docs/engine/human-node.md` still states the wait-duration fact accurately (the
  research section already confirmed this as of 2026-09-22 — just re-check nothing changed).
- [ ] Real example: the run-status query cycle from the research section (start a run, kill the process,
  restart, query run status again — nodes before the crash point don't re-emit events). For the
  human-wait side, link to `/engine/human-node/`'s existing example rather than re-quoting it.
- [ ] Cross-references: "link to `/concepts/what-this-is-built-on/` (DBOS row) instead of repeating its
  fact table; link to `/engine/human-node/` for the node's own field reference and example — this page
  only adds 'why it can wait that long.'"
- [ ] Run `pnpm --filter @aqven/site check`, commit:
  `git commit -m "docs: add concepts/run-survives-a-crash"`.

### Task 2.2: `concepts/three-prompt-levels.md`

**Files:** Create: `apps/site/src/content/docs/concepts/three-prompt-levels.md`

- [ ] Frontmatter: `title: Three prompt levels`, one-sentence `description`.
- [ ] **Read `apps/site/src/content/docs/engine/prompts.md` first.** Ground in
  `docs/research/site-ia-concepts-wave6.md` §6. Scope: decision criteria only (when to use which) — do
  NOT repeat prompts.md's mechanics (file naming, the level-detection mechanism, the `{% message %}`
  tag, `{% include %}`, the level-3 function signature — all already covered there).
- [ ] Cover the capability/guarantee ladder from the research section: level 1 is enough with no
  branching/lists; level 2's real ceiling (filters entirely disallowed, `{% if %}` only tests
  enum/bool/nil — no numeric thresholds, loops capped at depth 1 targeting a bounded array, `{% case %}`
  must be exhaustive with no catch-all `else`); level 3's tradeoff (checker only verifies signature/
  return type, not usage or output sanity).
- [ ] **Do not mention GEPA / prompt optimization** as a level-3 tradeoff — `optimize` is an
  unimplemented stub command; `apps/site/CONVENTIONS.md` forbids describing it even as "how it will
  work." (The research section flags this explicitly — it was a live risk in the research, not just a
  hypothetical caution.)
- [ ] Re-verify live before writing: skim `packages/aqven/src/aqven/check/conditions.py` and
  `packages/aqven/src/aqven/check/prompts.py` to confirm the level-2 restrictions (no filters, no
  numeric `{% if %}`, exhaustive `{% case %}`) still match the research section.
- [ ] Real example: the level 1→2 escalation via optional attachments in `triage.prompt.md`; the level-2
  ceiling illustrated by the checker's own numeric-literal rejection; the level-3 showcase example
  (`illustrate_prompt`) referenced (not re-quoted — prompts.md already quotes it in full), noting it
  reaches level 3 by choice, not necessity.
- [ ] Cross-references: "Must link to (not repeat): `apps/site/src/content/docs/engine/prompts.md` for
  all mechanics... Must link to `apps/site/src/content/docs/concepts/what-this-is-built-on.md` for the
  python-liquid attribution... instead of re-explaining what library renders level 2." Should link to
  `/engine/llm-node/` and `/engine/check/`. Must NOT cover: node-output guarantees/outcomes (Task 2.4's
  page), dynamic input/output shape (Task 2.3's page), files-as-source-of-truth mechanics (Task 1.1's
  page).
- [ ] Run `pnpm --filter @aqven/site check`, commit:
  `git commit -m "docs: add concepts/three-prompt-levels"`.

### Task 2.3: `concepts/five-dynamic-shape-cases.md`

**Files:** Create: `apps/site/src/content/docs/concepts/five-dynamic-shape-cases.md`

- [ ] Frontmatter: `title: Five cases of dynamic input and output shape`, one-sentence `description`.
- [ ] **Read `apps/site/src/content/docs/engine/dynamic-shape.md` first.** Ground in
  `docs/research/site-ia-concepts-wave6.md` §7. **Important:** that how-to only fully documents case 5
  (and briefly gestures at case 4) — it does not itself enumerate "5 cases." This concept page is the
  map the how-to doesn't provide.
- [ ] Cover the 5-case escalation ladder from the research section (allowed-set → discriminated
  union+switch → unrolled `{key,value}` rows → static core+one Dynamic field → whole shape unknown) and
  the choosing rule: take the least dynamic case that solves the task, because each step up trades away
  a static guarantee.
- [ ] Cover why this matters: what's lost by collapsing into "schema from data" (static type-checking
  between nodes, template-usage checking, a stable schema hash, the provider's grammar cache) vs. what's
  lost by forbidding dynamism entirely.
- [ ] Re-verify live before writing: confirm `examples/lumen/flows/support_case/nodes/triage/
  triage.inference.yaml` still has the 4 static fields + one Dynamic `intake_extra` field described in
  the research section, and that it's still never passed through a `narrow` node.
- [ ] Real example: the `triage`/`intake_extra` case-4 example from the research section (a genuinely
  different angle from dynamic-shape.md's own case-5 walkthrough) — reference case 5 by name (the
  existing case_form/extract example), don't re-walk its YAML.
- [ ] Cross-references: "link to `apps/site/src/content/docs/engine/dynamic-shape.md` (case 5
  mechanics)... `apps/site/src/content/docs/engine/narrow-node.md`... `apps/site/src/content/docs/engine/
  switch-node.md` (case 2's mechanism)... `apps/site/src/content/docs/engine/check.md`... Link to the
  sibling Concepts item 'Десять видов узлов' [Task 1.3's page] for `narrow` as a node kind instead of
  listing node kinds here." Do NOT repeat any FieldSpec field list, DynamicLimits key list, YAML syntax,
  or the narrow node's own field grammar.
- [ ] Run `pnpm --filter @aqven/site check`, commit:
  `git commit -m "docs: add concepts/five-dynamic-shape-cases"`.

### Task 2.4: `concepts/what-happens-when-a-model-is-called.md`

**Files:** Create: `apps/site/src/content/docs/concepts/what-happens-when-a-model-is-called.md`

**This is the most safety-critical page in the wave.** Re-read the "Before any task" section at the top
of this plan before starting.

- [ ] Frontmatter: `title: What happens when a model is called`, one-sentence `description`.
- [ ] Ground in `docs/research/site-ia-concepts-wave6.md` §8 in full.
- [ ] Cover the three real outcomes (`ok`/`refusal`/`truncated`), decided before parsing from the
  provider's finish reason — so a cut-off answer can never be silently "repaired" into a fake complete
  object.
- [ ] Cover the two genuinely automatic retry mechanisms and their layers: transport-level retry
  (network/HTTP transient failures, honors `retry-after`) and structured-output repair retry (schema
  validation failures on the `ok` outcome only, a bounded per-agent setting). **State explicitly that
  neither retries a refusal or truncation by re-sending the same prompt — today, a refusal or truncation
  fails the node, full stop.** Do not describe an automatic fallback/recovery route for refusal or
  truncation — it is not wired in the current engine (see "Before any task" above).
- [ ] Cover PII redaction precisely scoped, per the research section: the always-on, zero-config
  redaction of a **failed attempt's** raw output text (5 fixed patterns: email, IBAN, card number,
  phone, IP address) is safe to describe as automatic. The broader wire/cassette redaction mechanism is
  real and tested but is **off by default** with no project-config path to turn it on — do not imply it
  runs for every call.
- [ ] Before writing, check whether `apps/site/src/content/docs/engine/llm-node.md` already documents
  `output.retries`/`on_refusal`/`on_truncated` as reference fields (an open question the research
  section flagged as unresolved) — if it does, link there for the literal field names instead of
  re-listing them; if it doesn't, name the fields plainly in prose without inventing a page to link to.
- [ ] Re-verify live before writing: confirm `packages/aqven/src/aqven/runtime/vocabulary.py`'s
  `CallOutcome` still has exactly these 3 values, and grep
  `packages/aqven/src/aqven/engine/` for `on_refusal`/`on_truncated` to confirm they are still never
  read anywhere (the gap this page must describe accurately) — if this has changed since the research
  pass, the page's refusal/truncated section needs to change accordingly; report this explicitly if
  found.
- [ ] Real example: the real transport-retry test scenario (a 429 with `retry-after: 2`, retried,
  succeeding on the third attempt); the real showcase agent's `output.retries: 4` override
  (`examples/lumen/agents/gpt.yaml` — re-verify this file still has this value); the real redaction
  example (an email in a failed attempt's raw output becomes `<EMAIL>` in the stored record).
- [ ] Cross-references: "link to `/concepts/what-this-is-built-on/` instead of re-pitching 'this is a
  layer on Pydantic AI'... this page goes one level deeper into mechanics and ordering."
- [ ] Run `pnpm --filter @aqven/site check`, commit:
  `git commit -m "docs: add concepts/what-happens-when-a-model-is-called"`.

### Task 2.5: `concepts/finding-the-node-that-went-wrong.md`

**Files:** Create: `apps/site/src/content/docs/concepts/finding-the-node-that-went-wrong.md`

**Re-read the "Before any task" section's item 10 note before starting — use `examples/lumen/`, not
synthetic fixture data.**

- [ ] Frontmatter: `title: How to find the node where a workflow went wrong`, one-sentence
  `description`.
- [ ] Ground in `docs/research/site-ia-concepts-wave6.md` §10 in full (including its "Verification
  note").
- [ ] Cover the 4-field execution address (`node_id`, `branch_key`, `iteration`, `item_index`) and why
  it exists — the same node can run more than once inside one run (a parallel branch, a loop pass, a
  map item). Cover what each control construct sets: `parallel` sets `branch_key`; `loop` sets
  `iteration` (0-based, per pass); `map` sets `item_index`; `switch` ALSO sets `branch_key` (for a
  matched case's inline node) — state explicitly that `branch_key` is not exclusive to `parallel`. Cover
  that a container node's own execution doesn't carry the field it hands to its children (a loop's own
  execution has `iteration: null`), that nesting composes (a step inside a loop inside a parallel branch
  carries both), and that `attempt` (which retry) is deliberately NOT part of the address.
- [ ] Re-verify live before writing: confirm `examples/lumen/flows/support_case/nodes/drafts/`,
  `nodes/record/`, and `nodes/vote/` still have the node ids the research section cites
  (`drafts__gpt`/`drafts__mistral`/`drafts__gemini`, `record__extract`/`record__validate`,
  `vote__ballot`).
- [ ] Real example: reuse the already-established showcase node ids from `/engine/parallel-node/`,
  `/engine/loop-node/`, `/engine/map-node/` — e.g. a failed step inside `drafts` surfaces as
  `{node_id: "drafts__mistral", branch_key: "mistral", iteration: null, item_index: null}`; a failed
  pass 2 of `record` as `{node_id: "record__validate", branch_key: null, iteration: 1, item_index:
  null}`. **Do not invent new flow/node names and do not use synthetic engine-test-fixture data** — see
  the "Before any task" note.
- [ ] Cross-references: "link to `/concepts/engineering-loop/` (already tells the reader why addressing
  exists, same showcase story, one level above this page). Link to `/studio/investigate-a-run/` (this
  page is what that page's 'same address the engine itself records' line should resolve to). Link to
  `/engine/parallel-node/`, `/engine/loop-node/`, `/engine/map-node/` for what those node kinds *are* —
  this page only covers how their executions are *addressed*. Link to `/mcp-cli/runs/` for querying one
  execution's detail programmatically."
- [ ] Run `pnpm --filter @aqven/site check`, commit:
  `git commit -m "docs: add concepts/finding-the-node-that-went-wrong"`.

### Task 2.6: `concepts/two-ways-to-change-a-project.md`

**Files:** Create: `apps/site/src/content/docs/concepts/two-ways-to-change-a-project.md`

- [ ] Frontmatter: `title: Two ways to change a project`, one-sentence `description`.
- [ ] Ground in `docs/research/site-ia-concepts-wave6.md` §11 in full.
- [ ] Cover both paths: direct file edit (validated AFTER the write, by a project hook running the real
  `aqven check` command — real but only a convention a project's own agent-harness configuration wires
  up, not a property of AQVEN itself; nothing on disk stops an invalid intermediate state from being
  saved) and `flow_patch` (a real MCP tool/REST route, validated BEFORE the write via a real
  compare-and-swap on a declared file hash — a stale hash aborts the whole call with zero bytes written;
  a retry-safe id makes replaying a call idempotent; a structural rename through `flow_patch` also
  appends a real, verified entry to the project's rename journal in the same transaction, which a
  hand-edit would not do).
- [ ] Cover why this matters especially for an agent: it can fire off many fast edits with no human
  watching each diff — exactly the class of conflict CAS is built to catch — and an MCP-connected agent
  is told this exact split directly in its first message from the server.
- [ ] **Do not use "flow_check" as if it were a real function/tool name** — per the research section,
  this term only appears in `CLAUDE.md` as an internal shorthand; the real, citable mechanism is the CLI
  command `aqven check`, invoked by a hook. Use `aqven check` as the concrete verb.
- [ ] **Do not overstate what `flow_patch` covers** — per the research section, the currently
  implemented operation set is real but finite (node/flow/agent operations); if giving examples of "what
  flow_patch is for," stick to node/flow/agent renames, not type or tool renames.
- [ ] Re-verify live before writing: confirm the real project hook still exists at
  `examples/.claude/settings.json` and `examples/.claude/hooks/aqven_check.py`, and that
  `packages/aqven/src/aqven/write/model.py`'s `PatchOp` union still has the same operation count/names
  cited in the research section.
- [ ] Real example: a minimal `flow_patch` request/response pair (a `set` operation with an expected
  file hash, success, then a stale-hash retry producing a real conflict response) — consistent with,
  not duplicating, what's already published in more detail on `/mcp-cli/edit-a-flow/`. The rename
  journal contrast (a `flow_patch` rename journals; a hand-edit of the same rename does not).
- [ ] Cross-references: "must link to (not restate) `/mcp-cli/edit-a-flow/` (every operation, the full
  CAS field-by-field breakdown, real request/response JSON) and `/engine/check/` (what the validation
  actually checks). Link to `/mcp-cli/read-project-structure/`, which already gestures at this exact
  split... this concept page is the natural forward-link target from that line. Link to
  [Task 1.1's page] for what a project looks like on disk — don't restate the layout here."
- [ ] Run `pnpm --filter @aqven/site check`, commit:
  `git commit -m "docs: add concepts/two-ways-to-change-a-project"`.

---

## Phase 3: Final verification

### Task 3.1: Full build and `llms.txt`

- [ ] Run `uv run --project . python tools/generate_reference.py` first (reference has drifted at the
  start of every wave's final check so far — regenerate before building, commit if anything changed).
- [ ] Run `pnpm --filter @aqven/site check`, then `pnpm --filter @aqven/site build`. All 11 Concepts
  pages plus all previously published pages must build with 0 errors.
- [ ] Run `node apps/site/scripts/generate_llms.mjs --check`.
- [ ] Spot-check the sidebar renders all 11 Concepts entries in the designed order (item 1, 2, 3, 4, 5,
  6, 7, 8, 9, 10, 11 — i.e. `what-this-is-built-on`, `run-survives-a-crash`,
  `files-as-source-of-truth`, `agent-inference-and-the-llm-node`, `ten-kinds-of-nodes`,
  `three-prompt-levels`, `five-dynamic-shape-cases`, `what-happens-when-a-model-is-called`,
  `engineering-loop`, `finding-the-node-that-went-wrong`, `two-ways-to-change-a-project`).
- [ ] Commit anything changed.

---

## Self-Review

**Spec coverage:** all 9 remaining Concepts pages (design doc items 2, 3, 4, 5, 6, 7, 8, 10, 11) plus
sidebar wiring. Items 1 and 9 are untouched (already published).

**Placeholders:** none. Every task cites its exact research-doc section and quotes the section's
cross-reference instructions directly rather than summarizing.

**Consistency:** Task 2.4 (item 8) is explicitly instructed to describe the refusal/truncated gap as
current behavior, not designed-but-unbuilt recovery — cross-checked against the "Before any task"
section so no implementer can miss it even reading tasks out of order. Task 2.5 (item 10) is explicitly
instructed to use `examples/lumen/`, not synthetic fixtures, for the same reason. File paths for all 9
new pages are fixed once in Task 0.1's table and reused verbatim in every later task's "Files" line — no
drift between the sidebar entries and the actual filenames.

## Next

After this plan merges: the cross-wave "simplify every page's example" pass (design doc §7) — a single
pass over the entire published site (all 6 areas + all 11 Concepts pages), not scoped to any one wave,
executed separately once this is the last content wave to land.
