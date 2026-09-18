# Datasets selector and split UI

> Approved in conversation on 2026-09-18. Scope: the flow-level Studio Datasets page, not the evaluation schema or backend dataset format.

## Goal

Replace the left dataset list with a dropdown so the selected dataset's content can use the page width. Only the closed control is compact. The open menu keeps the useful detail currently shown in the list. Remove split controls from the Datasets workflow without deleting split data used by existing evaluations.

## Decision

| Approach | Decision |
|---|---|
| Searchable popover using the existing Command/Popover components | Chosen. It supports descriptive menu items and keyboard search without a new dependency. |
| Native select | Rejected. Its options cannot retain the current case count and flow association layout. |
| Collapsible left sidebar | Rejected. It still reserves page width and adds another visibility state. |

The selector sits in the page header next to the existing Create flow dataset action. When closed, it shows the active dataset ID and a chevron only. When open, each option shows the dataset ID, case count, and whether it belongs to a flow or to inference evaluations, including the current-flow marker already present in the left list. Options have comfortable row height; only the trigger is compact. The menu supports search by dataset ID, keyboard selection, an active-item indicator, and an empty-search state.

Selecting a dataset navigates to `/flows/<flow>/datasets?dataset=<id>`, clearing the previous `case`, `batch`, and `create` selection as the current list does. Direct dataset/case/batch links remain valid. When no dataset is selected or none exist, keep the current route fallback and empty state. The selected dataset summary, cases, case detail, run controls, and grouped runs render in one full-width column instead of a grid beside a list. No extra API requests are introduced by opening the menu.

## Split boundary

`split` is case metadata (for example train/dev/test), not a separate dataset. The Datasets page currently exposes it in the case filter, case table column, case-detail label, and new-dataset editor. Remove those four UI surfaces. Case loading and “select all matching” operate across all cases of the selected dataset, passing no split filter. Newly created flow-dataset cases do not ask for or add split metadata. Browsing an existing dataset never rewrites its file.

Keep the backend split query parameter, stored case metadata, Evals split counts, and evaluation definitions that name train/dev splits. A full data-model migration to multiple evaluation datasets is outside this change.

## Verification

Tests cover a compact active-value trigger; detailed, searchable open options; switching datasets and clearing stale case/batch URL state; the full-width layout; no split controls on the Datasets page; unchanged case selection and batch starts; and existing evaluation split displays. Run the Studio test suite, typecheck, build, scoped lint, and API consistency check. Existing route-level loading and error handling remain in force.
