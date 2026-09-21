---
title: Datasets
description: Create, import, run, and inspect cases for a project flow.
---

Studio's **Datasets** page belongs to the selected project and flow. A flow dataset is stored as `datasets/<dataset_id>.yaml` in that project, with `flow` set to the flow ID. The source file remains usable from code, CLI checks, and evaluations. Start the project backend and Studio together with `uv run {{CLI_COMMAND}} dev .` from the project root.

![Dataset selection, search, and case selection controls in Studio.](/images/studio/dataset-controls.png)

## Create a dataset

Open a flow's **Datasets** page and create a dataset. Studio generates a draft case from the flow's input schema. Give the dataset a stable ID, then replace the sample values with real cases. Each case needs a unique name and an input record. The page shows case counts and split labels, and lets you search or filter cases.

Use one case per behavior you want to inspect: a normal request, each branch, a missing field, an empty retrieval result, a tool failure, or a prior regression. A useful name describes the situation, such as `refund_without_receipt`.

## Import CSV

Choose **Import CSV**, then download the template for the selected flow. The template lists the flow's input fields, supported context fields, an optional split, expected output, and any prior node fixtures relevant to partial runs. Upload a UTF-8 CSV and inspect the preview before creating the dataset.

The importer accepts `name` or `case`, `inputs.<field>` (or a bare known input field), `context.<field>`, `metadata.<field>`, `expected_output`, nested `expected_output.<field>`, and `node_outputs.<node>`. Structured cells can contain JSON. The import limit is 2 MiB and 1,000 cases. Unknown input columns, duplicate names, conflicting root and child columns, and invalid values are reported in the preview. [See full CSV examples and field behavior](/engineering/datasets/#import-a-csv-in-studio).

## Run one case or a batch

Select a case to inspect its input and context, then run it. Select several cases to launch a batch; Studio records progress and each case's run or start error. A run retains the dataset and case identity, so you can return to the source example from run history.

Choose a **start** and **end** node when you want to test only part of a flow. Studio shows which ranges are available. A range can need values from nodes before its start; put those values in that case's `node_outputs`. Studio checks the range against all selected cases before a batch starts. If one case lacks boundary data, use a different range, add its fixture, or run that case alone.

The run dialog's **Current dataset file** tab shows the current source file's selected case. **Used for this run** shows the case recorded for the run. This matters after the dataset file changes: the current case and the recorded run input can differ. The Datasets page shows the full case list.

## Understand what is scored

`expected_output` records an expectation but does not score a flow run by itself. Define an evaluation with scorers to get measured results. A dataset can also be used for a single-inference eval, even without a `flow` field; that kind of dataset does not appear as a runnable flow dataset here. See [Engineering datasets](/engineering/datasets/) for all YAML fields and [Studio Evaluations](/studio/evaluations/) for results.
