# Expanded Runs menu options

> Approved by the owner on 2026-09-18. This updates only the expanded Runs menu; the closed selection stays compact.

## Goal

The closed Runs selector shows the short run ID and status. Opening it shows enough context to distinguish runs: ID, status, relative time, dataset and case, and selected node scope. Existing run-page details remain unchanged.

## Data and behavior

Add optional `dataset_item_id` and `selected_nodes` to `RunSummary`, populated from the same saved run spec already used by `RunSnapshot`. This avoids a separate snapshot request for every menu item. Older summaries without these fields remain valid: show “No dataset” and “Entire flow” when values are absent or null. `selected_nodes` describes the requested scope, not a claim that each node executed successfully.

The expanded option is taller and wider than today. Its first line retains short ID and relative time, followed by status and mode tags. Dataset and case each get a separate labeled line with a Tag; selected nodes get their own labeled line with node tags. Long dataset/case names wrap instead of being cut off. Show up to three node tags plus a count for larger selections, with the full node list available in the option title and search value. Search matches run ID, status, dataset, case, and node names. Selecting an option preserves the existing `?run=` navigation. The closed selector does not grow or repeat context.

## Validation

Backend tests verify list summaries return the saved dataset and selected nodes and that snapshots retain those fields. Studio tests verify compact closed value, detailed open options, search by dataset/node, and no-data fallbacks. Regenerate OpenAPI and TypeScript declarations from the Python schema. Run focused tests, API consistency check, lint, and build checks; report any unrelated failures separately.

## Approved visual revision

The owner approved a denser, three-line option on 2026-09-18 after reviewing a visual preview. This supersedes the earlier tag-heavy option layout but keeps its data and interaction contract.

- Line 1: short run ID, one status tag, and relative time.
- Line 2: the case name is the primary scan target. If a run has no case, show the dataset ID or “No dataset” here instead.
- Line 3: dataset ID (when there is a case), selected-node scope, and run mode as quieter supporting text. Dataset and case remain on separate lines. Limit the visible node names to three and show a remaining count; the full scope stays in search and the item title.
- The selected row uses the existing check indicator and a narrow status-toned leading edge. No dataset, case, node, or mode chips. Keep the entire row as one keyboard-selectable option.
- The closed selector stays unchanged. Searching by run ID, dataset, case, status, or any selected node continues to work. Selecting a row still updates `?run=`.

## Approved selection-state revision

The owner approved a neutral selected-state preview on 2026-09-18. This supersedes the status-toned leading edge above. The checked option uses a clearly lighter neutral fill on the dark menu and retains the white checkmark. It has no leading border. The status tag keeps its semantic status color, but that color does not mark selection. Supporting text on the selected fill remains readable; keyboard-highlighted options are distinct without replacing the checked indication. The closed selector and option content remain unchanged.
