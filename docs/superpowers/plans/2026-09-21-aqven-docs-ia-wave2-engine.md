# AQVEN Docs IA — Wave 2 ("Engine") Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fill the "Engine" area of AQVEN's docs site (`apps/site/src/content/docs/engine/`) — the
how-to content for writing workflows as code/YAML: one page per node kind, prompts, dynamic
input/output shape, and the CLI commands that don't need Studio.

**Architecture:** Same site as Wave 1 (Astro/Starlight). The sidebar's "Engine" group already exists
in `apps/site/astro.config.mjs` with an empty `items: []` — this wave fills it. Every page follows
`apps/site/CONVENTIONS.md`'s how-to template (`When you need this` / `Steps` / `Example` / `Under the
hood` / `See also`), written in plain English, facts verified against real code before writing (never
cited on the page itself), examples built on the real showcase project.

**Tech Stack:** Astro 7 + Starlight 0.42.1. Verification: `pnpm --filter @aqven/site check` and
`pnpm --filter @aqven/site build` (Node >=24.21.0 — use nvm). Source of truth for facts:
`docs/research/site-ia-feature-inventory.md` (has real `file:line` citations) plus direct reading
of `packages/aqven/src/aqven/` and the showcase project — that inventory file is from an earlier pass
and may itself be stale by now (engine code has moved since Wave 1, as Wave 1's merge already
discovered), so treat it as a starting pointer, not a source of truth on its own — re-verify anything
load-bearing against the actual current code.

---

## Scope and how this plan differs from Wave 1

19 pages: one intro (`engine/index.md`), 10 node-kind how-tos, 2 prompt/data-shape how-tos, 6 CLI
how-tos. Split into phases so a `subagent-driven-development` session can stop after any phase and
resume later without leaving the site half-broken — each phase's pages are independent of each other
(they don't forward-link to pages from a *later* phase in this same wave; they may still forward-link
to areas from later *waves*, e.g. Studio, same convention as Wave 1).

**Lesson carried over from Wave 1, not repeated as boilerplate in every task below:** almost every
Wave 1 content task found something the plan got wrong once the implementer actually checked the
code — a config API that had moved, a fact that turned out narrower than assumed, a cross-reference
that didn't exist yet. That is not a planning failure, it is what verification is for. Every task
below says what to verify and where to start looking, not what to assume is true. When execution
finds the plan is wrong about something factual, fix the claim, write the correct thing, and note it
in the commit or report — don't block waiting for a plan rewrite unless the fix requires a judgment
call the implementer shouldn't make alone (same escalation bar as Wave 1: BLOCKED/NEEDS_CONTEXT for
judgment calls, DONE_WITH_CONCERNS for "I wrote the corrected, honest version, here's what changed").

**Every task's example should default to the showcase project** at
`packages/aqven/src/aqven/templates/showcase/__package__/flows/support_case/` — but this plan does
NOT assert which exact node in that project demonstrates which node kind beyond what Wave 1 already
confirmed (`triage`=`llm`, `prepare`=`code`, `route`=`switch`, `drafts`/`approvals`=`parallel`,
`vote`=`map`, `to_record`=`narrow`, `panel`=`call`, `record`=`loop` containing `record__extract`/
`record__validate`). Two kinds are NOT confirmed present in showcase from Wave 1's work: `tool` and
whether `loop`'s example is the best teaching example for a page about `loop` specifically (it's
nested inside `record`, not top-level). **Task 1.3 (`tool`) and Task 1.8 (`loop`) must independently
verify this by reading the real project** — don't assume showcase has what's needed; if it doesn't,
write a minimal, honestly-labeled standalone example instead of forcing a showcase reference that
isn't really there.

---

## Phase 0: Area intro + sidebar wiring

### Task 0.1: `engine/index.md` — area landing page

**Files:**
- Create: `apps/site/src/content/docs/engine/index.md`

- [ ] Write a short landing page for the Engine area (not a how-to, not a tutorial — an orientation
  page, same spirit as `start/index.md` but scoped to this area). Frontmatter:
  ```yaml
  ---
  title: Engine
  description: Write workflows as files — nodes, prompts, and the CLI that checks and runs them.
  ---
  ```
  Content: 2-3 short paragraphs. State plainly what this area covers (the file-based way of building
  a workflow, as opposed to Studio's visual way) and link to the first few pages that will exist once
  Phase 1 lands (`engine/llm-node/`, etc. — see the exact slugs task-by-task below). If this page is
  written before Phase 1's pages exist, link forward the same way Wave 1 did (plain markdown links to
  not-yet-existing pages are fine, `astro check` doesn't validate them).
- [ ] Run `pnpm --filter @aqven/site check` (Node 24 via nvm).
- [ ] Commit: `git add apps/site/src/content/docs/engine/index.md && git commit -m "docs: add engine/index page"`

### Task 0.2: Reserve the sidebar slugs

**Files:**
- Modify: `apps/site/astro.config.mjs` (the `"Engine"` sidebar group, currently `items: []`)

- [ ] Replace the empty Engine group's `items: []` with the full ordered list of slugs this wave will
  create (all of Phase 1–3's pages, listed below in execution order). Do this task **last in Phase 0,
  right before Phase 1 starts** — or, if the controller prefers, do it incrementally per phase (add
  Phase 1's slugs after Phase 1 lands, Phase 2's after Phase 2, etc.) so `astro check`/`build` never
  has a sidebar entry pointing at a page that doesn't exist yet mid-wave. Either approach is fine;
  pick one and be consistent. The full final list, in the order pages should appear in the sidebar:
  ```js
  {
    label: "Engine",
    items: [
      { slug: "engine" },
      { slug: "engine/llm-node" },
      { slug: "engine/code-node" },
      { slug: "engine/tool-node" },
      { slug: "engine/human-node" },
      { slug: "engine/parallel-node" },
      { slug: "engine/map-node" },
      { slug: "engine/switch-node" },
      { slug: "engine/loop-node" },
      { slug: "engine/call-node" },
      { slug: "engine/narrow-node" },
      { slug: "engine/prompts" },
      { slug: "engine/dynamic-shape" },
      { slug: "engine/check" },
      { slug: "engine/generate-types" },
      { slug: "engine/inspect-project" },
      { slug: "engine/run-locally" },
      { slug: "engine/secrets" },
      { slug: "engine/check-providers" },
    ],
  },
  ```
- [ ] Run `pnpm --filter @aqven/site check` — missing-file errors for not-yet-written pages are
  expected if this task runs before those pages exist; no config syntax errors should occur.
- [ ] Commit: `git add apps/site/astro.config.mjs && git commit -m "docs: wire up the Engine sidebar slugs"`

---

## Phase 1: Node kinds (10 pages)

Each task below follows the same how-to template from `apps/site/CONVENTIONS.md`:
```
# How to <task>
## When you need this
## Steps
### Example
## Under the hood        (only if genuinely backed by a real third-party library — most node kinds
                           aren't; don't force one)
