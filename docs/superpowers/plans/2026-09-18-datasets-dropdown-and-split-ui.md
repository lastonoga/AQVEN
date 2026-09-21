# Datasets Dropdown and Split UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Datasets left list with a dropdown whose closed value is compact and open items retain their details, while removing split controls only from the Datasets UI.

**Architecture:** Keep the current `/flows/$flowId/datasets` loader and `?dataset=` navigation. Replace the `DatasetList` panel in `datasets-screen.tsx` with a `Popover`/`Command` picker, then render the selected dataset's existing content as a full-width column. Keep backend split metadata and Evals unchanged; the case list always requests the unfiltered dataset.

**Tech Stack:** React 19, TanStack Router, shadcn/ui Command and Popover, use-intl, Vitest/Testing Library, MSW, TypeScript.

**Worktree safety:** This checkout contains extensive pre-existing staged and unstaged changes that an isolated checkout would omit. Do not reset, clean, or commit implementation files. Commit only a dedicated design document when required by the brainstorming skill.

---

### Task 1: Dataset picker and full-width content

**Files:**
- Modify: `apps/studio/src/features/datasets/datasets-screen.test.tsx`
- Modify: `apps/studio/src/features/datasets/datasets-screen.tsx`
- Modify: `apps/studio/src/i18n/messages/en/datasets.json`

- [ ] **Step 1: Write failing route tests.** In `datasets-screen.test.tsx`, load `/flows/support_case/datasets?dataset=support_case_cases&case=strip_flicker_credit`, assert the closed `combobox` named `Selected dataset support_case_cases` contains only the active dataset ID, then open it and assert two `option` rows expose IDs, case counts, and `Flow · support_case` or `Inference evaluation`. Search `reply_cases` and verify one option remains. Select it and assert `router.state.location.search` equals `{ dataset: "reply_cases" }`, with no `case` or `batch`. Assert the old dataset list panel is absent and the selected dataset details remain visible.

```tsx
it("uses a detailed dataset picker with a compact active value", async () => {
  const router = await renderRoute("/flows/support_case/datasets?dataset=support_case_cases&case=strip_flicker_credit")
  const trigger = await screen.findByRole("combobox", { name: "Selected dataset support_case_cases" })
  expect(trigger.textContent).toContain("support_case_cases")
  expect(trigger.textContent).not.toContain("3 cases")
  fireEvent.click(trigger)
  const list = await screen.findByRole("listbox", { name: "Datasets in this project" })
  expect(within(list).getByRole("option", { name: /support_case_cases.*3 cases.*Flow · support_case/u })).toBeTruthy()
  expect(within(list).getByRole("option", { name: /reply_cases.*3 cases.*Inference evaluation/u })).toBeTruthy()
  fireEvent.change(screen.getByRole("combobox", { name: "Search datasets" }), { target: { value: "reply_cases" } })
  expect(within(list).getAllByRole("option")).toHaveLength(1)
  fireEvent.click(within(list).getByRole("option", { name: /reply_cases/u }))
  await waitFor(() => { expect(router.state.location.search).toEqual({ dataset: "reply_cases" }) })
  expect(screen.queryByRole("heading", { name: "Datasets" })).toBeNull()
})
```
- [ ] **Step 2: Verify red.** Run `corepack pnpm --dir apps/studio exec vitest run src/features/datasets/datasets-screen.test.tsx -t 'dataset picker' --maxWorkers=4 --reporter=dot`. Expect failure because the page has a sidebar and no dataset combobox.
- [ ] **Step 3: Replace the list with a picker.** In `datasets-screen.tsx`, replace `DatasetList` with `DatasetPicker`. The trigger uses `Button` with `role="combobox"`, `aria-expanded`, `aria-label={t("pickerSelected", { id: selected.dataset_id })}`, the active dataset ID, and `ChevronDown`. The popover uses the existing `Command`, `CommandInput`, `CommandList`, `CommandEmpty`, and `CommandItem`; each option keeps dataset ID, case count, and flow/inference/current-flow metadata from `DatasetList`. Its `value` includes the full dataset ID; `onSelect` navigates with `{ dataset: item.dataset_id }` and closes the popover. Keep `data-checked` and `aria-current` on the active row. Place the picker on the left and Create action on the right of the page header; remove the two-column grid so the details below are full width.

