---
title: Datasets
description: Write reusable cases for flow runs, partial runs, and inference evaluations.
---

A dataset is a project file containing named cases. Use it to repeat an input, reproduce a failure, compare changes, or evaluate an inference. One case can hold the input, run context, expected result, and upstream node results needed to start in the middle of a flow.

## Choose the dataset you need

| Goal | `flow` field | Case `inputs` | How to run |
| --- | --- | --- | --- |
| Run a whole flow in Studio | Set to that flow's ID | Record matching the flow input type | Select a case on **Datasets** |
| Run part of a flow | Set to that flow's ID | Flow input record; add boundary data where needed | Select a start and end node on **Datasets** |
| Evaluate one inference | Optional | Values used by the inference's input bindings | `{{CLI_COMMAND}} eval . --eval <id>` |

Studio flow runs require `flow` to match the selected flow. An evaluation loads the dataset named in its `Eval` file, even when `flow` is absent. Setting `flow` alone does not make evaluation scoring happen; define an `Eval` and scorers for that.

## A flow dataset

Save this as `datasets/support_questions.yaml` in the project root. The file name is the dataset ID. Replace the example input fields with fields from your flow's declared input type.

```yaml
apiVersion: "aqven/v1"
kind: "Dataset"
flow: "answer_question"
cases:
  - name: "ordinary_question"
    inputs:
      question: "When will my order ship?"
    context:
      locale: "en-US"
      date: "2026-09-20"
    metadata:
      split: "test"
      topic: "shipping"
    expected_output:
      answer: "Shipping depends on the order status."
  - name: "missing_order_id"
    inputs:
      question: "Where is my order?"
    metadata:
      split: "edge_cases"
      reason: "The question contains no order ID."
```

Case names must be unique when Studio creates a flow dataset. Give them stable, descriptive names: recorded runs use `<dataset_id>/<case_name>` as their case identity.

## Every YAML field

| Field | Required | Meaning | What changes when you set it |
| --- | --- | --- | --- |
| `apiVersion` | Yes | Dataset format version | Currently `aqven/v1`. |
| `kind` | Yes | Document type | Must be `Dataset`. |
| `flow` | For Studio flow runs | Flow ID | Associates cases with that flow. A different flow cannot run the case as its own dataset item. |
| `cases` | Yes | One or more cases | Each case is independently selectable. |
| `cases[].name` | Yes | Case identity | Used in Studio, searches, batch history, and dataset item IDs. |
| `cases[].inputs` | Yes | Input JSON value | A flow run needs a record matching its declared input type. An inference eval maps this value into the inference's inputs. |
| `cases[].context` | No | Run context | Supplies `date`, `time_zone`, `locale`, or `tenant_id` to a flow run, unless an explicit run context overrides it. |
| `cases[].node_outputs` | No | Prior top-level node outputs | Used as boundary fixtures for a node-range run. Ignored for a whole-flow dataset run. |
| `cases[].metadata` | No | Case labels and other JSON values | `split` powers Studio filtering and is shown in dataset summaries; other keys are available to evaluation records and custom scoring logic. |
| `cases[].expected_output` | No | Expected result, any JSON value | Passed into evaluation scoring context. It does **not** automatically assert equality or grade a Studio flow run. |