## See also
```
`## Steps` is a short numbered list of what fields/YAML you actually write for this node kind, not
prose. `### Example` must be a real, verified snippet — either lifted from the showcase project
(preferred) or a minimal hand-built one if showcase doesn't have a clean top-level example of this
kind. `## See also` at minimum links to `/concepts/engineering-loop/` for kinds involved in the
Wave-1-established example scenario (llm, human, switch, parallel, map, narrow, loop), and to
`/reference/nodes/` (real, already exists from Wave 0/1's reference generator).

### Task 1.1: `engine/llm-node.md` — the `llm` node

**Files:** Create: `apps/site/src/content/docs/engine/llm-node.md`

- [ ] Frontmatter: `title: How to call a model`, `description: <one sentence>`.
- [ ] Verify against real code: the `llm` node's spec fields (`packages/aqven/src/aqven/spec/nodes.py`
  — grep for the `llm` node's Pydantic model) and that it references a separate `Agent` and
  `Inference` definition rather than embedding the model call inline (this was independently
  confirmed in the Wave 1 inventory pass — re-verify it's still true, the code has moved since then).
  Use the showcase project's `triage` node (`nodes/triage/triage.node.yaml`,
  `nodes/triage/triage.inference.yaml`, `nodes/triage/triage.prompt.md` in a generated project, or the
  `.tmpl` sources under `packages/aqven/src/aqven/templates/showcase/.../nodes/triage/`) as the
  real example — read the actual files, don't reconstruct from memory of Wave 1's summaries.
- [ ] `## Under the hood`: this is the one node kind where "Under the hood: Pydantic AI" is genuinely
  warranted (per `/concepts/what-this-is-built-on/`, already published) — link there instead of
  re-explaining.
- [ ] Run check, commit: `git commit -m "docs: add engine/llm-node how-to"`.

### Task 1.2: `engine/code-node.md` — the `code` node

**Files:** Create: `apps/site/src/content/docs/engine/code-node.md`

- [ ] Frontmatter: `title: How to write a step in Python`, `description: <one sentence>`.
- [ ] Verify the `code` node's spec (`module:function` reference — confirm the exact reference syntax
  by reading `packages/aqven/src/aqven/spec/nodes.py` and the loader that resolves it, not by
  assuming the `module:function` shorthand from earlier conversation is still exactly right).
  Real example: showcase's `prepare` node (`nodes/prepare/prepare.node.yaml` +
  `nodes/prepare/prepare.py`) — read both files for real.
