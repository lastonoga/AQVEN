# Documentation Sidebar and Home Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make documentation navigation readable at every label length and explain AQVEN in language that matches AI-system engineering work.

**Architecture:** Retain Starlight, Lucode, and the current working Expressive Code configuration. The custom sidebar owns label wrapping and scroll behavior; `astro.config.mjs` owns navigation labels; the four Home Markdown pages own product language.

**Tech Stack:** Astro 7, Starlight, lucode-starlight, TypeScript, Markdown, Playwright with local Chrome.

---

### Task 1: Make sidebar labels resilient to wrapping

**Files:**
- Modify: `site/astro.config.mjs:52-240`
- Modify: `site/src/components/LucodeSidebarSublist.astro:52-72`

- [x] **Step 1: Shorten navigation labels without changing document titles**

Replace these Engineering group labels in `site/astro.config.mjs`:

```js
{ label: 'Prompts & Agents', collapsed: false, items: [...] }
{ label: 'Tools & Review', collapsed: false, items: [...] }
{ label: 'Run & Improve', collapsed: false, items: [...] }
{ label: 'Reliability & Operations', collapsed: false, items: [...] }
```

Use these recipe labels where the default titles are unnecessarily long in navigation:

```js
{ label: 'Parallel reviewers', slug: 'engineering/recipes/parallel-reviewers' }
{ label: 'Draft & review loop', slug: 'engineering/recipes/draft-and-review-loop' }
{ label: 'Process many files', slug: 'engineering/recipes/map-many-files' }
{ label: 'Compare prompts or providers', slug: 'engineering/recipes/compare-prompts-or-providers' }
```

Keep the other document labels automatic unless they exceed one line in the desktop sidebar.

- [x] **Step 2: Replace fixed row heights with minimum heights**

Use the following CSS rules in `LucodeSidebarSublist.astro`:

```css
.container-sidebar-entry { gap: 0.5rem; }
.entry-title { padding: 0.3rem 0.5rem; line-height: 1.2rem; overflow-wrap: anywhere; }
.container-group-link { gap: 0.25rem; line-height: 1.25rem; }
.entry-group-summary,
.entry-link { min-height: 2rem; height: auto; align-items: flex-start; }
.entry-group-summary { padding: 0.35rem 0.5rem; }
.entry-link-inner { width: 100%; min-height: 2rem; height: auto; align-items: flex-start; padding: 0.35rem 0.5rem; line-height: 1.25rem; overflow-wrap: anywhere; }
.entry-group-caret { margin-top: 0.15rem; margin-right: 0; }
```

Keep active and hover backgrounds on `.entry-link-inner`, which now occupies full width and grows with wrapped content.

- [x] **Step 3: Verify long labels in a browser**

Run a Playwright script against `/engineering/recipes/parallel-reviewers/` and assert that the selected sidebar item has `scrollHeight <= clientHeight`, its parent has a height of at least `40px` when wrapped, and no sibling overlaps it. Repeat on `/home/overview/` for the Home group.

Expected: all assertions pass and browser console errors are empty.

### Task 2: Rewrite the Documentation Home pages

**Files:**
- Modify: `site/src/content/docs/home/overview.md`
- Modify: `site/src/content/docs/home/ai-documentation.md`
- Modify: `site/src/content/docs/home/glossary.md`
- Modify: `site/src/content/docs/home/whats-new.md`

- [x] **Step 1: Rewrite `overview.md` around users and outcomes**

Open with: `AQVEN is an engineering environment for AI systems.` Explain that it helps developers define, understand, validate, test, debug, and evolve AI behavior as a system. Include titled sections for: the work that becomes difficult as systems grow; primary users; jobs users need to complete; outcomes AQVEN aims to provide; how AQVEN fits with Pydantic AI, DBOS, providers, tools, and application infrastructure; and direct paths to Engineering, Studio, and AI-assisted work.

- [x] **Step 2: Rewrite the AI, glossary, and release pages in the same language**

`ai-documentation.md` explains that an agent needs a current semantic view of flows, types, prompts, models, tools, evaluation cases, and project rules before it makes a change. Keep the ordered paths through `llms.txt`, focused guides, generated references, and Project MCP.

`glossary.md` adds a two-sentence introduction saying shared terms allow engineers and coding agents to describe the same system boundary and review a change without reconstructing the repository.

`whats-new.md` describes release notes as an impact record, upgrade guides as a source-file and verification path, and breaking changes as a named contract with a replacement and removal version.

- [x] **Step 3: Check links and generated documentation**

Run:

```bash
corepack pnpm --dir site build
```

Expected: reference check passes, 178 AI Markdown pages and `llms.txt` regenerate, Astro diagnostics report `0 errors` and `0 warnings`, and the static build completes.

### Task 3: Final browser and source review

**Files:**
- Verify: `site/src/components/ManualSidebar.astro`
- Verify: `site/src/components/LucodeSidebarSublist.astro`
- Verify: `site/src/content/docs/home/*.md`

- [x] **Step 1: Run the desktop interaction check**

Open `/home/overview/`, `/engineering/flows/`, and `/engineering/recipes/parallel-reviewers/` at `1440×900`. Confirm the sidebar persists its scroll position, the Home group appears, section headings and links wrap without clipping or overlap, and navigation stays interactive.

- [x] **Step 2: Validate source formatting**

Run:

```bash
git diff --check
```

Expected: no output and exit code `0`.

- [x] **Step 3: Preserve the focused documentation diff for the active documentation rebuild**

The current checkout contains the broader, still-uncommitted documentation rebuild that this refinement depends on. Keep this focused diff in that working set instead of making a partial commit that would include unrelated documentation changes.
