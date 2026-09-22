# AQVEN Documentation Foundation Implementation Plan

> **For agentic workers:** This plan is executed inline in the current task. The site and project files are shared with active work, so avoid changing unrelated areas.

**Goal:** Publish a useful first documentation corpus with separate Engineering and Studio navigation, accurate examples, and a clear Pydantic AI and DBOS architecture.

**Architecture:** Keep one Astro Starlight site. Give each manual its own landing page and sidebar selected by URL. Write short Markdown pages around actual commands, Lumen files, and current Studio screens; link between code and UI views.

**Tech Stack:** Astro, Starlight, Markdown/MDX, AQVEN Python CLI, Pydantic AI, DBOS, Studio React UI.

---

### Task 1: Navigation and entry points

**Files:** `site/astro.config.mjs`, `site/src/components/ManualSidebar.astro`, `site/src/content/docs/index.mdx`, `site/src/content/docs/engineering/index.md`, `site/src/content/docs/studio/index.md`.

- [x] Define both manual sidebars from real page slugs.
- [x] Select the relevant sidebar from the current route and show links to both manuals.
- [x] Replace the under-construction homepage with two clear entry points.

### Task 2: Engineering manual

**Files:** `site/src/content/docs/engineering/*.md`.

- [x] Write getting started, architecture, project layout, flow/node, model, prompt, type, tool, evaluation, runtime, agent, example, and CLI pages.
- [x] Use copied, short examples from Lumen or the actual CLI signatures. Explain where Pydantic AI and DBOS primitives enter the runtime.
- [x] Cross-link to the matching Studio page when a UI view exists.

### Task 3: Studio manual

**Files:** `site/src/content/docs/studio/*.md`.

- [x] Document setup, canvas, runs, datasets, evaluation results, human review, settings, and a Lumen walkthrough based on current UI.
- [x] Avoid presenting inspect-only surfaces as editors or implying evaluations can be started in the UI.

### Task 4: Verify

**Files:** Docs and site config above.

- [x] Run `corepack pnpm --filter @aqven/site build` from the repository root and fix any errors.
- [x] Check local links and page output, scan published pages for placeholders, and review the final diff.
