# AQVEN Docs IA — Wave 5 ("Integrations") Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Fill the "Integrations" area of AQVEN's docs site (`apps/site/src/content/docs/integrations/`)
— the 3 pages from the design doc: model providers, external MCP servers, secrets and environment.

**Architecture:** Same site as Waves 1–4. Sidebar's "Integrations" group already exists with an empty
`items: []`. Ground truth: `docs/research/site-ia-integrations-surface.md` (committed) — read before
writing any page.

**Tech Stack:** Astro 7 + Starlight 0.42.1. Verification: `pnpm --filter @aqven/site check` and
`pnpm --filter @aqven/site build` (Node ≥24.21.0, nvm).

---

## Pre-verified research

`docs/research/site-ia-integrations-surface.md` has the ground truth: **28 real provider families**,
not the 10 an earlier design pass assumed. Only 3 are genuinely non-standard-credential cases worth
calling out by name: **Bedrock** (no API key at all — resolves through boto3's own AWS credential
chain), **google** and **alibaba** (accept either of two env var names). The other 25 follow one
`<NAME>_API_KEY` pattern (note: cohere's is `CO_API_KEY`, not `COHERE_API_KEY` — the one naming
exception). Keep this wave at **3 pages total**, matching the design doc's scope — don't split into 28
per-provider pages; one overview table plus a short Bedrock callout covers it.

