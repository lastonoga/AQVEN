# Runs Option Hierarchy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the tag-heavy Runs dropdown option with the approved, compact three-line record while preserving search, selection, and the closed trigger.

**Architecture:** Keep `RunsStrip`'s existing shadcn Command/Popover and the API data it already receives. Change only `RunOption` presentation and the test assertions for that presentation. No new dependencies, routes, API requests, or backend changes.

**Tech Stack:** React 19, TypeScript, Tailwind CSS v4, shadcn Command/Popover, the local Studio `Tag` and `Text` primitives, Vitest and Testing Library.

**Worktree safety:** The active checkout contains untracked Studio files used by the running dev stack. Implement in the current checkout without resetting, cleaning, or committing implementation files.

---

### Task 1: Lock the approved option hierarchy in a regression test

**Files:**
- Modify: `apps/studio/src/features/runs/runs-screen.test.tsx`

- [ ] **Step 1:** In the existing “keeps the selected run compact” test, retain the closed-trigger assertions and the MSW run summaries. After opening the picker, assert that the selected option has exactly one rendered `Tag` (`.inline-flex.border.font-mono`), that `bulb_app_offline_advice` is the main line, and that `support_case_cases` appears on a different line below it. Assert that `prepare, triage` is visible as plain supporting text, while the item title retains the full case and node scope. For an older summary, assert “No dataset” and “Entire flow” remain visible. Keep the search assertions by node, dataset, and case and the existing route-switching test.
- [ ] **Step 2:** Run `corepack pnpm --dir apps/studio exec vitest run src/features/runs/runs-screen.test.tsx -t 'selected run compact' --maxWorkers=4 --reporter=dot`. Confirm it fails because the current option renders several tags and the case is not the primary line.

### Task 2: Implement the approved record layout

**Files:**
- Modify: `apps/studio/src/features/runs/runs-strip.tsx`

- [ ] **Step 1:** Keep the trigger, `CommandItem` value, title, `onSelect`, and search filter intact. Derive a displayed node scope from the first three selected nodes, appending `+N` for additional nodes; keep the complete scope in `value` and `title`.
- [ ] **Step 2:** Render a single status `Tag` beside the short ID and relative time. Render `caseName ?? dataset ?? t("pickerNoDataset")` as the prominent second line. Render the dataset ID only when there is a separate case, followed by node scope and mode on a muted, wrapping third line. Replace dataset/case/node/mode tags with text. Add a subtle selected left edge using `data-tone={row.tone}`, while preserving `data-checked` and `aria-current`.
- [ ] **Step 3:** Run the focused test from Task 1 and the full `runs-screen.test.tsx`; confirm both pass.

### Task 3: Verify behavior and the rendered result

**Files:**
- No additional production files.

- [ ] **Step 1:** Run `corepack pnpm --dir apps/studio exec vitest run --maxWorkers=4 --reporter=dot`, `corepack pnpm --dir apps/studio typecheck`, `corepack pnpm --dir apps/studio build`, and scoped ESLint on the two changed Runs files. Run `git diff --check`.
- [ ] **Step 2:** Reuse the existing Vite server on port 5200. Open `/flows/support_case/runs` in a headless browser, inspect an expanded real run option for the three-line hierarchy, verify the closed trigger remains compact, and capture a screenshot of the option for visual review. Do not start a second dev stack.
