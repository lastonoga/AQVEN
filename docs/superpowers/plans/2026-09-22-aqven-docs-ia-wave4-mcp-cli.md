# AQVEN Docs IA — Wave 4 ("MCP & CLI") Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fill the "MCP & CLI" area of AQVEN's docs site (`apps/site/src/content/docs/mcp-cli/`) —
how-to content for the agent-driven surface: connecting to the MCP server, and using its 18 real tools
grouped by task.

**Architecture:** Same site as Waves 1–3. The sidebar's "MCP & CLI" group already exists in
`apps/site/astro.config.mjs` with an empty `items: []`. Ground truth for this wave already comes from a
dedicated research pass — `docs/research/site-ia-mcp-cli-surface.md` — read before writing any page.

**Tech Stack:** Astro 7 + Starlight 0.42.1. Verification: `pnpm --filter @aqven/site check` and
`pnpm --filter @aqven/site build` (Node ≥24.21.0, nvm).

---

## Pre-verified research and the one real correction it forced

`docs/research/site-ia-mcp-cli-surface.md` (already committed) replaces an earlier, wrong assumption:
**`catalog_list`/`catalog_get` do not exist anywhere in the code.** The design doc's original Wave 4
page 4 ("Просмотр каталога") described tools that were never real — already corrected in
`docs/superpowers/specs/2026-09-21-aqven-docs-ia-design.md` §"MCP и CLI" (2026-09-22 edit). This plan's
Task 1.4 reflects the correction: the real, deliberate design is that flows are files, an agent reads
them directly, and there is no listing tool. Don't write a page describing a nonexistent tool.

**18 real MCP tools, not 22** (an earlier, stale inventory said 22). Full list, surfaces, and REST/MCP
behavioral divergences are in the research doc — several are genuinely important and easy to get wrong:
- `run_events` defaults to the **tail** over MCP but the **start** over the REST route with the same
  operation id — a real behavioral difference, not just transport.
- `run_fork`'s MCP field is `address`; REST's is `"from"` — different JSON keys for the same value.
- `eval_run_start` over MCP returns the **full** `EvalRunRecord`; REST returns a slim
  `EvalRunAccepted{eval_run_id, eval_id, status, poll}` at 202 — genuinely different response shapes.
- Auth (`Authorization: Bearer <token>`) is **off by default** — only enforced with `--require-auth`.
  State this plainly; don't imply a token is always required.
- `pyright_check` and `pytest_run` are MCP-only (no REST route).

Every content task below has real, live-verified pass/fail examples already captured in the research
doc for `prompt_preview`, `aqven_check`, `pyright_check`, `pytest_run` — use those (or re-verify your
own small ones the same way, live against a real project) rather than inventing JSON output.

---

## Phase 0: Area intro, sidebar wiring

### Task 0.1: `mcp-cli/index.md` — area landing page

**Files:** Create: `apps/site/src/content/docs/mcp-cli/index.md`

- [ ] Frontmatter:
  ```yaml
  ---
  title: MCP & CLI
  description: Connect a coding agent to AQVEN over MCP, and drive a project with its 18 tools.
  ---
  ```
- [ ] 2-3 short paragraphs, same voice as `apps/site/src/content/docs/engine/index.md` and
  `apps/site/src/content/docs/studio/index.md`: this area is for driving AQVEN through an agent (Claude
  Code, or any MCP client) instead of a human clicking through Studio — the same project, a third way in.
  Link forward to this wave's other 6 pages by their final slugs (below).
- [ ] Run `pnpm --filter @aqven/site check`, commit: `git commit -m "docs: add mcp-cli/index page"`.

### Task 0.2: Wire the sidebar slugs

**Files:** Modify: `apps/site/astro.config.mjs` (the `"MCP & CLI"` group, currently `items: []`)

- [ ] Replace with:
  ```js
  {
    label: "MCP & CLI",
    items: [
      { slug: "mcp-cli" },
      { slug: "mcp-cli/connect-an-agent" },
      { slug: "mcp-cli/check-and-test" },
      { slug: "mcp-cli/edit-a-flow" },
      { slug: "mcp-cli/read-project-structure" },
      { slug: "mcp-cli/runs" },
      { slug: "mcp-cli/datasets-and-evals" },
      { slug: "mcp-cli/preview-a-prompt" },
    ],
  }
  ```
- [ ] Run `pnpm --filter @aqven/site check` (missing-file errors expected and fine; no config syntax
  errors), commit: `git commit -m "docs: wire up the MCP & CLI sidebar slugs"`.

---

## Phase 1: How-to pages