**Scope discipline vs. already-published pages**: `/engine/secrets/` (Wave 2) already covers
`{{CLI_COMMAND}} secrets` and is confirmed accurate (no drift found in this wave's research pass).
Task 1.3 in this wave is NOT a rewrite of that page — it's the practical "how do I set a secret for the
first time" companion (the `.env` file, the `ref:env/NAME` format across all three declaration points),
cross-referencing `/engine/secrets/` for the inspection/verification side rather than repeating it.

---

## Phase 0: Area intro, sidebar wiring

### Task 0.1: `integrations/index.md` — area landing page

**Files:** Create: `apps/site/src/content/docs/integrations/index.md`

- [x] Frontmatter:
  ```yaml
  ---
  title: Integrations
  description: Connect a model provider, an external MCP server, or a credential your project needs.
  ---
  ```
- [x] 2-3 short paragraphs, same voice as the other area intros. Link forward to this wave's 3 pages.
- [x] Run `pnpm --filter @aqven/site check`, commit: `git commit -m "docs: add integrations/index page"`.

### Task 0.2: Wire the sidebar slugs

**Files:** Modify: `apps/site/astro.config.mjs` (the `"Integrations"` group, currently `items: []`)

- [x] Replace with:
  ```js
  {
    label: "Integrations",
    items: [
      { slug: "integrations" },
      { slug: "integrations/model-providers" },
      { slug: "integrations/external-mcp-servers" },
      { slug: "integrations/secrets-and-environment" },
    ],
  }
  ```
- [x] Run `pnpm --filter @aqven/site check` (missing-file errors expected and fine), commit:
  `git commit -m "docs: wire up the Integrations sidebar slugs"`.

---

## Phase 1: How-to pages

### Task 1.1: `integrations/model-providers.md` — how-to

**Files:** Create: `apps/site/src/content/docs/integrations/model-providers.md`

Follow the how-to template: `# How to <task>` / `## When you need this` / `## Steps` / `### Example` /
`## Under the hood` / `## See also`.

- [x] Frontmatter: `title: How to connect a model provider`, one-sentence `description`.
- [x] Ground in research doc §1-2. Cover: declaring a provider in `aqven.yaml`, the `provider:model`
  string format on an agent, the standard one-env-var-per-provider pattern (most of the 28), and the 3
  real exceptions named explicitly: Bedrock (AWS credential chain, no single key), google/alibaba (two
  acceptable env var names). Don't enumerate all 28 exhaustively — an overview table of the pattern plus
  the exceptions is enough; link to `/reference/provider-catalog/` (already generated) for the full list.
- [x] `## Under the hood`: thin factories over `pydantic_ai.models.*`, per `/concepts/what-this-is-built-on/`
  (already published, genuinely covers this one — verify it still does before linking).
- [x] Real example: the showcase project's `openrouter` setup (only provider it uses) plus a second,
  hand-verified example showing the Bedrock or google dual-env-var case (verify live, don't invent).
- [x] Run check, commit: `git commit -m "docs: add integrations/model-providers how-to"`.

### Task 1.2: `integrations/external-mcp-servers.md` — how-to

**Files:** Create: `apps/site/src/content/docs/integrations/external-mcp-servers.md`

Follow the how-to template: `# How to <task>` / `## When you need this` / `## Steps` / `### Example` /
`## See also`.

- [x] Frontmatter: `title: How to connect an external MCP server`, one-sentence `description`.
- [x] Ground in research doc §3. **Explicitly distinguish this from AQVEN's own MCP server** (covered
  in `/mcp-cli/connect-an-agent/` — link there and name the distinction clearly: that page is about an
  agent connecting TO AQVEN, this page is about AQVEN connecting OUT to someone else's MCP server as a
  tool source). Cover: the `mcp/<server>.yaml` file shape, `streamable_http` as the only transport,
  header-based auth only, the two ways to attach a server to an agent (whole toolset via
  `mcp_servers:`, or one named tool via a `Tool`'s `mcp: {server, tool}` — cross-reference
  `/engine/tool-node/`, which already covers the tool-node side of this from Wave 2, don't repeat it).
  **Do not document `schema_hash` as a working validation feature** — it exists on the model but is
  never populated or checked anywhere in current code.
- [x] Real example: the showcase project's `helpdesk` MCP server (`mcp/helpdesk.yaml`) used both ways —
  verify the files still match the research doc's captured content before quoting them.
- [x] Run check, commit: `git commit -m "docs: add integrations/external-mcp-servers how-to"`.

### Task 1.3: `integrations/secrets-and-environment.md` — how-to

**Files:** Create: `apps/site/src/content/docs/integrations/secrets-and-environment.md`

Follow the how-to template: `# How to <task>` / `## When you need this` / `## Steps` / `### Example` /
`## See also`.

- [x] Frontmatter: `title: How to set a secret for a provider, tool, or MCP server`, one-sentence
  `description`.
- [x] **This is not a rewrite of `/engine/secrets/`** — read that page first, and don't repeat its
  content (the `{{CLI_COMMAND}} secrets` report, masking, source precedence — all already covered
  there and confirmed accurate). This page is the practical first-time-setup companion: the `.env` file
  AQVEN generates from `.env.example`, the `ref:env/NAME` format used identically across all three
  declaration points (provider `api_key`, tool `secrets`, MCP server `headers`), and that environment
  wins over `.env` when both are set. Link to `/engine/secrets/` for verifying what you just set.
- [x] Real example: set a value for the showcase project's real `OPENROUTER_API_KEY` (or another
  already-declared secret from this wave's other two pages, e.g. `LUMEN_HELPDESK_TOKEN`) and confirm
  it resolves — a small, real, verifiable step, not an abstract description.
- [x] Run check, commit: `git commit -m "docs: add integrations/secrets-and-environment how-to"`.

---

## Phase 2: Final verification

### Task 2.1: Full build and `llms.txt`

- [x] Run `uv run --project . python tools/generate_reference.py` first (reference has drifted at the
  start of every wave so far).
- [x] Run `pnpm --filter @aqven/site check`, then `pnpm --filter @aqven/site build`.
- [x] Run `node apps/site/scripts/generate_llms.mjs --check`.
- [x] Commit anything changed.

---

## Self-Review

**Spec coverage:** 3 pages (design doc's Integrations list) plus area intro and sidebar wiring.

**Placeholders:** none. 28 providers deliberately not enumerated one-by-one — the generated reference
already does that; this wave covers the pattern and its real exceptions.

**Consistency:** `/mcp-cli/connect-an-agent/` vs `/integrations/external-mcp-servers/` are explicitly
distinguished (two different directions of the same word "MCP"). `/engine/secrets/` vs
`/integrations/secrets-and-environment/` are explicitly distinguished (inspect vs. first-time-set).

## Next

Remaining 9 Concepts pages (Wave 6) — same process. Then the cross-wave "simplify every page's
example" pass (design doc §7), once all areas are written.

---

## Execution notes

**Status: Wave 5 complete, merged into `codex/codex-cli-studio-chat` (commit `105114d`).**

- Task 1.1's implementer found and fixed 4 dead links in `tools/generate_reference.py` pointing at
  deleted `/engineering/*` pages from the old IA (in `provider_catalog_page`, `authoring_api_page`,
  `cli_page`, `project_mcp_tools_page`) — corrected to `/integrations/model-providers/`,
  `/engine/code-node/`, `/engine/check/`, and `/mcp-cli/connect-an-agent/` respectively. Committed as
  `001cacd`, generated reference pages regenerated in the same commit.
- Reference regenerated again post-merge; only drift was a local venv absolute path leaking into
  `create_mcp_server`'s default parameter value in `python-api.md` (harmless, environment-specific, not
  a content error) — committed as `105114d`.
- Full build (72 pages) and `llms.txt --check` both clean before and after merge.
