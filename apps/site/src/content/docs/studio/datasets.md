---
title: How to work with datasets in Studio
description: Browse and search saved cases, add new ones by CSV import or AI generation, run one case, and hand many cases to an experiment.
---

## When you need this

Use this when you want to run a flow against more than one made-up input: a set of saved, realistic
cases you can rerun the same way after every change, instead of retyping test input by hand each time.
This is the "Test" step of [the engineering loop](/concepts/engineering-loop/): datasets are the cases
an experiment runs before you trust a fix.

## Steps

- Open a flow and click **Datasets** in its tab bar, alongside Nodes and Runs. It's a normal tab, not a
  screen you have to find another way.
- The picker at the top lists every dataset in the project, searchable by ID. It shows each dataset's
  case count and whether it belongs to this flow. A dataset bound to no flow feeds an experiment's arm
  instead, so its cases can't be run from this page.
- Below the picker is the case table: one row per case, 25 per page, with a column for every field the
  cases actually use — flow input, run context, metadata, expected output, and which upstream node
  outputs a case supplies as a fixture. A search box narrows the table by case name; you can select
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
- **Start run** runs the open case and takes you to its run on the Runs screen.
- **Many cases at once are an experiment's job, not this page's.** An experiment selects cases from a
  dataset by their `tags`, and a series runs every selected case for every variant, several times. The
  server splits every dataset into working (`dev`) and held-out (`holdout`) cases by a hash of the case
  name. That split is what lets a series on the held-out cases decide, while series on the working
  cases are for searching. See [how to read research in Studio](/studio/research/).

### Example

Open the `support_case` flow's Datasets tab and pick `support_case_cases` from the picker. It has twelve
cases, among them `strip_flicker_credit`, `bulb_app_offline_advice` and `lamp_crushed_box_reship`. Search
for `flicker` and only `strip_flicker_credit` and `candle_flicker_credit` remain. Open the first, and the
case table shows its full input, including the photo and invoice it attached.

Leave the range at the full flow and click **Start run**. Studio starts a run of that one case and opens
it on the Runs screen. To run all of these cases, for two agents, several times, write an experiment that
selects this dataset and run it as a series.

## See also

- [The engineering loop](/concepts/engineering-loop/) — why a saved, representative set of cases is
  what makes a fix's Test step mean something.
- [How to read research in Studio](/studio/research/): the experiments that run these cases as a
  series, with a verdict.
- [How to investigate a run](/studio/investigate-a-run/): where **Start run** takes you next, including
  the same range picker used here.