```tsx
function DatasetPicker({ items, selected, flowId }: {
  readonly items: readonly ApiDatasetSummary[]
  readonly selected: ApiDatasetSummary | null
  readonly flowId: FlowId
}) {
  const [open, setOpen] = useState(false)
  const params = datasetsRouteApi.useParams()
  const navigate = useNavigate()
  const t = useTranslations("datasets")
  const choose = (id: string): void => {
    setOpen(false)
    void navigate({ to: ROUTE_PATH.datasets, params, search: { dataset: id } })
  }
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" role="combobox" aria-expanded={open}
          aria-label={selected === null ? t("title") : t("pickerSelected", { id: selected.dataset_id })}
          className="w-64 min-w-0 justify-between">
          <span className="truncate">{selected?.dataset_id ?? t("title")}</span><ChevronDown aria-hidden className="size-3" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="dark w-80 max-w-[calc(100vw-2rem)] gap-0 p-1">
        <Command label={t("pickerSearch")}>
          <CommandInput placeholder={t("pickerSearchPlaceholder")} />
          <CommandList label={t("pickerListAria")}>
            <CommandEmpty>{t("pickerNoMatches")}</CommandEmpty>
            {items.map((item) => (
              <CommandItem key={item.dataset_id} value={item.dataset_id} onSelect={() => { choose(item.dataset_id) }}
                data-checked={item.dataset_id === selected?.dataset_id}
                aria-current={item.dataset_id === selected?.dataset_id ? "true" : undefined}
                className="min-h-14 cursor-pointer rounded-md px-3 py-2">
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-2">
                    <span className="truncate font-medium">{item.dataset_id}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">{t("cases", { count: item.cases })}</span>
                  </span>
                  <Text as="span" role="meta" tone="neutral" className="mt-1 block">
                    {item.flow_id == null ? t("inference") : t("forFlow", { flow: item.flow_id })}
                    {item.flow_id === flowId ? ` · ${t("current")}` : ""}
                  </Text>
                </span>
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
```

Place `<DatasetPicker items={datasets} selected={selected} flowId={flowId} />` before the Create button in the `Page.header` flex row, and render the existing selected-dataset branch directly inside `Page` without the `lg:grid-cols-[290px_minmax(0,1fr)]` wrapper.
- [ ] **Step 4: Add copy.** Add `pickerSelected`, `pickerSearch`, `pickerSearchPlaceholder`, and `pickerNoMatches` to `apps/studio/src/i18n/messages/en/datasets.json`. Do not add compact styling to the menu rows; only the closed trigger is compact.

```json
"pickerSelected": "Selected dataset {id}",
"pickerListAria": "Datasets in this project",
"pickerSearch": "Search datasets",
"pickerSearchPlaceholder": "Search by dataset ID...",
"pickerNoMatches": "No matching datasets"
```
- [ ] **Step 5: Verify green.** Re-run `datasets-screen.test.tsx`. Existing case selection and grouped-run URL behavior must still pass.

### Task 2: Remove split from Datasets browsing

**Files:**
- Modify: `apps/studio/src/features/datasets/datasets-screen.test.tsx`
- Modify: `apps/studio/src/features/datasets/case-list.tsx`
- Modify: `apps/studio/src/features/datasets/datasets-screen.tsx`
- Modify: `apps/studio/src/i18n/messages/en/datasets.json`

- [ ] **Step 1: Write failing tests.** With the existing `support_case_cases` fixture (train/dev/test cases), assert the Datasets page has no `Filter by split` combobox, `Split` column header, or `Split: ...` case-detail description. Click `Select all 3 matching` and assert `3 selected`. Assert the request for case names is not split-filtered by using the resulting selection count.

```tsx
it("shows every case without split controls", async () => {
  await renderRoute("/flows/support_case/datasets?dataset=support_case_cases")
  const cases = await screen.findByRole("table", { name: "Cases" })
  expect(screen.queryByRole("combobox", { name: "Filter by split" })).toBeNull()
  expect(within(cases).queryByRole("columnheader", { name: "Split" })).toBeNull()
  expect(screen.queryByText(/^Split: /u)).toBeNull()
  fireEvent.click(await screen.findByRole("button", { name: "Select all 3 matching" }))
  expect(await screen.findByText("3 selected")).toBeTruthy()
})
```
- [ ] **Step 2: Verify red.** Run `corepack pnpm --dir apps/studio exec vitest run src/features/datasets/datasets-screen.test.tsx -t 'split controls' --maxWorkers=4 --reporter=dot`. Expect the split filter/column assertion to fail.
- [ ] **Step 3: Simplify case loading.** Remove `split`, `chooseSplit`, the split `<select>`, and the split table column from `case-list.tsx`. Use `api.evals.datasetCasesPage(dataset.dataset_id, query || null, null, cursor)` and `api.evals.datasetCaseNames(dataset.dataset_id, query || null, null)`. Keep search, paging, row selection, and loading/error states. Change the empty/loading table rows from `colSpan={3}` to `colSpan={2}`.

```tsx
const requestKey = JSON.stringify([dataset.dataset_id, query, cursor])
void api.evals.datasetCasesPage(dataset.dataset_id, query || null, null, cursor).then(
  (result) => { if (active) setResponse({ key: requestKey, page: result, error: null }) },
  (reason: unknown) => { if (active) setResponse({ key: requestKey, page: null, error: reason instanceof Error ? reason.message : String(reason) }) },
)
onSelect(await api.evals.datasetCaseNames(dataset.dataset_id, query || null, null))
```

The table header becomes `Select case` plus `Case name`; body rows keep checkbox and case link only, and empty/loading rows use `colSpan={2}`.
- [ ] **Step 4: Remove case-detail label.** In `datasets-screen.tsx`, remove the `metadata.split`-derived description from the Run context panel while keeping the context JSON unchanged.

