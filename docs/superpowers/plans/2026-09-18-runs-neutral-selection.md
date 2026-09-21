# Runs Neutral Selection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the checked Runs option obvious on the dark menu without a status-colored border.

**Architecture:** Keep the existing `CommandItem`, check icon, status `Tag`, and navigation behavior. Change only the Runs option's selected/highlighted styling and text contrast; use the existing dark-theme tokens instead of a new dependency or global component variant.

**Tech Stack:** React, TypeScript, Tailwind CSS v4, shadcn-style `CommandItem`, Vitest, Testing Library, Playwright for rendered QA.

---

### Task 1: Selection-state regression

**Files:**
- Modify: `apps/studio/src/features/runs/runs-screen.test.tsx`
- Modify: `apps/studio/src/features/runs/runs-strip.tsx`

- [x] **Step 1: Add a failing assertion to the existing expanded-option test**

After `selectedOption` is obtained, assert that its `data-checked` is `true`, that the row has no `data-tone`, that its class does not contain `border-l`, and that the selected dataset text uses `text-foreground`. Assert that its class includes the checked neutral-fill variant:

```ts
expect(selectedOption.getAttribute("data-checked")).toBe("true")
expect(selectedOption.getAttribute("data-tone")).toBeNull()
expect(selectedOption.className).not.toContain("border-l")
expect(selectedOption.className).toContain("data-[checked=true]:bg-[color-mix")
expect(datasetLabel.className).toContain("text-foreground")
```

- [x] **Step 2: Confirm the regression fails for the current menu**

Run: `corepack pnpm --dir apps/studio exec vitest run src/features/runs/runs-screen.test.tsx -t 'selected run compact' --reporter=dot`

Expected: fail on the current status-toned row and muted supporting text.

- [x] **Step 3: Apply the minimal option styling**

In `RunOption`, remove `data-tone={row.tone}` and all left-border utilities from `CommandItem`. Keep `data-checked` and `aria-current`. Replace `data-[checked=true]:bg-muted` with `data-[checked=true]:bg-[color-mix(in_oklab,var(--popover)_70%,var(--foreground))]`. Override the shadcn `data-selected:bg-muted` with `data-selected:bg-[color-mix(in_oklab,var(--popover)_80%,var(--foreground))]`, and retain the checked fill when the checked item is keyboard-highlighted. Use `tone={row.selected ? "default" : "neutral"}` on time and supporting text. Keep the status `Tag`'s `tone={row.tone}`.

- [x] **Step 4: Confirm the regression passes**

Run: `corepack pnpm --dir apps/studio exec vitest run src/features/runs/runs-screen.test.tsx --reporter=dot`

Expected: all Runs screen tests pass.

### Task 2: Rendered and suite verification

**Files:**
- No additional source files.

- [x] **Step 1: Inspect the live menu**

Reuse the existing Studio at `http://127.0.0.1:5200/flows/support_case/runs`. Open the picker, verify selected background is visibly lighter than the menu and the unchecked row; selected left border is absent; the check remains white; supporting text is readable; keyboard-highlighted rows are distinguishable. Capture a screenshot.

- [x] **Step 2: Run broader checks**

Run focused ESLint on the two Runs files, `corepack pnpm --dir apps/studio build`, and `corepack pnpm --dir apps/studio exec vitest run --reporter=dot`. Run `git diff --check` and inspect the exact changed files. Do not stage or commit the large pre-existing dirty worktree.

Verification result: Runs tests 39/39, targeted ESLint, build, and `git diff --check` passed. The full Studio suite had 429/430 passing; the sole failure is the unrelated Datasets table test that expects the first header to be “Case name” but receives “Select case.” It also fails when run alone. Live browser inspection showed selected `oklab(0.4625 0 0)` versus keyboard-highlight `oklab(0.39 0 0)`, 0px left border, and white check/text.
