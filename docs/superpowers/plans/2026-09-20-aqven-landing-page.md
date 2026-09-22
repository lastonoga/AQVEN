# AQVEN Landing Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (or subagent-driven-development) to execute this plan task-by-task.

**Goal:** Replace the documentation splash page with a concise, customer-outcome-led AQVEN landing page using Studio screenshot placeholders as visual proof.

**Architecture:** Keep the site in Astro/Starlight. Render the landing page as one focused Astro component and add one scoped stylesheet through Starlight's `customCss` option. Adapt the selected Shadcnblocks composition in first-party markup; do not require access to third-party Pro source code or a React/Tailwind runtime.

**Tech Stack:** Astro 7, Starlight, scoped CSS, semantic HTML, vanilla JavaScript for accessible Studio evidence tabs.

---

### Task 1: Add an output-level landing-page contract

**Files:**
- Create: `site/scripts/check-landing-page.mjs`
- Modify: `site/package.json`

- [ ] Write `site/scripts/check-landing-page.mjs` before production code. It must read `site/dist/index.html` and assert that the output contains:
  - `Build AI workflows you can trust to run the business.`
  - `AQVEN makes AI-powered work reviewable and improvable.`
  - `Studio turns an unexpected result into evidence.`
  - `Open source. Free forever.`
  - the three accessible placeholder labels for Canvas, Run investigation, and Evaluation screenshots.

- [ ] Add `"landing:check": "pnpm build && node scripts/check-landing-page.mjs"` to `site/package.json`.

- [ ] Run `corepack pnpm --filter @aqven/site landing:check` and confirm it fails because the existing splash page lacks the new hero copy.

- [ ] Commit only the contract files with `git add site/package.json site/scripts/check-landing-page.mjs && git commit -m "test: define landing page output contract"`.

### Task 2: Build the page and screenshot placeholders

**Files:**
- Create: `site/src/components/AqvenLanding.astro`
- Create: `site/src/styles/aqven-landing.css`
- Modify: `site/src/content/docs/index.mdx`
- Modify: `site/astro.config.mjs`

- [ ] Create `AqvenLanding.astro` with semantic sections in this exact source order: hero, recognition/problem, Studio evidence, AQVEN supports, customer outcomes, and closing CTA.

- [ ] Put the approved message in those sections. The hero is `Build AI workflows you can trust to run the business.` and has two actions: primary `Explore AQVEN` to `/home/overview/`, and secondary `See Studio` to `/studio/`. The only repeated primary-action label is `Explore AQVEN`.

- [ ] In the hero, show a visibly labelled `Studio Canvas screenshot placeholder` panel and a smaller `Studio run investigation screenshot placeholder` panel. In the Studio section, show tabs for Canvas, Runs, and Evals with a corresponding placeholder. Every placeholder must say `Replace with a real Studio capture`; it may not mimic a dashboard, invent metrics, or be presented as a product screenshot.

- [ ] Implement the Studio tabs with buttons using `role="tab"`, panels using `role="tabpanel"`, valid `aria-selected` and `aria-controls` values, and a small module script. Click, ArrowLeft, ArrowRight, Home, and End change the selected tab. Canvas is selected initially.

- [ ] Add `aqven-landing.css` with the structure of the selected blocks: a split hero (Hero 104), vertical evidence tabs (Feature 175), one-wide-plus-two-supporting product tiles (Feature 50), a sparse four-outcome grid (Feature 364), and a single-image closing CTA (CTA 1). Use Starlight tokens, one accent color, hairline borders, and an 18px radius. At widths below 768px, stack every multi-column layout and preserve a visible keyboard focus ring.

- [ ] Add the stylesheet to Starlight's `customCss` option. Replace only the root MDX body's current splash/card content with `<AqvenLanding />`, retaining the route, title, and description.

- [ ] Run `corepack pnpm --filter @aqven/site landing:check` and confirm the test contract passes.

- [ ] Commit only the four landing files with `git add site/astro.config.mjs site/src/content/docs/index.mdx site/src/components/AqvenLanding.astro site/src/styles/aqven-landing.css && git commit -m "feat: rebuild AQVEN landing page"`.

### Task 3: Render and inspect the page

**Files:**
- Verify only: `site/dist/index.html`

- [ ] Start `corepack pnpm --filter @aqven/site preview -- --host 127.0.0.1 --port 4321`; do not replace the healthy Lumen stack on ports 5200 and 5173.

- [ ] Inspect `http://127.0.0.1:4321/` at desktop size: the hero and its actions are visible without scrolling; Canvas is the default selected tab; every screenshot panel is clearly a placeholder; no unsupported proof claims appear.

- [ ] Inspect at 390px: screenshots, support tiles, outcome cards, and closing CTA stack in a readable single column. Verify keyboard tab navigation changes panels.

- [ ] Run `corepack pnpm --filter @aqven/site check`, `corepack pnpm --filter @aqven/site build`, `corepack pnpm --filter @aqven/site landing:check`, and `git diff --check`. Commit only any inspection-driven landing-page fixes.
