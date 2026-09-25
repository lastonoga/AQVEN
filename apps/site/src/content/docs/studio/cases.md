---
title: How to work with cases in Studio
description: Browse a flow's saved cases, filter them by tag, add cases by CSV or through the chat, run one case, or select several and run a look over the stages you pick.
---

## When you need this

Use this when you want a flow to run on saved, realistic inputs instead of test input you retype after
every change. A case is one input with its context, the upstream outputs a range of the flow needs, an
optional expected output and tags. Cases live in `datasets/<dataset_id>.yaml`. The **Cases** tab is where
you read them, add to them and run them. Experiments select their cases from these same files by tag.

## Steps

- **Open a flow and click Cases** in its tab bar, next to Graph and Runs. The picker at the top lists
  every dataset in the project, searchable by ID, with its case count and the flow it belongs to. A line
  under the heading says which kind you picked:
  - **Cases of this flow** can run from here.
  - **Cases of another flow** run only from that flow's tab.
  - **Cases without a flow** feed experiments whose subject is a flow local to the experiment, not runs
    from this tab.
- **Filter by tag, then by name.** **Filter** lists the tag dimensions the cases use, such as `length`,
  `channel` or `regression`, then the values of the one you pick, with a count for each. Each filter you
  add shows as a chip. The search box narrows the list by case name, and the counter says how many cases
  are shown of the total.
- **Read the list.** One row per case: its name, its tags, a mark when it has an expected output, and the
  upstream nodes whose outputs it saves in `node_outputs`. Click a row to open the case in place. You see
  its input, context, expected output, `node_outputs` and tags. You also see **Experiments using this
  case**: every experiment whose dataset and tag filter select it, with a link to each.
- **See the case's media.** An image, audio, video or document in a case shows in the open case, whether
  the case points at a file in the project (`file`) or at a blob (`blob_id`). A file is read straight
  from the project folder, so what you see is the file on disk.
- **Run one case.** An open case of this flow has a **Run this case** panel. Drag the stage picker to
  choose the first and last stage, or click one node to run only that stage. Studio checks live that the
  case has what the range needs, and earlier stages take their outputs from the case. **Start run** runs
  it once and opens the run on the Runs tab.
- **Run several cases as a look.** Tick the cases, or tick the header to select every shown case. A
  selection bar appears at the bottom with the count, **Clear**, a **Stages** picker (from stage, to
  stage) and **Run**. The bar says whether the range starts from the whole flow or takes earlier stages
  from `node_outputs`. When a start can't work, it names the cases that lack the outputs it needs.
  **Run** starts a look series: every selected case runs once over those stages, with no verdict and no
  finding, and Studio opens the series. A case with an expected output is checked against it. A look
  takes at most 500 cases.
- **Add cases with the chat or a CSV.** **Ask the agent to add cases** (or **Ask the agent to write
  cases**, when the flow has no dataset yet) sends a prompt to the chat. The agent first asks which
  situations the cases should cover and how many. It gives each case a unique name, tags with the same
  keys as the other cases, and an expected output when the answer is known, then runs
  `{{CLI_COMMAND}} check`. **Upload CSV** opens a dialog with a guide to the columns this flow expects and
  a downloadable example. **Check CSV** previews the import before anything is saved: matched columns,
  valid rows, the nodes each row can start from and the problems to fix. **Create dataset** turns on only
  once the check passes.
- **Edit cases in the file.** A saved case isn't edited in place on this tab. Change
  `datasets/<dataset_id>.yaml`, or ask the chat to. Never rename a case that experiments already use: the
  server splits working and held-out cases by the case's name, so a renamed case is a new one.
- **Attach a media file to a case.** Studio writes the file into `datasets/<dataset_id>/`, next to the
  dataset, with a name that doesn't clash with the files already there, and saves a `file` reference in
  the case instead of a blob. The file goes into git with the dataset. For private media, see
  [how to keep case media as files in the project](/engine/dataset-media-files/). Media from a CSV import
  and cases drafted from a run point at blobs. Run `{{CLI_COMMAND}} datasets materialize` to turn them
  into files.
- **Lock a fix with a case.** From a run that went wrong, **To cases** drafts a dataset case from that
  run and hands it to the chat. See [How to investigate a run](/studio/investigate-a-run/).

### Example

Open the `support_case` flow's Cases tab and pick `support_case_cases`: twelve cases, tagged by `length`,
`channel`, `lamp_kind`, `action` and `regression`. Add the filter `regression: yes` and five cases remain.
These are the cases the `reply_look` experiment selects, and each one lists `reply_look` under
**Experiments using this case**.

Select the five, set **Stages** to `polish` through `polish`, and click **Run**. The bar reads "Earlier
stages come from node_outputs", because each case saves the outputs of `prepare`, `triage`, `route`,
`search_kb` and `panel` that the revision loop reads. Studio starts a look and opens it: five attempts,
one per case, each with its outcome, cost and a link to its run.

## See also

- [How to use Research in Studio](/studio/research/): the experiments that select these cases, and the
  series that answer them.
- [How to follow and read a series in Studio](/studio/series/): the page a look opens on.
- [How to write an experiment](/engine/experiments/): selecting cases with `cases.tags`.
- [How to keep case media as files in the project](/engine/dataset-media-files/): the two path forms,
  private media and moving old blob-backed cases to files.
- [Datasets reference](/reference/datasets/): every key of a case.
- [How to investigate a run](/studio/investigate-a-run/): the run that **Start run** opens, and the
  **To cases** action.