Each page follows `apps/site/CONVENTIONS.md`'s how-to template. Every tool-input/output claim must be
verified against `docs/research/site-ia-mcp-cli-surface.md` and, for anything load-bearing, the cited
source file directly (code moves). Per the cross-wave "keep examples small" follow-up (design doc §7),
each page's example should be one or two small, real tool calls with real output — not an exhaustive
dump of every field.

### Task 1.1: `mcp-cli/connect-an-agent.md` — tutorial

**Files:** Create: `apps/site/src/content/docs/mcp-cli/connect-an-agent.md`

- [ ] Frontmatter: `title: How to connect AQVEN as an MCP server`, one-sentence `description`.
- [ ] Ground in research doc §2 (transport/connection). Cover: `{{CLI_COMMAND}} mcp` as the simple path
  (starts a headless server if needed, bridges stdio), and connecting directly over HTTP for a client
  that speaks streamable-HTTP itself (the real URL shape, `.aqven/server.json`, the bearer token — and
  **state plainly that auth is off unless the server was started with `--require-auth`**, don't imply
  it's always required). Mention the real `claude mcp add --scope project aqven -- uv run aqven mcp`
  command (already shown on `/studio/settings/` — read that page first, don't re-derive, just
  cross-reference) as the concrete example for Claude Code specifically.
- [ ] Template: tutorial shape (`## What you'll have at the end` / `## Before you start` / numbered
  steps / `## What's next`, linking to `/mcp-cli/check-and-test/`).
- [ ] Run check, commit: `git commit -m "docs: add mcp-cli/connect-an-agent tutorial"`.

### Task 1.2: `mcp-cli/check-and-test.md` — how-to

**Files:** Create: `apps/site/src/content/docs/mcp-cli/check-and-test.md`

- [ ] Frontmatter: `title: How to check and test a project as an agent`, one-sentence `description`.
- [ ] Cover `aqven_check`, `pyright_check`, `pytest_run` — ground in research doc §6, which already has
  live-verified pass/fail JSON for all three. Use those real examples (or re-capture your own the same
  way — live against a real project, not invented). Note `pyright_check`/`pytest_run` are MCP-only (no
  REST route), and that `aqven_check`'s failure is signaled *inside* the result (`ok:false`), not as an
  MCP tool error — a real, easy-to-miss distinction worth calling out explicitly.
- [ ] Link to `/engine/check/` (the CLI-terminal version of the same check) and `/engine/inspect-project/`.
- [ ] Run check, commit: `git commit -m "docs: add mcp-cli/check-and-test how-to"`.

### Task 1.3: `mcp-cli/edit-a-flow.md` — how-to

**Files:** Create: `apps/site/src/content/docs/mcp-cli/edit-a-flow.md`

- [ ] Frontmatter: `title: How to edit a flow's structure as an agent`, one-sentence `description`.
- [ ] Ground in research doc §3 (`flow_patch` mechanics) — this is the safety-critical page, be precise.
  Cover: the 11 real ops (not a "replace" or node-level "delete" — it's `set`/`remove_node`), the
  `expects[]`/CAS mechanism (three conflict codes: `FILE_EXISTS`, `FILE_VANISHED`, `STALE_FILE`), that
  `expects[]` must cover every file the ops end up touching (`_require_coverage`, with the `candidates`
  hint on failure), `client_op_id` idempotent replay, and `dry_run`. Cross-reference
  `/concepts/what-this-is-built-on/`'s "two ways to change a project" concept — this tool IS one of the
  two ways (structural edits go through here, not direct file writes).
- [ ] Run check, commit: `git commit -m "docs: add mcp-cli/edit-a-flow how-to"`.

### Task 1.4: `mcp-cli/read-project-structure.md` — how-to (the corrected page)

**Files:** Create: `apps/site/src/content/docs/mcp-cli/read-project-structure.md`

- [ ] Frontmatter: `title: How an agent reads a project's structure`, one-sentence `description`.
- [ ] **This replaces the design doc's original, wrong "catalog" page** — there is no
  `catalog_list`/`catalog_get`/listing MCP tool. Say so plainly and explain the real, deliberate design:
  a flow is files on disk (per `/concepts/what-this-is-built-on/`'s files-as-source-of-truth concept,
  already published — link there), so an agent reads them with its own file tools (whatever it calls
  "Read"/"Grep"/"Glob") the same way it reads any other code in the project — no special MCP tool needed
  for that. Cover the one real, structured alternative from the terminal: `{{CLI_COMMAND}} tree` and
  `{{CLI_COMMAND}} refs` (already documented on `/engine/inspect-project/` — link there, don't repeat).
  Also mention `flow_list`/`flow_get` exist as REST routes for Studio's own UI but are deliberately not
  exposed over MCP — so don't reach for them from an agent context.
- [ ] Run check, commit: `git commit -m "docs: add mcp-cli/read-project-structure how-to"`.

### Task 1.5: `mcp-cli/runs.md` — how-to

**Files:** Create: `apps/site/src/content/docs/mcp-cli/runs.md`

- [ ] Frontmatter: `title: How to start and follow runs as an agent`, one-sentence `description`.
- [ ] Ground in research doc §4 — all 8 tools (`run_start`, `run_get`, `run_list`, `run_get_node`,
  `run_events`, `run_resume`, `run_fork`, `run_cancel`). **Must state the real REST/MCP divergences**:
  `run_events`' tail-by-default behavior over MCP (different from the REST route with the same
  operation), and `run_fork`'s field name (`address` over MCP). These are exactly the kind of thing that
  silently breaks an agent's assumptions if undocumented. Cross-reference `/concepts/engineering-loop/`
  (execution addresses) and `/studio/investigate-a-run/` (the same data, viewed by a human).
- [ ] Run check, commit: `git commit -m "docs: add mcp-cli/runs how-to"`.

### Task 1.6: `mcp-cli/datasets-and-evals.md` — how-to

**Files:** Create: `apps/site/src/content/docs/mcp-cli/datasets-and-evals.md`

- [ ] Frontmatter: `title: How to run datasets and evals as an agent`, one-sentence `description`.
- [ ] Ground in research doc §5 — `dataset_batch_start/get`, `eval_run_start/get`, `eval_gate`. **Must
  state the real REST/MCP divergence**: `eval_run_start` returns the full record over MCP but only a
  slim accepted-marker over REST. Cover the two distinct "no gate" outcomes (`eval_gate` 404 with no
  baseline at all, vs. a normal 200 with `decision: GATE_UNAVAILABLE` and a reason code when baseline
  statistics don't support a verdict) — consistent with `/studio/evals/`, link there and don't
  contradict it.
- [ ] Run check, commit: `git commit -m "docs: add mcp-cli/datasets-and-evals how-to"`.

### Task 1.7: `mcp-cli/preview-a-prompt.md` — how-to

**Files:** Create: `apps/site/src/content/docs/mcp-cli/preview-a-prompt.md`

- [ ] Frontmatter: `title: How to preview a prompt as an agent`, one-sentence `description`.
- [ ] Ground in research doc §6 (`prompt_preview` — already has live-verified real success/failure
  examples). Cover: what it returns (rendered instructions/messages, attachments, tools, resolved
  output mode), and the two real failure modes (calling it on a non-`llm` node; an unknown prompt
  variant slot). Link to `/engine/prompts/` and `/engine/llm-node/`.
- [ ] Run check, commit: `git commit -m "docs: add mcp-cli/preview-a-prompt how-to"`.

---

## Phase 2: Final verification

### Task 2.1: Full build and `llms.txt`

- [ ] Run `uv run --project . python tools/generate_reference.py` first (the reference has drifted at
  the start of every wave so far — regenerate before building, don't wait for `reference:check` to fail).
- [ ] Run `pnpm --filter @aqven/site check`, then `pnpm --filter @aqven/site build` (the real
  route-resolution test).
- [ ] Run `node apps/site/scripts/generate_llms.mjs --check` — should pick up the new section
  automatically (the generator's `AREAS` table is keyed on slug prefix, already covers `mcp-cli/`).
- [ ] Commit anything changed.

---

## Self-Review

**Spec coverage:** 7 pages (tutorial + 6 how-to) plus area intro and sidebar wiring — the design doc's
corrected §4 "MCP и CLI" list, all 18 real tools distributed across them, none invented.

**Placeholders:** none. The corrected page 4 is not a gap — it's a deliberate, accurate description of
what doesn't exist and why, replacing content that would have been actively wrong.

**Consistency:** cross-references to `/concepts/what-this-is-built-on/`, `/concepts/engineering-loop/`,
`/engine/check/`, `/engine/inspect-project/`, `/engine/prompts/`, `/engine/llm-node/`,
`/studio/settings/`, `/studio/investigate-a-run/`, `/studio/evals/` all point at pages that already
exist (Waves 1-3, merged).

## Next

Integrations (3 pages), remaining 9 Concepts pages — same process. Then the cross-wave "simplify every
page's example" pass (design doc §7), once all areas are written.
