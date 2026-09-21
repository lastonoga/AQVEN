# Expanded Runs Options Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep the selected Runs value compact while making expanded options identify each run by dataset, case, and node scope.

**Architecture:** Add saved scope fields to Python `RunSummary`, which is already returned by `GET /api/runs`, then regenerate Studio's OpenAPI contract. Render the fields only in the existing shadcn Command options. Keep the current route, selection behavior, selected-run details, and closed trigger unchanged.

**Tech Stack:** Python 3.14, Pydantic, FastAPI/OpenAPI, React 19, TypeScript, shadcn Command/Popover, Vitest, pytest.

**Worktree safety:** The active checkout has extensive pre-existing staged and untracked code required by the running Studio. Do not create an isolated checkout, reset, clean, or commit implementation files.

---

### Task 1: Return scope in run summaries

**Files:**
- Modify: `aqven-py/packages/aqven/tests/engine/core/test_engine_core_runs.py`
- Modify: `aqven-py/packages/aqven/src/aqven/runtime/runs.py`
- Modify: `aqven-py/packages/aqven/src/aqven/engine/facade.py`

- [ ] **Step 1: Write the failing test.** In `test_selected_run_executes_dependencies_and_returns_selected_outputs`, start the run through `facade.launch` with `RunSpec(flow_id=FlowId("relay"), mode="replay", dataset_item_id="support_case_cases/bulb_app_offline_advice", selected_nodes=(NodeId("route"),))` and input `LOW`. Return the first item from `facade.list_runs(RunListQuery(flow_id=FlowId("relay")))` alongside the record and snapshot. Assert `summary.dataset_item_id == "support_case_cases/bulb_app_offline_advice"` and `summary.selected_nodes == ("route",)`; keep the existing snapshot assertions.
- [ ] **Step 2: Verify red.** Run `uv run --project aqven-py pytest aqven-py/packages/aqven/tests/engine/core/test_engine_core_runs.py -k selected_run -q`; the summary should not expose `selected_nodes`.
- [ ] **Step 3: Implement.** Add `dataset_item_id: str | None = None` and `selected_nodes: tuple[NodeId, ...] | None = None` to `RunSummary`. Remove the duplicate declarations from `RunSnapshot`. In `RunRecordView.summary`, set both from `self.call.spec`; in `RunRecordView.snapshot`, remove explicit `dataset_item_id=` and `selected_nodes=` because `summary.model_dump()` now supplies them.

```diff
@@ class RunSummary(ResourceModel):
     lineage: Lineage | None
+    dataset_item_id: str | None = None
+    selected_nodes: tuple[NodeId, ...] | None = None

@@ class RunSnapshot(RunSummary):
-    dataset_item_id: str | None = None
-    selected_nodes: tuple[NodeId, ...] | None = None

@@ RunRecordView.summary:
             lineage=Lineage(relation="fork", parent_run_id=RunId(forked_from)) if forked_from else None,
+            dataset_item_id=self.call.spec.dataset_item_id,
+            selected_nodes=self.call.spec.selected_nodes,

@@ RunRecordView.snapshot:
             **summary.model_dump(),
-            dataset_item_id=self.call.spec.dataset_item_id,
-            selected_nodes=self.call.spec.selected_nodes,
             execution_id=self.run_id,
```

- [ ] **Step 4: Verify green.** Re-run the focused test and `aqven-py/packages/aqven/tests/server/test_server_runs.py` to confirm list and snapshot serialization.

### Task 2: Update the API contract and fixture

**Files:**
- Modify: `apps/studio/src/api/openapi.json`
- Modify: `apps/studio/src/api/schema.d.ts`
- Modify: `apps/studio/src/mocks/data/runs.ts`

