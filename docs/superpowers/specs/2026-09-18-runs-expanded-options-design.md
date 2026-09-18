# Expanded Runs menu options

> Approved by the owner on 2026-09-18. This updates only the expanded Runs menu; the closed selection stays compact.

## Goal

The closed Runs selector shows the short run ID and status. Opening it shows enough context to distinguish runs: ID, status, relative time, dataset and case, and selected node scope. Existing run-page details remain unchanged.

## Data and behavior

Add optional `dataset_item_id` and `selected_nodes` to `RunSummary`, populated from the same saved run spec already used by `RunSnapshot`. This avoids a separate snapshot request for every menu item. Older summaries without these fields remain valid: show “No dataset” and “Entire flow” when values are absent or null. `selected_nodes` describes the requested scope, not a claim that each node executed successfully.

The expanded option is taller and wider than today. Its first line retains short ID, status, and relative time. Subsequent lines show dataset/case and selected nodes; long node lists truncate visually, with full content available in the option's accessible name, title, and search value. Search matches run ID, status, dataset/case, and node names. Selecting an option preserves the existing `?run=` navigation. The closed selector does not grow or repeat context.

## Validation

Backend tests verify list summaries return the saved dataset and selected nodes and that snapshots retain those fields. Studio tests verify compact closed value, detailed open options, search by dataset/node, and no-data fallbacks. Regenerate OpenAPI and TypeScript declarations from the Python schema. Run focused tests, API consistency check, lint, and build checks; report any unrelated failures separately.