- [ ] No "Under the hood" section — this is plain Python, nothing third-party to name.
- [ ] Run check, commit: `git commit -m "docs: add engine/code-node how-to"`.

### Task 1.3: `engine/tool-node.md` — the `tool` node

**Files:** Create: `apps/site/src/content/docs/engine/tool-node.md`

- [ ] Frontmatter: `title: How to give an agent a tool`, `description: <one sentence>`.
- [ ] **Verify first whether the showcase project has a `tool`-kind node at all** — grep
  `packages/aqven/src/aqven/templates/showcase/` for `node: tool` or equivalent. If it does, use it.
  If it doesn't, say so honestly in your report (don't force a showcase reference that isn't there)
  and build a minimal, clearly-real example instead — e.g. a tiny node spec you actually validate with
  `aqven check` against a scratch project, not an invented YAML snippet.
- [ ] Cover both tool sources the spec supports: local code and an external MCP server (verify exactly
  how a `tool` node distinguishes the two — spec field names — by reading
  `packages/aqven/src/aqven/spec/tool.py` or wherever that lives now). Keep the *external MCP server*
  half brief and link forward to `/integrations/external-mcp-servers/` (Wave 4, doesn't exist yet) for
  the full how-to on connecting one — this page is about the node, not about setting up the server.
- [ ] `## Under the hood`: only if the local-code path or the MCP-client path is genuinely backed by a
  library worth naming (verify — don't assume).
- [ ] Run check, commit: `git commit -m "docs: add engine/tool-node how-to"`.

### Task 1.4: `engine/human-node.md` — the `human` node

**Files:** Create: `apps/site/src/content/docs/engine/human-node.md`

- [ ] Frontmatter: `title: How to pause for a person`, `description: <one sentence>`.
- [ ] Verify the real fields: deadline, assignee, timeout policy (grep `spec/nodes.py` for the
  `human` node model). Real example: showcase's `approvals` node
  (`nodes/approvals/*.node.yaml`, real files for `lead`/`brand` sub-nodes per Wave 1's finding —
  confirm this is still accurate by reading the files, not citing Wave 1's summary as fact).
- [ ] `## Under the hood`: DBOS suspend/resume is genuinely real here — link to
  `/concepts/what-this-is-built-on/` and `/concepts/engineering-loop/` (durability concept page),
  don't re-explain DBOS.
- [ ] Run check, commit: `git commit -m "docs: add engine/human-node how-to"`.

### Task 1.5: `engine/parallel-node.md` — the `parallel` node

**Files:** Create: `apps/site/src/content/docs/engine/parallel-node.md`

- [ ] Frontmatter: `title: How to branch into parallel steps`, `description: <one sentence>`.
- [ ] Verify the join policy options (verify exact names/semantics in `spec/nodes.py` — don't assume
  `all/any/quorum/first_success` from any earlier, unverified conversation notes are still current).
  Real example: showcase's `drafts` node (three model providers running side by side) — read the
  actual join-policy field it uses.
- [ ] Run check, commit: `git commit -m "docs: add engine/parallel-node how-to"`.

### Task 1.6: `engine/map-node.md` — the `map` node

**Files:** Create: `apps/site/src/content/docs/engine/map-node.md`

- [ ] Frontmatter: `title: How to run a step over a collection`, `description: <one sentence>`.
- [ ] Verify concurrency and `on_item_error` fields for real (spec/nodes.py). Real example: showcase's
  `vote` node.
- [ ] Run check, commit: `git commit -m "docs: add engine/map-node how-to"`.

### Task 1.7: `engine/switch-node.md` — the `switch` node

**Files:** Create: `apps/site/src/content/docs/engine/switch-node.md`

- [ ] Frontmatter: `title: How to route by a value`, `description: <one sentence>`.
- [ ] Verify the discriminator field mechanism for real. Real example: showcase's `route` node.
- [ ] Run check, commit: `git commit -m "docs: add engine/switch-node how-to"`.

### Task 1.8: `engine/loop-node.md` — the `loop` node

**Files:** Create: `apps/site/src/content/docs/engine/loop-node.md`

- [ ] Frontmatter: `title: How to repeat a step with a limit`, `description: <one sentence>`.
- [ ] Verify `max_iter`, `stop`/`select` policy fields for real (spec/nodes.py). Real example:
  showcase's `record` node — the one already used on `/concepts/engineering-loop/` and
  `/start/engineering-loop-walkthrough/` for its business-rule-check scenario. Cross-check this page's
  description of `record` against what those two already-published pages say, so the three don't
  contradict each other (read them before writing this one).
- [ ] Run check, commit: `git commit -m "docs: add engine/loop-node how-to"`.

### Task 1.9: `engine/call-node.md` — the `call` node

**Files:** Create: `apps/site/src/content/docs/engine/call-node.md`

- [ ] Frontmatter: `title: How to reuse a flow as a step`, `description: <one sentence>`.
- [ ] Verify how a `call` node references another flow (spec/nodes.py). Real example: showcase's
  `panel` node (calls a `judge_panel` sub-flow per Wave 1's inventory — re-verify this is still
  accurate by reading the actual files).
- [ ] Run check, commit: `git commit -m "docs: add engine/call-node how-to"`.

### Task 1.10: `engine/narrow-node.md` — the `narrow` node

**Files:** Create: `apps/site/src/content/docs/engine/narrow-node.md`

- [ ] Frontmatter: `title: How to narrow a dynamic value to a type`, `description: <one sentence>`.
- [ ] This one connects directly to `engine/dynamic-shape.md` (Task 2.2, same wave) — if Task 2.2
  hasn't run yet, link forward to it anyway. Real example: showcase's `to_record` node. Verify the
  actual mechanism (what it narrows from/to) by reading the node file and its target type, not from
  memory of the "5 cases" framing alone.
- [ ] Run check, commit: `git commit -m "docs: add engine/narrow-node how-to"`.

---

## Phase 2: Prompts and dynamic data (2 pages)

### Task 2.1: `engine/prompts.md` — how to write a prompt

**Files:** Create: `apps/site/src/content/docs/engine/prompts.md`

- [ ] Frontmatter: `title: How to write a prompt`, `description: <one sentence>`.
- [ ] Verify the three prompt levels for real: plain instruction text, a Liquid template (level 2),
  and a Python function (level 3) — grep `packages/aqven/src/aqven/spec/inference.py` and the loader
  for how a `prompt:` reference is resolved and dispatched to one of the three. Real examples: level 2
  from showcase's `triage.prompt.md` (or similar — verify which real prompt file actually uses Liquid
  syntax, don't assume it's `triage`), level 3 from any real `.py` file in showcase that renders a
  prompt from a function if one exists — verify this exists before claiming it; if showcase has no
  real level-3 example, say so and write a small, real, verifiable one instead of inventing one.
- [ ] `## Under the hood`: python-liquid for level 2 — link to `/concepts/what-this-is-built-on/`.
- [ ] Run check, commit: `git commit -m "docs: add engine/prompts how-to"`.

### Task 2.2: `engine/dynamic-shape.md` — dynamic input/output shape

**Files:** Create: `apps/site/src/content/docs/engine/dynamic-shape.md`

- [ ] Frontmatter: `title: How to handle a shape you don't know in advance`, `description: <one sentence>`.
- [ ] Verify the real cases the type system supports (grep for `Dynamic`, `FieldSpec`, `narrow` in
  `packages/aqven/src/aqven/spec/` and `packages/aqven/src/aqven/ir/`) — don't reproduce the "5 cases"
  list from an earlier, unverified conversation summary without checking it against current code.
  Structure the page around whatever the real, current cases actually are, ordered from least to most
  dynamic (that framing is worth keeping if the code still supports it — verify, don't assume). Link
  to `/engine/narrow-node/` for the escape-hatch case.
- [ ] Run check, commit: `git commit -m "docs: add engine/dynamic-shape how-to"`.

---

## Phase 3: CLI without Studio (6 pages)

Each of these verifies its command against `packages/aqven/src/aqven/cli.py`'s `COMMANDS` registry —
confirm the command is still `implemented`, not a `PendingCommand` stub, before writing a how-to for
it (Wave 1's inventory listed `fmt`/`plan`/`build`/`optimize` as stubs; the other commands covered
here were implemented as of Wave 1 — re-verify, the registry may have changed since).

### Task 3.1: `engine/check.md` — `{{CLI_COMMAND}} check`

**Files:** Create: `apps/site/src/content/docs/engine/check.md`

- [ ] Frontmatter: `title: How to check a project before committing`, `description: <one sentence>`.
- [ ] Actually run `{{CLI_COMMAND}} check` (rendered via the site's token, but run the real `aqven
  check` command) against a real generated project and capture genuine output, the same discipline
  Wave 1's quickstart page used — don't fabricate console output.
- [ ] Run site check, commit: `git commit -m "docs: add engine/check how-to"`.

### Task 3.2: `engine/generate-types.md` — `{{CLI_COMMAND}} generate` and `{{CLI_COMMAND}} schema`

**Files:** Create: `apps/site/src/content/docs/engine/generate-types.md`

- [ ] Frontmatter: `title: How to generate types and editor schemas`, `description: <one sentence>`.
- [ ] Cover both commands on one page (they're closely related: one generates typed Python models,
  the other generates JSON Schema for editor autocompletion — verify this framing is accurate by
  reading `cli.py`'s handlers for both, don't assume). Run both for real, capture real output.
- [ ] Run site check, commit: `git commit -m "docs: add engine/generate-types how-to"`.

### Task 3.3: `engine/inspect-project.md` — `{{CLI_COMMAND}} tree` and `{{CLI_COMMAND}} refs`

**Files:** Create: `apps/site/src/content/docs/engine/inspect-project.md`

- [ ] Frontmatter: `title: How to see what's in a project and how it connects`, `description: <one sentence>`.
- [ ] Cover both commands on one page. Run both for real against the showcase project, capture real
  output.
- [ ] Run site check, commit: `git commit -m "docs: add engine/inspect-project how-to"`.

### Task 3.4: `engine/run-locally.md` — `{{CLI_COMMAND}} run`

**Files:** Create: `apps/site/src/content/docs/engine/run-locally.md`

- [ ] Frontmatter: `title: How to run a flow without a server`, `description: <one sentence>`.
- [ ] This overlaps with `/start/quickstart/`'s step 4 — don't duplicate that page's content. This
  page is the how-to *reference* version (all the flags/options), quickstart is the *tutorial* pass.
  Read `/start/quickstart/` first so this page adds detail rather than repeating it, and link to it
  rather than re-explaining the basic flow.
- [ ] Run site check, commit: `git commit -m "docs: add engine/run-locally how-to"`.

### Task 3.5: `engine/secrets.md` — `{{CLI_COMMAND}} secrets`

**Files:** Create: `apps/site/src/content/docs/engine/secrets.md`

- [ ] Frontmatter: `title: How to manage secrets`, `description: <one sentence>`.
- [ ] Verify what the command actually reports (declared secrets, source, whether set — per Wave 1's
  inventory; re-verify against current `console/secrets.py`). Run it for real.
- [ ] Run site check, commit: `git commit -m "docs: add engine/secrets how-to"`.

### Task 3.6: `engine/check-providers.md` — `{{CLI_COMMAND}} models check`

**Files:** Create: `apps/site/src/content/docs/engine/check-providers.md`

- [ ] Frontmatter: `title: How to check your model providers are configured`, `description: <one sentence>`.
- [ ] Verify what this actually checks (configured output modes, live connectivity — per Wave 1's
  inventory; re-verify against current `console/models.py`). Run it for real if credentials allow; if
  not, describe honestly what happens without a key configured (same discipline as the quickstart
  page's `aqven run` section in Wave 1).
- [ ] Link to `/integrations/model-providers/` (Wave 4, doesn't exist yet — link forward) for the
  how-to on setting up each provider family.
- [ ] Run site check, commit: `git commit -m "docs: add engine/check-providers how-to"`.

---

## Phase 4: Wire the rest of the sidebar and verify

### Task 4.1: Finish sidebar wiring (if Task 0.2 was done incrementally) and final build

**Files:** Modify: `apps/site/astro.config.mjs` (if not already fully wired by Task 0.2)

- [ ] Confirm all 19 slugs from Task 0.2's list are in the `Engine` sidebar group and every one
  resolves to a real file.
- [ ] Run `pnpm --filter @aqven/site check`.
- [ ] Run `pnpm --filter @aqven/site build` — the real test, same lesson as Wave 1 (`check` doesn't
  validate sidebar slugs, `build` does). Read the full output for route-resolution warnings, not just
  the exit code.
- [ ] Run `node apps/site/scripts/generate_llms.mjs --check` — Wave 1 already updated this script's
  section mapping to include an `"Engine"` section keyed on the `engine/` slug prefix, so it should
  pick up all 19 new pages automatically; if it doesn't (e.g. the prefix logic doesn't match), fix
  `apps/site/scripts/generate_llms.mjs` and note why in the commit — don't just regenerate blindly
  without understanding why it was out of sync.
- [ ] Commit anything the above steps changed.

---

## Self-Review

**Spec coverage:** all 19 pages from design doc §4's "Движок" section have a task (10 node kinds +
prompts + dynamic shape + 6 CLI commands + 1 area intro = 19). Reference generator is explicitly out
of scope (already exists, not part of this area). Sidebar wiring has its own task.

**Placeholders:** none — every task names its exact file, frontmatter, and what to verify against
which real source. Where this plan deliberately doesn't assert a fact (e.g. whether showcase has a
`tool` node, which real file uses a level-3 prompt), that's a flagged verification step for the
implementer, not a gap in the plan — same pattern Wave 1 used successfully for its install-command and
directory-tree facts.

**Consistency:** slugs in Task 0.2's sidebar list match every task's `Create:` file path, checked
pairwise. Cross-references between Task 1.8 (`loop-node`) and the two already-published Wave 1 pages
that use the same `record` example are called out explicitly to avoid contradiction.

## Next

After this wave: Studio (9 pages), MCP & CLI (7 pages), Integrations (3 pages), the remaining 9
Concepts pages — same process, one plan per wave, page lists already fixed in design doc §4.
