# ADR-0033: Flow datasets and scoped runs in Studio

Status: partially amended by [ADR-0035](0035-dataset-stage-ranges.md) for the Studio dataset-run workflow (2026-09-18). `selected_nodes` retains the behavior specified below for existing API clients.

## Context

The project currently loads `Dataset` files as inputs for inference evaluations. Their `cases[].inputs` can describe a downstream inference and need not match a flow's input type. Studio lists only dataset summaries. `RunStartRequest` exposes `dataset_item_id`, but the DBOS engine rejects it. Runs always execute every top-level node in `flow.order`.

Studio needs a reusable case catalogue. The same complete case must support both a full flow run and a run focused on selected nodes without re-entering input and context.

## Decision

1. A dataset may declare a `flow` id. For such a dataset, each case's `inputs` is the **complete flow input**; each case may also carry the run `context`, `metadata`, and `expected_output`. The flow input is validated against the current flow type before a run starts. Existing inference evaluation datasets without `flow` keep their current meaning and remain visible in the catalogue.
2. Dataset selection and execution scope are separate. A run references a dataset case by `dataset_item_id` (`<dataset_id>/<case_name>`). An optional `selected_nodes` list gives target top-level nodes. If omitted, the full flow runs. If present, the engine executes the target nodes and the transitive dependencies found in compiled node references, in flow order. The request is rejected if a selected node is unknown or nested.
3. A focused run returns a map of selected node ids to their outputs. A full run retains the flow's declared output. The run-start event records the effective execution order so the trace and pending count match reality.
4. Studio has a flow-level Datasets page for browsing all datasets, their cases, and compatibility. Only flow datasets for the current flow offer the run composer. Inference datasets link to their existing evaluation workflow.
5. Dataset creation offers a schema-generated editable draft and a request to the existing project chat agent. The draft is validated before save. The chat agent writes the same project file format and runs `aqven check`; Studio opens the resulting dataset when it appears in the catalogue. No separate dataset generation service or database record is introduced.
6. Studio runs a whole dataset by starting one ordinary run per case with the same `selected_nodes`. Each result links to its own run. A failed case start does not prevent later cases from starting; Studio reports the individual error.

## Consequences

The existing evaluation dataset format and runner remain compatible. A downstream inference fixture does not silently become a flow input. Selected-node runs cannot be described as full-flow outcomes; the UI and API expose their target nodes and effective order. Dataset files remain the source of truth and must use the project's file-writing and validation rules. Dataset-wide starts are individual runs, without a persistent batch record.