```tsx
<TitledPanel size="block" title={t("context")} surface="raised">
  {item.context === null || item.context === undefined ? (
    <Text as="p" role="hint" tone="neutral" className="p-4">{t("noContext")}</Text>
  ) : <pre className="max-h-96 overflow-auto p-4 font-mono text-xs leading-relaxed">{pretty(item.context)}</pre>}
</TitledPanel>
```
- [ ] **Step 5: Verify green.** Re-run `datasets-screen.test.tsx` and the existing Datasets tests.

### Task 3: Remove split from new flow-dataset editing

**Files:**
- Modify: `apps/studio/src/features/datasets/dataset-create.test.tsx`
- Modify: `apps/studio/src/features/datasets/dataset-create.tsx`
- Modify: `apps/studio/src/i18n/messages/en/datasets.json`

- [ ] **Step 1: Write a failing create test.** Load `/flows/support_case/datasets?create=true`, assert that no field named `Split` is rendered, enter `dataset_id` as `fresh_cases`, and intercept `POST /api/datasets` to assert each case is submitted without a split value in `metadata`.

```tsx
it("creates a flow dataset without split fields", async () => {
  let submitted: unknown = null
  server.use(http.post(`${API_BASE}/datasets`, async ({ request }) => {
    submitted = await request.json()
    return HttpResponse.json({
      dataset_id: "fresh_cases",
      flow_id: "support_case",
      path: "datasets/fresh_cases.yaml",
      file_hash: "sha256-test",
      cases: 1,
      splits: {},
      used_by: [],
    }, { status: 201 })
  }))
  await renderRoute("/flows/support_case/datasets?create=true")
  expect(screen.queryByLabelText("Split")).toBeNull()
  fireEvent.change(await screen.findByLabelText("Dataset ID"), { target: { value: "fresh_cases" } })
  fireEvent.click(screen.getByRole("button", { name: "Save dataset" }))
  await waitFor(() => { expect(submitted).toMatchObject({ cases: [{ metadata: null }] }) })
})
```
- [ ] **Step 2: Verify red.** Run `corepack pnpm --dir apps/studio exec vitest run src/features/datasets/dataset-create.test.tsx -t 'without split' --maxWorkers=4 --reporter=dot`. Expect failure because the current editor renders a Split select.
- [ ] **Step 3: Simplify the draft.** Remove the `Split` type, `split` field in `CaseDraft`, `SPLITS`, `parsedSplit`, `splitOf`, and the Split select from `dataset-create.tsx`. Keep the case input and context editors. Submit `metadata: null` for new flow-dataset cases; do not modify any existing dataset file or backend schema.

```tsx
type CaseDraft = {
  readonly id: number
  readonly name: string
  readonly inputText: string
  readonly contextText: string
}

const initialCases = (file: ApiDatasetFile): readonly CaseDraft[] => file.cases.map((item, index) => ({
  id: index + 1,
  name: item.name,
  inputText: JSON.stringify(item.inputs, null, 2),
  contextText: JSON.stringify(item.context ?? {}, null, 2),
}))

const parsed: ApiDatasetCase[] = values.flatMap(({ item, input, context }) => {
  if (input === null || context === null) return []
  return [{ name: item.name.trim(), inputs: input, context, metadata: null }]
})
```
- [ ] **Step 4: Remove unused Datasets copy.** Delete `filterSplit`, `allSplits`, `splitColumn`, `split`, `splitEdit`, `unassigned`, `train`, `dev`, and `test` from `apps/studio/src/i18n/messages/en/datasets.json` only if no Datasets component still references them. Leave Evals messages and metadata handling intact.

```json
"searchCases": "Search cases",
"selectCase": "Select case",
"selectNamedCase": "Select {name}",
"context": "Run context",
"noContext": "No context stored"
```
- [ ] **Step 5: Verify green.** Re-run `dataset-create.test.tsx` and `datasets-screen.test.tsx`.

### Task 4: Integration checks

**Files:** No production changes unless a failing check identifies a task-specific defect.

- [ ] **Step 1: Run Studio tests.** `corepack pnpm --dir apps/studio exec vitest run --maxWorkers=4 --reporter=dot` must pass, including the existing Evals split-count test.
- [ ] **Step 2: Run code checks.** `corepack pnpm --dir apps/studio typecheck`, `corepack pnpm --dir apps/studio build`, `corepack pnpm --dir apps/studio check:api`, and scoped ESLint on changed Datasets files must pass. Record unrelated repository-wide lint failures separately.
- [ ] **Step 3: Inspect changes.** Run `git diff --check`, inspect only task files, and leave the checkout's pre-existing staged/unstaged changes intact. If a Studio UI server is already running, verify the selector and split removal there without starting a second dev stack.

## Execution status — 2026-09-18

Tasks 1–3 were implemented. Focused Datasets and Evals tests pass (25/25); scoped ESLint, API schema check, and `git diff --check` pass. The full Studio suite has two failures outside the changed Datasets files (Flow canvas and Runs dataset dialog). The production bundle builds, but its TypeScript phase and the standalone typecheck fail in the separately edited Flow inspector/canvas files. No second dev stack was started for visual QA. The 702 pre-existing staged files were left untouched.