- [ ] **Step 1: Regenerate the contract.** Use `aqven.server.openapi.export_openapi` through the project Python environment to generate `apps/studio/src/api/openapi.json`, then run `corepack pnpm --dir apps/studio exec openapi-typescript src/api/openapi.json -o src/api/schema.d.ts`. Check that `RunSummary` gains optional `dataset_item_id` and `selected_nodes`, while `RunSnapshot` retains the inherited fields.
- [ ] **Step 2: Add realistic fixture scope.** Set the newest support-case run summary's `dataset_item_id` to `support_case_cases/bulb_app_offline_advice` and `selected_nodes` to `["prepare", "triage"]`. Leave other summaries without fields to exercise old-summary fallbacks.
- [ ] **Step 3: Verify consistency.** Run `corepack pnpm --dir apps/studio check:api` and the Python OpenAPI contract test.

### Task 3: Expand only the open menu rows

**Files:**
- Modify: `apps/studio/src/features/runs/runs-screen.test.tsx`
- Modify: `apps/studio/src/features/runs/runs-strip.tsx`
- Modify: `apps/studio/src/i18n/messages/en/runs.json`

- [ ] **Step 1: Change the existing regression test before implementation.** Keep assertions that the closed combobox contains only run ref/status. After opening, assert the first option contains the dataset ID, case, and `prepare, triage`. Assert an old summary shows `No dataset` and `Entire flow`. Search for `prepare`, then for `support_case_cases`, and confirm the matching option remains.
- [ ] **Step 2: Verify red.** Run `corepack pnpm --dir apps/studio exec vitest run src/features/runs/runs-screen.test.tsx -t 'run picker' --maxWorkers=4 --reporter=dot`; detailed-option assertions must fail because `RunOption` currently renders only status/mode/time.
- [ ] **Step 3: Implement.** Keep the trigger JSX unchanged. In `RunOption`, include the metadata in `value` for search and render two additional lines. Render `No dataset` and `Entire flow` for nullish values. Set a title with the untruncated dataset/case and node list; use `truncate` only on the visual text. Widen only `PopoverContent` to `w-96` and increase option min-height to fit the lines.

```tsx
const dataset = row.run.dataset_item_id ?? t("pickerNoDataset")
const scope = row.run.selected_nodes?.length ? row.run.selected_nodes.join(", ") : t("dataset.wholeFlow")
const datasetLine = t("pickerDataset", { dataset })
const scopeLine = t("pickerScope", { scope })
<CommandItem
  value={`${row.ref} ${row.id} ${status(row.run.status)} ${mode(row.run.mode)} ${dataset} ${scope}`}
  title={`${datasetLine} · ${scopeLine}`}
  onSelect={() => { onSelect(row.id) }}
  data-checked={row.selected}
  aria-current={row.selected ? "true" : undefined}
  className="min-h-20 cursor-pointer gap-2 rounded-md px-3 py-2.5 data-[checked=true]:bg-muted"
>
  <Dot tone={row.tone} />
  <span className="min-w-0 flex-1">
    <span className="flex items-center justify-between gap-2">
      <Text role="item" tone="default" weight="semibold">{row.ref}</Text>
      <Text role="hint" tone="neutral">{relative(row.startedAt)}</Text>
    </span>
    <Text as="span" role="cell" tone="neutral" className="mt-1 block truncate">
      <MetaLine parts={[status(row.run.status), mode(row.run.mode)]} />
    </Text>
    <Text as="span" role="cell" tone="neutral" truncate className="mt-1 block">{datasetLine}</Text>
    <Text as="span" role="cell" tone="neutral" truncate className="mt-0.5 block">{scopeLine}</Text>
  </span>
</CommandItem>
```

- [ ] **Step 4: Verify green.** Re-run `runs-screen.test.tsx`, and ensure selecting an item still updates `?run=`.

### Task 4: Final verification

- [ ] **Step 1:** Run focused Python, Runs, Datasets, and Evals tests; scoped Ruff/ESLint; `check:api`; and `git diff --check`.
- [ ] **Step 2:** Run Studio typecheck/build and the full test suite. Report any failures in files outside this change without editing them.
- [ ] **Step 3:** Confirm the active Vite server serves a `runs-strip.tsx` module containing the new option labels; do not restart or duplicate the shared dev stack.
