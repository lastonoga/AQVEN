# AQVEN Docs IA — Wave 3 ("Studio") Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fill the "Studio" area of AQVEN's docs site (`apps/site/src/content/docs/studio/`) — the
GUI-side how-to content: one tutorial plus 8 how-to pages, matching the design doc's §4 "Studio" list.

**Architecture:** Same site as Waves 1–2. The sidebar's "Studio" group already exists in
`apps/site/astro.config.mjs` with an empty `items: []`. Every page follows `apps/site/CONVENTIONS.md`'s
templates, plain English, examples verified against real code. Unlike Waves 1–2 (Python engine code),
this wave's ground truth is the `apps/studio` TypeScript/React frontend.

**Tech Stack:** Astro 7 + Starlight 0.42.1 for the site. Verification: `pnpm --filter @aqven/site check`
and `pnpm --filter @aqven/site build` (Node ≥24.21.0, nvm). Facts for this wave already come from a
dedicated research pass (below) — implementers verify against it and re-confirm anything load-bearing
against the live file (line numbers drift as code moves), not re-derive everything from scratch.

---

## Pre-verified research (read before writing any page)

A parallel research pass already read every relevant screen's real source in `apps/studio/src/` and
returned dense, cited findings. The full output is preserved at
`docs/research/site-ia-studio-screens.md` (this plan's Task 0.1 writes it) — **every content task below
must read that file first**, and only re-open the cited `apps/studio` source files to confirm a claim
still holds (code moves; the research is a strong starting point, not gospel) or to find something the
research didn't cover.

**Findings that change the plan from a naive reading of the design doc**, flagged here so no task
re-discovers them the hard way:
- **The evals screen in Studio is read-only.** There is no "Run" button and no code path in
  `apps/studio/src/` that calls `POST /api/eval-runs`. Eval runs are started by the CLI
  (`aqven eval --eval <id>`) and Studio only displays what the engine already recorded. Task 3.6 must
  write the how-to this way — "start it from the terminal, come here to read the result" — not as if
  Studio has a Run button.
- **The review (human-approval) screen has no Approve/Reject buttons.** It's a generic, schema-driven
  form (boolean → Yes/No, enum → segmented choice, etc., built from the node's own form JSON Schema)
  with one "Submit and resume" button. What counts as "approve" vs "reject" is just whatever value the
  person sets in that generic form. Task 3.4 must describe this honestly, not invent Approve/Reject UI.
- **The settings screen is almost entirely read-only.** Provider keys and secrets are masked,
  view-only status lists (the backend has write/delete endpoints, but no UI wires them). The only
  interactive control on the whole screen is the Claude/Codex chat-backend switch. Task 3.8 must not
  imply you can edit a key from Studio.
- **Canvas and the `/nodes` list screen are two different, real routes** with overlapping but distinct
  tab sets and no shared component code between their inspectors. Task 3.2 covers both under one
  "Understand" page (graph view vs. list view of the same information) rather than inventing a 10th page.
- **`docs/adr/0041-chat-model-and-effort.md` is stale**: it says changing an open thread's model is
  "currently impossible," but the shipped code and its own tests do exactly that (`PATCH
  /api/chat/sessions/{id}`). Task 3.7 describes the real, current behavior — don't cite or defer to the
  ADR text for this specific claim.

---

## Phase 0: Preserve research, area intro, sidebar wiring

### Task 0.1: Write the research findings to `docs/research/`

**Files:** Create: `docs/research/site-ia-studio-screens.md`

- [ ] Write the full verified findings for all 10 Studio areas researched (setup, project overview,
  canvas, nodes list, run debugger, review/human-approval, datasets, evals, chat, settings) into this
  file, same spirit as `docs/research/site-ia-feature-inventory.md` from Wave 1: dense, cited,
  organized by area, no prose padding. This is the artifact every later task in this plan reads first.
- [ ] Commit: `git add docs/research/site-ia-studio-screens.md && git commit -m "docs: record verified Studio screen research for Wave 3"`

*(Controller note: this task's content already exists — it's the structured output from the
verification workflow run before this plan. Transcribe it, don't re-research.)*

### Task 0.2: `studio/index.md` — area landing page

**Files:** Create: `apps/site/src/content/docs/studio/index.md`

- [ ] Frontmatter:
  ```yaml
  ---
  title: Studio
  description: Build, run, and debug workflows visually — the same project, from the browser.
  ---
  ```
- [ ] 2–3 short paragraphs, same voice as `apps/site/src/content/docs/engine/index.md`: Studio is the
  GUI side of the same file-based project the Engine pages cover — open it with `{{CLI_COMMAND}} studio`
  (already documented on `/start/quickstart/` and `/start/engineering-loop-walkthrough/`, link there,
  don't repeat). Link forward to this wave's other 8 pages by their final slugs (below).
- [ ] Run `pnpm --filter @aqven/site check`, commit: `git commit -m "docs: add studio/index page"`.

### Task 0.3: Wire the sidebar slugs

**Files:** Modify: `apps/site/astro.config.mjs` (the `"Studio"` group, currently `items: []`)

- [ ] Replace with:
  ```js
  {
    label: "Studio",
    items: [
      { slug: "studio" },
      { slug: "studio/first-workflow" },
      { slug: "studio/understand-the-graph" },
      { slug: "studio/investigate-a-run" },
      { slug: "studio/respond-to-a-review" },
      { slug: "studio/datasets" },
      { slug: "studio/evals" },
      { slug: "studio/chat" },
      { slug: "studio/settings" },
      { slug: "studio/open-a-project" },
    ],
  },
  ```
- [ ] Run `pnpm --filter @aqven/site check` (missing-file errors for not-yet-written pages are
  expected and fine; no config syntax errors). Commit:
  `git commit -m "docs: wire up the Studio sidebar slugs"`.

---

## Phase 1: Tutorial + how-to pages

Each task follows `apps/site/CONVENTIONS.md`'s template for its Diátaxis type (tutorial for Task 1.1,
how-to for the rest). Every page's example should be small and real — per the cross-wave follow-up
already recorded in the design doc §7 (2026-09-22), don't default to a huge showcase-project dump;
use the smallest real interaction that demonstrates the point, screenshots-in-words (precise UI
descriptions) rather than long code blocks where the screen itself *is* the content.

### Task 1.1: `studio/first-workflow.md` — tutorial

**Files:** Create: `apps/site/src/content/docs/studio/first-workflow.md`

- [ ] Frontmatter: `title: Your first workflow in Studio`, one-sentence `description`.
- [ ] This is the GUI-first counterpart to `/start/quickstart/` (which used the terminal). Read that
  page and `/start/engineering-loop-walkthrough/` first — this page should NOT duplicate either; it's
  the standalone "I want to start in the browser, not the terminal" path. Cover: opening
  `{{CLI_COMMAND}} studio` on a fresh showcase project, landing on `/setup` (the onboarding screen —
  see research: 3 steps, agent/providers/workflow, a skip link to the landing flow's canvas), picking
  a flow to open, arriving at the canvas.
- [ ] Template: `# <Title>` / `## What you'll have at the end` / `## Before you start` / numbered steps
  / `## What's next` (linking to `/studio/understand-the-graph/`).
- [ ] Run `pnpm --filter @aqven/site check`, commit: `git commit -m "docs: add studio/first-workflow tutorial"`.

### Task 1.2: `studio/understand-the-graph.md` — how-to (canvas + nodes list)

**Files:** Create: `apps/site/src/content/docs/studio/understand-the-graph.md`

- [ ] Frontmatter: `title: How to read a workflow's graph`, one-sentence `description`.
- [ ] Covers BOTH real screens that show "what's in this flow": the canvas (`/flows/$flowId/canvas`,
  a real node-link graph — step cards, container cards for loop/switch/parallel groups, click-to-open
  a right-side node inspector with definition/input/prompt/output/config/problems tabs) and the
  `/flows/$flowId/nodes` list screen (a flat indented list + tabbed detail panel — same underlying data,
  different presentation, useful when you want to scan every node rather than navigate the graph).
  Ground every claim in `docs/research/site-ia-studio-screens.md`'s `canvas` and `nodes` sections.
- [ ] Mention the formatted/raw toggle in the inspector (switches every section between human-readable
  and raw JSON) — this is a real, useful, non-obvious feature.
- [ ] `## See also`: link to `/engine/llm-node/` and sibling node-kind pages (the inspector's tabs show
  exactly the same fields those pages teach you to write), `/reference/nodes/`.
- [ ] Run check, commit: `git commit -m "docs: add studio/understand-the-graph how-to"`.

### Task 1.3: `studio/investigate-a-run.md` — how-to (run debugger)

**Files:** Create: `apps/site/src/content/docs/studio/investigate-a-run.md`

- [ ] Frontmatter: `title: How to investigate a run`, one-sentence `description`.
- [ ] **This is the single most important page in this wave** — it's the direct Studio-side delivery
  of the "pain this solves" 30-second promise from `/start/index.md`. Ground it entirely in
  `docs/research/site-ia-studio-screens.md`'s `runs` section (very detailed: run picker, run header/
  metrics, stage timeline with per-node cards, the call-sheet side panel with model/input/prompt/output/
  checks tabs, the attempts ladder for failed retries, how nested parallel/map/loop executions open as
  recursive matrices). Cover: picking a run, reading the stage timeline, opening a specific node's
  execution (including a specific branch/iteration/item — this is where the engine's "every execution
  has its own address" concept from `/concepts/engineering-loop/` becomes a literal clickable UI
  element — link there), reading the call sheet's tabs, starting a manual run (both paths: from a
  dataset, and "enter input manually").
- [ ] Cross-check against `/start/engineering-loop-walkthrough/` (Task 1.3 of Wave 1, already
  published) — it already walks through "Investigate" at a tutorial level using this same screen; this
  page is the fuller reference, must not contradict it.
- [ ] Small real example: don't dump the whole matrix; describe 2–3 concrete moves precisely.
- [ ] Run check, commit: `git commit -m "docs: add studio/investigate-a-run how-to"`.

### Task 1.4: `studio/respond-to-a-review.md` — how-to

**Files:** Create: `apps/site/src/content/docs/studio/respond-to-a-review.md`

- [ ] Frontmatter: `title: How to respond to a human-review request`, one-sentence `description`.
- [ ] Ground in `docs/research/site-ia-studio-screens.md`'s `review` section. **Be accurate about there
  being no Approve/Reject buttons** — describe the real mechanism: a queue of paused runs sorted by
  deadline, an evidence panel showing what the run produced, a generic form built from the node's own
  form schema (yes/no, choice, text, or raw JSON), one "Submit and resume" button. Explain this is how
  a `human` node (`/engine/human-node/`, link there) actually gets answered.
- [ ] Run check, commit: `git commit -m "docs: add studio/respond-to-a-review how-to"`.

### Task 1.5: `studio/datasets.md` — how-to

**Files:** Create: `apps/site/src/content/docs/studio/datasets.md`

- [ ] Frontmatter: `title: How to work with datasets in Studio`, one-sentence `description`.
- [ ] Ground in the `datasets` research section: viewing/paginating/searching cases, the two ways to
  create a dataset (AI-generate via the chat backend, or CSV import with a preview/check step — there
  is no in-place edit of an existing saved case), running a single case or a batch, reading batch
  progress and per-case results. Link to `/concepts/engineering-loop/` ("Test" step) and forward to
  `/studio/evals/` for what happens after a batch is scored.
- [ ] Run check, commit: `git commit -m "docs: add studio/datasets how-to"`.

### Task 1.6: `studio/evals.md` — how-to

**Files:** Create: `apps/site/src/content/docs/studio/evals.md`

- [ ] Frontmatter: `title: How to read an eval and its gate`, one-sentence `description`.
- [ ] **Be accurate that this screen is read-only.** Open with how to actually start an eval run — the
  terminal, `{{CLI_COMMAND}} eval --eval <id>` (verify the exact current flag syntax against
  `packages/aqven/src/aqven/console/evals.py`, don't just trust the research pass's citation of
  `docs/23-studio-api.md` for the exact CLI form — that's a docs file, not code) — then what Studio
  shows once one exists: the eval list, a specific run's summary/scorers, and — the core of the page —
  what a gate verdict actually looks like: plain colored text reading `PASS`/`WARN`/`BLOCK`/
  `GATE_UNAVAILABLE`, green/amber/red, both as the overall decision and per-scorer in the gate-tests
  table, plus what "no gate" looks like (no baseline vs. baseline-but-engine-returned-none). This
  literally answers "what does a green gate mean" from `/concepts/engineering-loop/` — link there and
  make sure the two pages describe it consistently.
- [ ] Run check, commit: `git commit -m "docs: add studio/evals how-to"`.

### Task 1.7: `studio/chat.md` — how-to

**Files:** Create: `apps/site/src/content/docs/studio/chat.md`

- [ ] Frontmatter: `title: How to use the AI chat in Studio`, one-sentence `description`.
- [ ] Ground in the `chat` research section: Studio runs your own local Claude Code or Codex — never a
  hosted API, never reads/stores credentials — as a side panel next to the canvas. Cover: picking a
  backend, the model/effort/approval-mode menu (and the real, current behavior that changing it on an
  open thread live-edits that thread rather than only affecting new ones — do NOT cite or defer to
  ADR-0041 for this, its text is stale relative to the shipped code, verify directly against
  `apps/studio/src/features/chat/chat-settings.tsx`/`chat-panel.tsx` yourself), starting/switching
  threads, what the agent can actually do in your project (run commands, edit files, call tools
  including MCP tools) and how an approval gate on a tool call shows up (an Allow/Deny bar), how to
  interrupt a running turn. Note the "Add context" button and message "more actions" button are
  currently inert (verify still true before publishing — this is exactly the kind of thing that could
  ship between when the research ran and when you write).
- [ ] Run check, commit: `git commit -m "docs: add studio/chat how-to"`.

### Task 1.8: `studio/settings.md` — how-to

**Files:** Create: `apps/site/src/content/docs/studio/settings.md`

- [ ] Frontmatter: `title: How to check Studio's settings`, one-sentence `description`.
- [ ] **Be accurate that almost everything here is read-only.** Ground in the `settings` research
  section: 5 sections (Project, Chat agent, Model keys, MCP connections, Updates), all status displays
  or copy-paste command snippets except the chat backend switch. Link to `/engine/secrets/` for the
  CLI's equivalent (also read-only, same underlying data) and note neither surface lets you set a key —
  that's an environment/`.env` file operation, which `/engine/secrets/` already covers.
- [ ] Run check, commit: `git commit -m "docs: add studio/settings how-to"`.

### Task 1.9: `studio/open-a-project.md` — how-to

**Files:** Create: `apps/site/src/content/docs/studio/open-a-project.md`

- [ ] Frontmatter: `title: How to open an existing project in Studio`, one-sentence `description`.
- [ ] Shorter page: `{{CLI_COMMAND}} studio` (or `dev`) from within an existing project directory, or
  the "Open another project" command shown in Settings. Ground in the `setup`/`project` research
  sections for what you land on. Link back to `/studio/first-workflow/` for the from-scratch path.
- [ ] Run check, commit: `git commit -m "docs: add studio/open-a-project how-to"`.

---

## Phase 2: Final verification

### Task 2.1: Full build and `llms.txt`

- [ ] Run `pnpm --filter @aqven/site check`, then `pnpm --filter @aqven/site build` (the real route-
  resolution test — `check` alone doesn't catch broken sidebar slugs, per Wave 1's finding). Watch for
  stale-reference warnings the way Wave 1/2 found (dead redirects, stale generated reference — run
  `uv run --project . python tools/generate_reference.py` and commit if anything changed).
- [ ] Run `node apps/site/scripts/generate_llms.mjs --check` — should pick up the new Studio section
  automatically (Wave 1 keyed `generate_llms.mjs`'s sections on top-level slug prefixes); if it doesn't,
  fix the generator and say why, don't blindly regenerate.
- [ ] Commit anything changed.

---

## Self-Review

**Spec coverage:** 9 Studio pages from design doc §4 (tutorial + 8 how-to), all present as tasks, plus
the area intro and sidebar wiring. Reference generation unaffected (Studio has no generated reference
content).

**Placeholders:** none. The three "be accurate that X is read-only/doesn't exist" call-outs are
deliberate corrections carried from real research, not gaps.

**Consistency:** cross-references to `/start/quickstart/`, `/start/engineering-loop-walkthrough/`,
`/concepts/engineering-loop/`, `/engine/human-node/`, `/engine/secrets/` all point at pages that already
exist (Wave 1/2, merged). Forward links (if any land in Phase 4/5/6 areas) follow the same
link-forward-anyway convention already established.

## Next

MCP & CLI (7 pages), Integrations (3 pages), remaining 9 Concepts pages — same process. Separately
tracked: the cross-wave "simplify every page's example" pass (design doc §7), once all areas are written.
