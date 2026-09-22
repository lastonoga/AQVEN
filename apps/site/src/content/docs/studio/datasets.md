---
title: How to work with datasets in Studio
description: Browse and search saved cases, add new ones by CSV import or AI generation, then run one case or a whole batch and read the results.
---

## When you need this

Use this when you want to run a flow against more than one made-up input: a set of saved, realistic
cases you can rerun the same way after every change, instead of retyping test input by hand each time.
This is the "Test" step of [the engineering loop](/concepts/engineering-loop/) — datasets are what you
run before you trust a fix.

## Steps

- Open a flow and click **Datasets** in its tab bar, alongside Runs, Nodes, and Evals — it's a normal
  tab, not a screen you have to find another way.
- The picker at the top lists every dataset in the project, searchable by ID. It shows each dataset's
  case count and whether it belongs to this flow or is an inference-only dataset used by an eval.
- Below the picker is the case table: one row per case, 25 per page, with a column for every field the
  cases actually use — flow input, run context, metadata, expected output, and which upstream node
  outputs a case supplies as a fixture. A search box narrows the table by case content; you can select
  the cases on the current page, or select every case matching the search across the whole dataset, not
  just what's on screen.
- **There's no in-place edit of a saved case.** To change what a dataset contains, create a new dataset
  or re-import a CSV — you don't open a row, edit it, and save it back.
- **Upload CSV**, top right, is the button you'll actually see. It opens a dialog with a guide to the
  fields this flow expects — which columns are required flow input, which are run context, which nodes
  each column feeds — plus a downloadable example CSV in that shape. Pick a file, click **Check CSV**,
  and Studio previews the import before anything is saved: which columns matched a flow field, how many
  rows are valid, which nodes each row has enough data to start from, and any problems to fix. **Create
  dataset** only turns on once that check passes. After creating it, Studio re-reads the saved dataset
  and confirms it matches what the preview promised, then offers to open it.
- The other way to create a dataset — describe the scenarios in words and let your chat agent write the
  cases, or build them by hand as a JSON draft — exists in Studio but isn't linked from a button yet.
  Reach it by adding `?create=true` to the datasets URL, for example
  `.../flows/support_case/datasets?create=true`. Give it a dataset ID and a scenario brief, and it sends
  a prompt to your open chat session asking it to write `datasets/<name>.yaml`, validate it, and report
  back in chat; this page polls until the new dataset shows up and opens it. The manual draft below it
  works without a chat agent: add cases, fill in their JSON by hand, and save.
- Once a dataset that belongs to this flow is open and a case is selected, a **Run this dataset** panel
  appears below the table. Drag the range picker to choose the first and last stage to run, or click one
  node to run just that stage — the same range picker used for a [manual run](/studio/investigate-a-run/).
  Studio checks live whether the case, or every selected case, has what that range needs, and fades out
  starting points that don't.
- **Start run** runs only the open case and takes you to its run on the Runs screen. **Run N selected
  cases** — enabled once you've checked at least one case and the range is available for all of them —
  starts a batch instead, and the page switches to tracking it.
- A batch's progress shows under **Grouped runs**: past batches for this dataset, by short ID and case
  count, plus the one you just started. Select one to see it update every couple of seconds — status,
  completed and failed counts against the total, cost so far, which stages it ran, and the exact dataset
  version it ran against — and a per-case results table below that, one row per case with its status and
  a link to its own run, searchable and filterable by status. What a batch like this feeds into — a
  scored eval with a pass/warn/block gate against a baseline — is [how to work with evals](/studio/evals/).

### Example

Open the `support_case` flow's Datasets tab and pick `support_case_cases` from the picker — it has
three cases: `strip_flicker_credit`, `bulb_app_offline_advice`, and `lamp_crushed_box_reship`. Search
for `flicker` and only `strip_flicker_credit` remains; open it and the case table shows its full input,
including the photo and invoice it attached.

Check `strip_flicker_credit` and `lamp_crushed_box_reship`, leave the range at the full flow, and click
**Run 2 selected cases**. Studio starts a batch and switches to it: the progress line climbs from
`0 completed · 0 failed · 2 total` toward `2 completed · 0 failed · 2 total`, and the results table
below fills in a status and a run link for each case as it finishes.

## See also

- [The engineering loop](/concepts/engineering-loop/) — why a saved, representative set of cases is
  what makes a fix's Test step mean something.
- [How to work with evals in Studio](/studio/evals/) — what happens to a batch once it's scored against
  a baseline.
- [How to investigate a run](/studio/investigate-a-run/) — where **Start run** and a batch's per-case
  links take you next, including the same range picker used here.