The type-derived [Dataset field reference](/engineering/reference/evaluations/#datasetcase) is the source for required fields and defaults. The guide explains behavior that a field table cannot express.

### Inputs depend on the consumer

For a flow dataset, `inputs` must be a JSON object. Its keys and value types come from the flow's `input` type, not from a global dataset schema. If the flow expects `question` and `customer_id`, use those exact fields. Studio validates known fields against that flow's input type when creating or importing cases. A full run also validates required inputs before starting.

For an inference evaluation, `inputs` are mapped to the selected inference's input bindings. A dataset with `inputs: {question: "..."}` is useful only if that inference accepts the value. Check the inference's declared input and use `{{CLI_COMMAND}} check .` after editing a case.

### Context is run context, not arbitrary workflow input

`context` has four supported keys: `date`, `time_zone`, `locale`, and `tenant_id`. Put customer or task data in `inputs`; use `context` for run-wide values referenced as run context. For example, a prompt that uses the run date can be exercised deterministically:

```yaml
context:
  date: "2026-09-20"
  time_zone: "Europe/London"
  locale: "en-GB"
```

If a run request supplies its own context, it takes precedence over the case context. Unknown context keys are rejected when Studio validates a dataset.

### Expected output needs a scorer

Store a concise expected result when you can state the behavior. It can be a string, number, list, or object:

```yaml
expected_output:
  decision: "ask_for_order_id"
  must_not_claim_delivery_date: true
```

An evaluation scorer must decide how to compare the actual result with this value. A run from the Studio Datasets page records the case and actual output, but the presence of `expected_output` alone does not produce a pass/fail verdict. The eval runner includes it in scorer metadata under `expected_output`; built-in scorers do not compare it automatically. A custom scorer can make an exact comparison when exact equality is the right task criterion:

```python
# code/scorers.py
from {{PYTHON_MODULE}}.policies import EvalContext, NoParams, Verdict
from my_workflow.types import Answer, Question


def matches_expected(
    value: Answer,
    context: EvalContext[Question, Answer],
    params: NoParams,
) -> Verdict:
    expected = context.metadata.get("expected_output")
    return Verdict(
        passed=expected is not None and value.model_dump(mode="json") == expected,
        reason="Exact output comparison",
    )
```

Use it in an `Eval` scorer with `run: "@root/code/scorers.py:matches_expected"`. Exact comparison is often too strict for prose; choose a property scorer or calibrated judge in that case. See [Testing and evaluation](/engineering/testing-and-evaluation/) for scorer kinds and gates.

## Reproduce a branch or failure

Include cases for each switch branch and known failure, not just the happy path. Use `metadata` to keep the reason close to the example:

```yaml
cases:
  - name: "no_attachment"
    inputs:
      question: "Can you read the attached receipt?"
      attachment: null
    metadata:
      split: "edge_cases"
      reason: "The agent must not invent receipt details."
  - name: "empty_search_results"
    inputs:
      question: "Find the warranty policy for model ZX-9."
      attachment: null
    metadata:
      split: "regressions"
      reason: "Known failure when retrieval has no matches."
```

The fields still need to match your own input schema; this example assumes `question` and nullable `attachment` exist. Prefer separate cases for different causes of failure, so a regression points to one behavior.

## Start in the middle of a flow

A node-range run skips earlier nodes. If the selected range reads `$nodes.classify.output`, supply the value that `classify` would have produced in `node_outputs`:

```yaml
apiVersion: "aqven/v1"
kind: "Dataset"
flow: "answer_question"
cases:
  - name: "reply_after_urgent_classification"
    inputs:
      question: "My account has been compromised."
    node_outputs:
      classify:
        category: "security"
        urgency: "high"
    metadata:
      split: "partial_runs"
```

Select a start and end node that use this boundary value. The key under `node_outputs` must name a **top-level** node in the flow. The value must have the shape expected from that node. When a range starts, the backend checks whether required input, context, and earlier node values are available; it reports missing boundary data before execution. For a full flow run, upstream nodes execute normally and these fixtures are not applied.

If different cases supply different boundary values, Studio checks the selected range against **every selected case** before starting a batch. A range can be valid for one case and unavailable for a batch.

## Organize cases with splits

`metadata.split` is a plain label. Studio can filter cases by it and shows counts per split. Cases without a string split appear as `unassigned`. Typical labels are `train`, `dev`, `test`, and `regressions`, but the schema does not reserve these names.

An `Eval` currently runs the cases in its chosen dataset; adding `metadata.split` does **not** automatically limit an eval to that split. Use separate datasets when you need a strict eval-only subset. The `optimization.train_split` and `optimization.dev_split` fields are defined in the type schema, but the CLI `optimize` command is pending.

## Import a CSV in Studio

On a flow's **Datasets** page, choose **Import CSV** and download the flow-specific template. Its headers reflect that flow's input schema, run context, and the boundary fixtures a partial run might need. Preview the import before saving it.

Supported header forms include:

| Header | Result |
| --- | --- |
| `name` or `case` | Case name; one is required. |
| `inputs.question` | `inputs.question` in the case. |
| `question` | Shorthand for `inputs.question`, when `question` is a known flow input field. |
| `context.locale` | Run locale. |
| `metadata.split` | Split label. |
| `expected_output` | One JSON value for the whole expected output. |
| `expected_output.answer` | Nested expected result field. |
| `node_outputs.classify` | Complete JSON value for the prior node. |
| `node_outputs.classify.category` | One field inside the prior node output. |

For a flow with `question` as an input, this CSV creates two cases:

```csv
name,inputs.question,context.locale,metadata.split,expected_output
ordinary_question,When will my order ship?,en-US,test,"{""answer"":""Ask for the order status.""}"
missing_order_id,Where is my order?,en-US,regressions,"{""answer"":""Ask for an order ID.""}"
```

Do not include both a root field and one of its nested fields as headers, such as `expected_output` and `expected_output.answer`. They conflict. Columns for input fields must exist in the flow input schema. Structured cells can contain JSON; text fields retain their text. Blank cells are omitted, while supported nullable fields can use `null`.

The importer accepts UTF-8 CSV, at most **2 MiB** and **1,000 nonblank case rows**. It reports duplicate case names, invalid paths, shape errors, and missing data in the preview. It can also resolve supported public media URLs into project blob values; check the preview and resulting case before using external media in a run.

## Include media in a case

If a flow input type has `Image?`, `Audio?`, `Video?`, or `Document?` fields, a case can supply the corresponding media value. This fragment shows the stored shape of an image:

```yaml
inputs:
  question: "What is shown in this photo?"
  photo:
    $media: "image/jpeg"
    blob_id: "sha256-<stored-blob-id>"
    size_bytes: 1865
    name: "example.jpg"
```

The `blob_id` must identify a real blob in the project; the text above is a shape example, not a runnable media case. Studio's CSV importer can fetch supported **public HTTP(S)** media URLs from media columns, validate their type and size, store the blob, and write the case value. It rejects private or credential-bearing URLs. Each imported media file is limited to 25 MiB and a dataset import to 500 MiB of media. Use a case with no attachment too, so the workflow's optional-media path is exercised. [Types and Structured Output](/engineering/types/#media-fields-images-audio-video-documents) explains the type and model-capability side.

## Run and inspect cases in Studio

1. Open the project and choose a flow, then **Datasets**.
2. Create a dataset from the flow's generated draft, import a CSV, or edit a dataset YAML file in the project.
3. Inspect the selected case's input and context. Select one case or several for a batch.
4. Run the whole flow, or choose a start and end node and inspect range availability.
5. Open the recorded run to inspect actual outputs. The run keeps its dataset item ID; a batch also records the dataset file hash used at start.

Studio works with the backend in the same project; start both with `uv run {{CLI_COMMAND}} dev .` from the project root. See the [Studio Datasets walkthrough](/studio/datasets/) for the interface and [Runs and integration](/engineering/runs-and-integration/) for run requests.

## Check a dataset change

```bash
uv run {{CLI_COMMAND}} check . --static
uv run {{CLI_COMMAND}} check .
```

The static check catches malformed documents and invalid references. A full check adds path simulation. Then run representative cases or an eval to verify behavior. Avoid replacing a regression case just because a new model produces a different answer; decide whether the expected behavior changed first.

## Common mistakes

| Symptom | Check |
| --- | --- |
| Dataset does not appear for the flow | Set `flow` to the flow ID; keep the file under `datasets/`. |
| Studio says a case is not runnable | Make `inputs` a record with the flow's required fields and valid types. |
| A partial run is missing boundary data | Supply referenced prior node outputs or context for that case, or start earlier in the flow. |
| A full run ignores `node_outputs` | Fixtures apply only when a node range is selected. |
| A case has no score | Define an `Eval` with scorers; `expected_output` alone is data. |
| Filtering shows `unassigned` | Add a string at `metadata.split`. |
| CSV preview rejects a column | Use the flow-specific template; remove duplicate root/nested columns and unknown input fields. |
