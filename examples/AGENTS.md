# Rules for coding agents

`lumen` is an aqven project: AI workflows are YAML files next to the Python code they use. The aqven module is
`lumen/`; its `aqven.yaml` marks the project root, and every aqven command takes that folder as its path.

Documentation for this engine is at https://aqvenstudio.com. Before you answer any question about a node kind, a
policy or a command, or write YAML that uses one, fetch `https://aqvenstudio.com/llms.txt` first: it is the index of
every page in Markdown. Find the matching page in it and fetch that page too. Do this even if you think you already
know the answer; the docs are the source of truth and guessing from memory is how stale answers happen.

## Layout

```
lumen/
  aqven.yaml                           project: model providers, data policies
  .env.example                         names of the API keys; copy it to .env next to it
  types.py                             generated models: never edit, never commit
  app.py                               the ASGI app, the in-process run helper and the mounting example
  __main__.py                          the runner: python -m lumen starts the server
  agents/<agent>.yaml                  model "provider:model", settings, tools
  tools/<tool>.yaml                    tool contract; functions live in tools/functions.py
  types/{enums,ids,records,unions,values}/<type>.yaml
  fragments/<fragment>.md              prompt text shared by several prompts
  code/<module>.py                     Python used from several places
  datasets/<dataset>.yaml              the flow they feed, and cases: name, inputs, expected_output, node_outputs, tags
  experiments/<experiment>/            experiment.yaml: one question over a dataset; experiment.md: notes, failure
                                       modes and decisions; checks.py: check functions of this experiment;
                                       arms/<arm>/flow.yaml or flow.py: a small flow only this experiment runs;
                                       findings/<series>.yaml: a finding the server wrote, never edit
  FINDINGS.md                          what the project already knows, generated from the findings, never edit
  flows/<flow>/flow.yaml               flow input, output, returns and node order
  flows/<flow>/nodes/<node>/
    <node>.node.yaml                   step: code, llm, tool, human, switch, parallel, map, loop, call, narrow
    <node>.inference.yaml              contract of an llm step
    <node>.prompt.md                   prompt of that inference
    <node>.py                          code of the step, referenced as run: "<function>"
    <child>.node.yaml                  nested steps sit flat in the folder of their top-level step
  samples/                             sample flow input and human answers
tests/                                 offline tests of the example, at the project root
```

- The file path is the identity: an id is the file name up to the first dot, a flow id is its folder name. There is no
  `id:` key. A nested node's id joins the ids with `__`: `polish__revise`.
- Prompts are Markdown files, never strings inside YAML.
- Declare every shape once in YAML. Import models from `lumen.types` and never write a `BaseModel` that repeats a
  declared type.

## Rules

1. **Ask when something is genuinely unclear and the answer would change what you build.** An ambiguous
   field type, an underspecified check, which node kind actually fits, whether an idea is even fully
   specified — not only which provider someone has a key for. A wrong assumption costs a rewrite; a
   question costs one reply. This applies everywhere in this file, not only when brainstorming a new flow
   from an idea.
2. **`aqven check` must pass after every change.** It is the gate of this project: it checks the files statically,
   experiments included, and then simulates every flow with generated values, without a network and without spending
   tokens. Fix every error before you run anything live.
3. Never edit `lumen/types.py`. `aqven generate` rebuilds it from the YAML and overwrites every edit; change
   the YAML instead. Never create `lumen/types/__init__.py`: it hides the generated models.
4. Structural changes across files go through the `flow_patch` tool of the `aqven` MCP server: renaming or moving a
   flow, node, agent, tool or type, adding or removing a node. It updates references and the rename journal. Edit by
   hand only inside one file: prompt text, descriptions, settings, one node. If `flow_patch` answers `STALE_FILE`,
   read the file again and repeat the change; never overwrite a file by force.
5. **After editing a prompt, a fragment, a variant or an inference, run
   `aqven prompt preview <flow>.<node> --project lumen`** and read
   what the model will actually receive: the instructions, every message and the output contract. Wrong data wiring
   shows up there as an empty or literal placeholder in the message.
6. **Choose a model with `aqven models check`, not from memory.** It prints which output modes a model supports and
   what `output.mode: auto` resolves to. Pin `output.mode` in the agent file when the resolved mode is not the one you
   want. A schema mismatch that gets retried and then succeeds in a run's events is AQVEN's own repair retry working,
   not a bug report — only a node whose *last* attempt still failed after `output.retries` ran out is worth
   investigating. `--live` also proves whether `output.strict: true` would hold for a model: every mode it probes runs
   with strict enforcement forced on, so a mode it reports `ok` for has already worked strict against the real
   provider. `aqven check` still refuses `output.strict: true` unless every model the agent can reach — `model` and
   each of `fallback_models` — is one AQVEN already trusts for it (`E_STRICT_UNSUPPORTED`); an unverified model needs
   `capabilities.strict: true` on the agent first, and that trust applies to every model in the list, not just the
   one you probed. Neither check tells you how deep a model's structured output actually nests correctly — before
   trusting a model with a real schema that nests objects, carries an array of objects, or leans on a large enum,
   run `aqven models shapes <agent> --live`: it finds the model's real nesting depth, list length and enum size by
   asking it to place literal tokens at each position and checking they came back exactly where asked, not what the
   provider's docs claim. It never stops on a transient provider hiccup — only a genuine wrong-shape answer counts
   as the limit — but every call is still billed and it needs `--live`, there is no free mode. Both commands also take `--provider-options '<json>'`, merged into the request body — run the same target with and without it to find out whether a provider-level setting like OpenRouter's `{"provider": {"require_parameters": true}}` actually changes what a model can do, instead of assuming it does.
   A step that fails with `OUTPUT_SCHEMA_REJECTED` never reached the model: the provider refused its output type as
   too complex. The error's hint names the deepest nesting, the largest `maxItems` and the largest enum of that type.
   Lower them, pin another `output.mode`, or add a `fallback_models` entry from another model family; a retry to the
   same model gets the same refusal.
7. API keys live in `lumen/.env`, which is gitignored; variables of the process environment take
   precedence. You can read and edit `.env` directly. Before adding or changing a key, check the
   provider's own documentation for its exact variable name and format instead of guessing one. Never put
   a real key into YAML, code, tests, logs or commits — printing one into this conversation counts too,
   since it ends up stored outside `.env` either way. `aqven secrets lumen` gives a quick masked
   summary of what's configured without opening the file; `aqven models check --project lumen` does
   the same for what a model actually supports.
8. **Before wiring a `model` at a new agent, check what's actually configured** with
   `aqven secrets lumen` rather than assuming the project's existing default carries over. If the
   user asked for a specific provider, use it and add its key slot even if it's still empty — say so
   plainly as the first thing in your reply, not buried in a summary table after the files are already
   written. If the user did not name a provider and nothing usable is configured, stop before writing a
   single file and ask directly which providers they actually have credentials for; don't default
   silently to whatever the project's other agents already use, and don't build the agent, flow or types
   first and surface the gap afterward — the answer decides which provider the files reference, so it
   comes first. Once you know, write the key into `.env`, and fetch `llms.txt` to find the provider
   catalog reference page for the real environment variable name and model id format, never guess either.
9. Do not touch `.aqven/`: it holds runtime state (drafts, locks, write transactions, databases with runs and
   series attempts, the simulation cache).
10. **Tests never call model providers.** They replace models with `FunctionModel` through the `aqven_engine` fixture.
    Recorded live runs (cassettes) exist only to prove the model contract of one scenario, never to decide which branch
    a flow takes: `tests/test_support_case.py` replays recorded runs of five scenarios and forces every branch
    with node output overrides and scripted human answers. Quality is measured by experiments, not by tests.
11. **Force a branch in a scenario test with a node output override**, never by hoping a model answers a certain way:

   ```python
   from aqven.testing import node_output, offline_options

   options = offline_options(cassettes=cassette_config, outputs=[node_output("classify", {"category": "refund"})])
   ```

   `node_failure("charge", "card declined")` forces the failure path; `branch_key`, `iteration` and `item_index` pick
   one branch of a `parallel`, `loop` or `map`.

## Building a flow from an idea

When the request is an idea rather than a change — "a workflow that triages support mail", an empty project — do
not start writing files. Ask first. A wrong guess here costs a rewrite of every node below it.

Before proposing a shape, read `FINDINGS.md` and use what the docs already worked out, not first instinct: fetch
`llms.txt` and read *Ten kinds of nodes* for the node-kind map, *Designing reliable workflows* for when splitting a
step, branching into `parallel`, looping on a critic, or building a judge panel actually earns its cost — none of them
buy reliability just by existing, and reaching for one without a real boundary is a documented anti-pattern — and,
whenever an attachment or a generated image, audio or video sits anywhere in the flow, *Media has real limits on both
sides of a model call*, since a provider's cap can decide the whole flow's shape before a node is written.

Settle these for the whole flow, then for each step. Ask them in one message, not one at a time, and ask only what
the request has not already answered.

| For the flow | What you need |
|---|---|
| Purpose | one sentence: what comes in, what goes out, who reads the result |
| Input | the fields of the request and their types |
| Output | the fields the caller gets back; a workflow with no declared output is not finishable |
| Done | how a person tells a good result from a bad one, as a check and a number: "the intent matches the lead's label in more than 90% of cases" — this becomes the dataset, the checks and the questions of the experiments |
| Budget | what a series may spend and what one run may cost — this becomes `cap_usd` and the cost thresholds |

| For each step | What you need |
|---|---|
| What it does | one sentence; it becomes `description` |
| Who does it | `code` for deterministic work, `llm` for judgement, `tool` for an external call, `human` for a person |
| In and out | field names and types; every type is declared once under `types/` |
| Decisions | a value that routes the flow means a `switch` over an enum, and every case must be covered |
| Blocking | does a person have to approve before the flow continues — that is a `human` node with a deadline |
| Together | independent steps that can run at once are `parallel` branches; the same step over a list is `map` |
| Checks | what makes this step's output wrong, and what to do then |
| Failure | retry, default value, or stop — a step without an answer here fails in production, not in `aqven check` |

Write the files only when you have the answers. Order: types first, then agents and tools, then the nodes, then
`flow.yaml`, then the dataset, then an experiment over it. Run `aqven check` after each file, not once at the end —
one wrong type reference is cheaper to fix before ten nodes reference it.

**A passing `aqven check` is not a finished flow.** It proves the wiring is valid; it never runs a real model and
never tells you whether the flow does its job. The flow is finished when the loop below says so.

## From a task to a reliable flow

A developer gives you a task: you build the flow, run it, check it, run experiments on it, and repeat until the
findings show it works reliably. Run the loop yourself, round after round, and stop only where *When to stop* says.
`aqven check` proves the wiring, one run proves one case, and only a series on `holdout` proves a claim. In `llms.txt`,
*How an agent takes a task to a reliable flow* walks the same loop with examples.

| Stage | Move on when |
|---|---|
| 1. Contract | purpose, input, output, a measurable "done" and a budget are agreed (*Building a flow from an idea*) |
| 2. Simplest flow | one `llm` step per real decision, `code` for the rest; `aqven check` is clean; `aqven prompt preview` is read for every `llm` node |
| 3. Cases | the dataset of *Cases and checks* exists with `expected_output` and tags; `aqven check` is clean |
| 4. Look | a `look` experiment with deterministic checks ran on `dev`, and every failing case is read |
| 5. Error analysis | the developer has read and noted the first traces; every failure has its first failing node and a failure mode the developer agreed; new failing traces stop adding modes |
| 6. Fix the spec | what the prompt or the type never asked for is fixed there, then stage 4 again |
| 7. Hypotheses | one experiment per remaining failure mode, its question and margin written before you see a number |
| 8. Explore | series on `dev`, one change between series, until the change is done and the question is frozen |
| 9. Confirm | one series on `holdout`, with `cases` from the estimate's `recommended.cases` when the split has them |
| 10. Apply | the flow is changed, regression cases are added, the decision is recorded; then stage 4 on fresh cases, or stop |

Studio calls the two splits by their purpose. **Explore** runs working cases (`dev`): numbers without a finding.
**Confirm** runs held-out cases (`holdout`): a verdict written to `FINDINGS.md`. "Run again on fresh cases" is a
`holdout` series at the `plan` size.

### Finding what to test

- Take the failing node from the run, not from reading the output. A failing case row of `series_get` carries each
  attempt's `run_id`, `error` and `failed_checks`; `run_get` and `run_events` on that `run_id` show the first node
  that failed. Fix the first failure upstream: later ones often cascade from it. In a multi-step flow, count failures
  by (last node that succeeded, first node that failed) and start with the biggest cell.
- The developer reads the first traces, not you. After the first look, hand the developer the failing runs first, then
  a few passing ones: about 30 traces in total, or all of them if there are fewer. Give each its `run_id` and where to
  open it in Studio (`/runs/<run_id>`), and ask for one short note per trace about the first thing that went wrong, or
  "fine". You prepare, the developer judges: attach the first failing node you found, but the verdict on what went
  wrong is the developer's note.
- Group the developer's notes into failure modes: an id, a one-line definition, a count, two or three `run_id`s. Show
  the list, and write it under "Failure modes" in the `experiment.md` of the look experiment only after the developer
  agrees. The id becomes the `failure_mode` of every experiment that tests it, and the section of `FINDINGS.md` its
  findings land in.
- In later rounds, read new failing traces yourself and map each to a known mode. Bring the developer only the traces
  that fit no known mode, and add a new mode only after the developer has read them. Stop when about 20 more failing
  traces add no new mode; few failures means you need harder cases, not less reading.
- Not everything deserves an experiment. The prompt or the type never asks for the behaviour: fix the prompt. An empty
  or literal placeholder in `prompt preview`: fix the binding. An infrastructure error: fix keys, limits or code. Only
  a failure on behaviour the flow clearly asks for becomes a hypothesis.
- Rank the modes by count, then by harm, and test the riskiest first. Never write hypotheses from a generic list
  ("hallucination", "toxicity") before the developer has read traces.

| Category | Claim to test | Setup |
|---|---|---|
| Output contract and limits | agent A on step S passes its output contract in fewer than X of attempts | `threshold` on `success_rate` `below`, `variant: A`, range `from: S, to: S`; read `schema_valid_first_try`; cases that push fields to their limits; run `aqven models shapes <agent> --live` first |
| Instruction following | instruction I of the prompt is broken more often than X | one binary check per instruction (`regex`, `language`, `max_words`, `no_pii`, `run:`), `threshold` `above` |
| Long or noisy input | on `length: very_long` the right answer drops below X; condensing first beats one step | `threshold` with `cases.tags` on one level; `compare` of two arms |
| Class boundaries | cases where the opening topic differs from the intent are decided right less than X | `expected` on the label field, cases selected by tags; write the label first, then the text |
| Error propagation | a wrong output of S1 reaches the flow output; the checking step notices it but fixes it wrong | a range that starts after S1, a wrong S1 output planted in the case `node_outputs`; two checks: "noticed" and "final output right" |
| Tool use | with a missing parameter the step invents a value more often than X | checks see the subject output, `node_outputs` and the inputs, not tool calls inside an `llm` step: grade the result, read the calls in `run_events` |
| Judge reliability | judge J catches more than X of planted defects and passes more than Y of clean answers | an arm that runs the judge on clean answers and copies with one planted defect, `expected` on the label (the experiment `critique_planted_defects`) |
| Cost and latency | a variant stays under $X per case, or p95 under Y ms | `threshold` on `cost_usd` or `latency_p95_ms` `below`, on the longest cases; p95 needs about 20 attempts |
| Stability | a share of cases passes only sometimes | `repeats: 3` or more, read `stability` and `pass_k`; an A/A pair (two identical variants, `compare`, `margin: 0`) gives the noise floor (the experiment `panel_aa_noise`) |
| Agent per step | agent B on step S is not worse than A by more than m, and a pass costs less | `noninferior` on the range `from: S, to: S`, guardrails `cost_of_pass`, `schema_valid_first_try`, `latency_p95_ms`; downgrade one step at a time |
| Split a step | a chain S1 → S2 beats one call by more than m, and not just by calling more | `compare` against an arm of equal budget (a `parallel` of k identical `llm` branches and a `code` majority vote), with the single step as a third variant; guardrail `cost_of_pass` `relative: true` |

### Writing an experiment

An experiment is `experiments/<experiment_id>/experiment.yaml`; its id is the folder name. `lumen/experiments/` has
one for every question kind and every kind of variant: start from the closest.

```yaml
apiVersion: "aqven/v1"
kind: "Experiment"
description: "gemini on triage keeps its output contract in fewer than 95% of attempts, with gpt on the same inputs as the reference"
failure_mode: "triage_contract_broken"
subject:
  flow: "support_case"
  from: "triage"
  to: "triage"
cases:
  dataset: "support_case_cases"
variants:
- id: "gemini"
- id: "gpt"
  agents:
    triage: "gpt"
question:
  kind: "threshold"
  metric: "success_rate"
  variant: "gemini"
  below: 0.95
  margin: 0.02
plan:
  cases: 12
  repeats: 3
```

- `description` — one falsifiable sentence with its number: what fails, where, how often. Write it so that
  `confirmed` means exactly this sentence is true. Studio shows it as the Hypothesis, or the Goal of a look.
- `failure_mode` — the id of the failure mode it tests; `FINDINGS.md` groups findings by it.
- `subject` — what runs: `flow: <flow_id>`, optionally narrowed to a range of top-level nodes with `from` and `to`
  (the nodes above the range replay the case `node_outputs`, and variants swap agents only inside the range), or
  `arm: <arm_id>` — a flow of two to five steps in `experiments/<experiment_id>/arms/<arm_id>/flow.yaml` or
  `flow.py` that only this experiment runs. Test a structure as an arm before you build it into the flow.
- `cases` — `dataset: <dataset_id>`, optionally `tags: {<dimension>: <value>}`: a case is selected when every listed
  tag has that value.
- `variants` — at least one. A variant with only an `id` is the subject as written; `agents: {<node_id>: <agent_id>}`
  swaps the agents of nodes; `arm: <arm_id>` runs another arm with the same input and output types, optionally with
  `agents` too. A variant never names a bare model: a new candidate model is a new `agents/<agent>.yaml` with its
  settings and output mode.
- `checks` — scored on every attempt, each with an `id` and `kind: binary | ordinal | continuous`, and one of:
  a built-in `use:` with `with:` — `expected` (against the case's `expected_output`, optionally only `fields`),
  `not_empty`, `max_words`, `language`, `no_pii`, `regex`, `unique_items`, `ids_in_allowed_set`,
  `citations_in_sources`, `cost_usd`, `latency_ms`; your own function with `run: "@root.<module>:<function>"`
  (a `checks.py` beside the experiment is `@root.experiments.<experiment_id>.checks:<function>`; it reads
  `context.metadata` for `case`, `tags`, `split`, `variant`, `repeat` and `node_outputs`); or a judge with
  `inference:` and `agent:` plus `validated_by: <experiment_id>`, the experiment that measured it on planted defects.
- `question` — the table below. A metric is a check id or a series metric: `success_rate` (the run completed and every
  binary check passed), `cost_usd`, `cost_of_pass`, `latency_p50_ms`, `latency_p95_ms`, `schema_valid_first_try`,
  `infra_error_rate`.
- `plan` — `cases` and `repeats` (at most 20): the size you recommend. A series may run another size, and its
  estimate says what size the question needs.

| `kind` | Keys | `confirmed` means |
|---|---|---|
| `look` | none | no verdict and no finding: every case with its checks, cost and trace |
| `threshold` | `metric`, `below` or `above`, `margin`, optional `variant` | the 95% interval of the metric clears the bound by more than the margin; without `variant` every variant is tested and all must |
| `compare` | `baseline`, `candidate`, `primary`, `margin` of 0 or more, optional `direction` and `guardrails` | the candidate beats the baseline on the same cases by more than the margin, and no guardrail is worse than its margin |
| `noninferior` | the keys of `compare`, `margin` above 0 | the candidate is not worse than the baseline by more than the margin, and the guardrails hold |

A guardrail is `metric`, `margin`, optional `direction` (`higher_is_better` or `lower_is_better`) and `relative: true`
to read the margin as a share of the baseline. Pick the margin before you see data: the smallest effect worth changing
the flow for, or the largest loss you accept.

### Cases and checks

- A dataset is `datasets/<dataset_id>.yaml` with `flow: <flow_id>`; only an arm subject runs a dataset without
  `flow`. A case has a unique `name`, `inputs`, and as needed `expected_output`, `node_outputs` (outputs of the
  top-level nodes a range skips) and `tags`.
- Cover the situations the flow will meet in its own domain: one case per `switch` case or decision path, one per
  failure the steps can hit, plus the ordinary case each is a variation on. A support triage needs an angry customer,
  a calm one, one in the wrong language and one where the only right answer is "escalate", not four polite refund
  requests. Write real values for this flow's niche, never "test input 1".
- Pick about three dimensions aimed at the failure modes (length, opening topic, channel, rare enum value), write about
  20 combinations yourself, generate the rest without duplicates, and turn each combination into an input in a
  separate step. Never "generate N examples" in one prompt: it yields near-identical happy paths.
- Answer first, input second: build the expected record, then the input from it, and store the record as
  `expected_output`. Check the answer is recoverable from the input and there is no second plausible answer.
- Tag every case with its dimensions. Add negative controls, cases where the failure must not happen: without them a
  `refuted` means nothing and a check that fires on everything goes unnoticed.
- The server splits cases 50/50 between `dev` and `holdout` by a hash of `name`, the same way in every clone: write
  twice as many cases as you need on `holdout`. Never rename a case: a renamed case is a new one and may change sides.
  A series with `cases: N` takes the first N of its split in file order.
- A failing run becomes a case: `run_get` gives its input and the node outputs for `node_outputs`; Studio's "To
  cases" on a run drafts the same case.
- Every `llm` node gets at least one check on what it produces: a node no check covers is a step nobody has checked.
- Checks, cheapest first: a series metric, a built-in `use:`, your own `run:` function, and only then a judge. Keep
  them binary. A judge costs tokens on every attempt and has its own error; never use one where `regex` or code can
  check. A judge that decides the question gives a `signal`, not evidence, until its check carries `validated_by`;
  planted defects are easier than real ones, so its measured catch rate is an upper bound.

### Running a series

A series runs an experiment live on the project server: every selected case for every variant, `repeats` times, and
every attempt is an ordinary run with a trace that costs money. The `aqven` MCP server and `aqven series` start the
server when needed.

1. `aqven check` is clean: a series refuses to start (`NOT_RUNNABLE`) on a project with errors, or when a case cannot
   run for a variant, before a single model call.
2. `series_start` returns at once with the estimate and the status; `series_get` with `wait_seconds` waits until the
   status settles, and after a timeout returns the current snapshot, so call it again.
3. Do not edit the flow, its agents and prompts, the experiment, the dataset or the code while a series runs: the
   series ends `invalid` with `inputs_changed`.
4. Once the status is `done`, quote `verdict.text` as it is. The server writes it from the interval and the margin in
   the file; never restate, round or recompute the numbers, and never present a `signal` or an `inconclusive` as a
   result. While a series runs, its verdict is provisional.

| Status | What it means | What you do |
|---|---|---|
| `running` | attempts are running | `series_get` with `wait_seconds` again |
| `awaiting_approval` | the estimate is above the project spend cap (`research.spend_cap_usd` in `aqven.yaml`, $1.00 by default; a local override on the developer's machine wins), unknown, or the series cap you passed is above it | tell the developer: only a person approves spend, in Studio; there is no tool for it; never raise the cap in `aqven.yaml` to get past it; then `series_get` the same series |
| `waiting_human` | an attempt reached a `human` node | tell the developer; the series continues once the node is answered |
| `done` | finished; every question except `look` has a verdict | quote `verdict.text` |
| `cancelled`, `failed` | stopped, no finding; `failed` means every attempt hit an infrastructure error | read `error` |

| Verdict | Meaning | What you do |
|---|---|---|
| `confirmed` | the 95% interval clears the bound, or beats the baseline, by more than the margin | on `holdout`: apply it (*Applying a finding*) |
| `refuted` | the effect is within the margin or reversed | drop the hypothesis; never read it as "no risk" |
| `inconclusive` | the interval is too wide to decide | `below_mde`: write fresh cases and run a new `holdout` series at `recommended.cases`, never the same `holdout` again for another answer; `uninformative` or `no_discordance`: the cases are too easy or too hard to tell the variants apart, write boundary cases |
| `signal` | the series ran on `dev` (`dev_split`), or the deciding check is a judge without `validated_by` (`judge_not_validated`) | a number to steer by, not a finding; for `judge_not_validated`, validate the judge first |
| `invalid` | cancelled, stopped at its spend cap (`budget_cut`), `inputs_changed`, more than 5% infrastructure errors, or no data | fix the cause and run again |

**Spend.** The estimate carries `usd` with its `usd_source` (`history` of past series, provider `prices`, an upper
`bound`, or `unknown`), `minutes`, `recommended` cases with its reason, `below_recommended` and warnings such as
`short_of_cases` and `holdout_reused`. A series under the project cap starts at once; there is no estimate-only tool.
Pass `cap_usd` to keep a series inside the budget agreed in stage 1: a series that reaches its cap stops `invalid`.
`spend.unpriced_attempts` above 0 makes `spend.usd` a lower bound. You never approve spend or raise the project cap;
report the spend of every round.

### Reading a series

- A failed attempt is either a result or noise. `schema_invalid` (`MODEL_SCHEMA_MISMATCH`, `MODEL_INVALID_JSON`,
  `MODEL_NO_STRUCTURED_OUTPUT`, `MODEL_RETRIES_EXHAUSTED`, `OUTPUT_SCHEMA_REJECTED`), `model_fail` (a run-time check
  failed, the output was truncated) and `refusal` are counted: the attempt fails `success_rate` and every binary
  check. `provider_error`, `timeout`, `MODEL_STREAM_STALLED`, `provider_key_missing`, `INTERNAL` and the like are
  infrastructure errors: not counted, and above 5% of the attempts the series is `invalid`.
- A counted failure is the engine working: it refuses invalid output instead of passing it on. The gemini agent
  (`gemini-2.5-flash-lite`, `output.retries: 2`) on `support_case.triage` broke the `maxLength: 200` of an
  observation three times in a row, the run ended `MODEL_RETRIES_EXHAUSTED`, and the series counted it against
  that variant. That is a risk the experiment found, not a bug to hide: the first row of *Applying a finding* says
  what to change.
- Read the failing cases (`include_cases: true`: `dev` cases only, failing first, at most 50), not the average. The
  average hides the one input that breaks everything.
- Mean 0.8 can mean "a fifth of the cases always fail" (fix the step) or "every case fails a fifth of the time"
  (retry with a check, or vote): read `stability` (always, never, flaky cases per variant) and `pass_k`, shown when
  `repeats` is 2 or more. Do not lower the temperature to look stable; that tests another product.
- A series on `holdout` never shows its cases one by one, and every further series on the same `holdout` cases is
  counted in the finding ("Confirmed in 1 of 3 holdout looks").

### Using what the project knows

`FINDINGS.md` at the module root is generated from `experiments/*/findings/*.yaml`: one section per `failure_mode`,
each finding with its state, experiment, statement, scope (split, cases × repeats, models, date) and a link. A series
on `holdout` with a verdict other than `invalid` writes one finding and regenerates the file.

- Read it before you design a flow, change one, or write a hypothesis. Build on what is `confirmed` (the agent it
  confirmed for a step, the structure that won), and do not test it again unless the subject changed.
- A finding holds for its scope only: the flow, prompts and models it ran. Nothing marks it stale when they change;
  compare its models with `agents/` yourself, and after a change only a new `holdout` series speaks for the new flow.
- `refuted` is not "safe", `inconclusive` is "nobody knows yet", and a `signal` is not evidence.
- Name the finding path when you propose or make a change it supports. Never edit a finding or `FINDINGS.md`: a
  finding carries a hash of its body (`E_FINDING_TAMPERED`) and `FINDINGS.md` must match them (`W_FINDINGS_STALE`).

### Applying a finding

| Finding | Change |
|---|---|
| step S breaks its output contract | first check the limit is stated in the prompt; then another agent, more `output.retries`, or trimming in a `code` step; raise a limit only if the developer confirms it is not a requirement |
| B is not worse and cheaper | point the node's `agent:` at B |
| the chain beats the equal-budget arm | move the arm's nodes into the flow with `flow_patch`; there is no promote tool |
| a risk is real but no fix is proven | a structural guard (a `code` check, a `switch`, a run-time `checks:` entry), then a new hypothesis "the guard keeps the risk below X" |
| the judge passes its planted-defect test | add `validated_by: <experiment_id>` to every check that uses it |

After every change: keep the cases it fixes in the dataset with `tags: {regression: "yes"}` (and `regression_of:` with
what broke), add a scenario test that pins the branch with `node_output` when the project has `tests/`, run
`aqven check`, and run a `look` over the regression tag on `dev`. Record the decision under "Decision" in the
experiment's `experiment.md`: the finding path, the quoted `verdict.text`, what changed in which files, and what risk
is left; put the finding path in the commit message.

### Never

Change two things between series; fix a downstream failure before the first upstream one; drop hard cases so a
finding passes; tune a prompt on `holdout` cases; move a metric, a threshold or a margin after the data came in
(that is a new experiment); compare a multi-call arm only against a single call; use a judge where `regex` or code
can check; weaken a type or a limit so a series passes; present a `dev` number as a finding.

### When to stop

Stop and report `FINDINGS.md`, your decisions, the spend and the risks left when every "done" criterion from stage 1
is `confirmed` on `holdout` and the regression look is clean; or a fresh exploration round finds no failure mode seen
twice; or two rounds in a row moved neither quality, `cost_of_pass` nor p95; or the needed N is out of reach and a
guard is in place; or the agreed budget is spent. Stop and ask the developer when traces are ready for notes, when a
series awaits approval, when several variants trade quality against cost, or when "done" turns out not to be
measurable.

## How to read `aqven check`

Every diagnostic has a code, a file with a path inside it, a message and often a hint that names the exact fix.

| Code starts with | Meaning | What to do |
|---|---|---|
| `E_` | error: the project is not runnable | fix it; `aqven check` exits with code 1 while any error is left |
| `W_` | warning: the project runs, something is unclear | read the hint; pin what it asks you to pin |
| `E_SIM_` | a simulated run of a flow failed | the hint carries the flow input the simulation used; reproduce it with `aqven run` |
| `W_SIM_NODE_UNREACHED` | no simulated input reaches this node | check the switch cases and conditions above it, or delete the node |

Examples: `E_REF_MISSING` (a binding points at something that does not exist), `E_BINDING_TYPE` (the bound value does
not fit the declared type), `E_INPUT_UNBOUND`, `E_PROMPT_VARIABLE_UNDECLARED`, `E_PROMPT_MISSING`,
`E_SWITCH_NOT_EXHAUSTIVE`, `E_OUTPUT_MODE_UNSUPPORTED`, `E_STRICT_UNSUPPORTED`, `W_OUTPUT_MODE_RESOLVED`,
`W_GENERATED_STALE`.

Experiments and datasets: `E_FLOW_UNKNOWN`, `E_ARM_UNKNOWN`, `E_RANGE_INVALID` (a `from`/`to` that is not a range of
top-level nodes), `E_VARIANT_INVALID` (an agent swap outside the range), `E_AGENT_UNKNOWN`, `E_DATASET_UNKNOWN`,
`E_DATASET_MISMATCH` (the dataset feeds another flow, or an arm's types differ from the subject's), `E_CASES_EMPTY` (the
tag filter selects nothing), `E_CASE_DUPLICATE`, `E_EXPECTED_MISSING` (an `expected` check on a case without
`expected_output`), `E_CHECK_PATH_UNKNOWN`, `E_METRIC_UNKNOWN`, `E_EXPERIMENT_UNKNOWN` (a `validated_by` that does not
exist), `E_ID_DUPLICATE`, `W_PLAN_EXCEEDS_CASES`, `W_CHECK_CONTEXT_MISMATCH`, `W_JUDGE_INPUT_UNBOUND`,
`E_FINDING_TAMPERED`, `W_FINDINGS_STALE`.

The hooks in `.claude/settings.json` run `aqven check --static` after every file edit and the full `aqven check` when
you stop, so a broken tree comes back to you instead of reaching a commit.

## Commands

| Command | What it does |
|---|---|
| `uv run aqven dev lumen` | project server, file watching, Studio in the browser; a server already running for the project is reused |
| `uv run aqven check lumen` | static check plus a simulated run of every flow |
| `uv run aqven check --static lumen` | static check only, without the simulated runs |
| `uv run aqven prompt preview support_case.polish__revise --project lumen` | the exact messages that llm node sends to the model |
| `... --input lumen/samples/case_request.json --variant tone=warm` | the same preview with your own input and a forced prompt variant |
| `uv run aqven models check --project lumen` | output modes of every agent model; `--live` sends one tiny request per mode |
| `uv run aqven models shapes <agent> --project lumen --live` | the agent model's real nesting depth, list length and enum size; billed, requires `--live` |
| `uv run aqven secrets lumen` | every provider, tool and MCP secret the project declares, where it comes from, and a masked tail if it's set |
| `uv run aqven generate lumen` | writes `lumen/types.py` |
| `uv run aqven tree lumen` | entities by kind with their files, experiments and arms included |
| `uv run aqven run support_case --root lumen --input lumen/samples/case_request.json` | runs a flow without a server |
| `uv run aqven series reply_look --path lumen` | runs a series of an experiment on `dev` and waits for its verdict; `--on holdout`, `--cases N`, `--repeats R`, `--cap USD`; `--json` prints the final state with the case rows as one JSON line |
| exit codes of `aqven series` | 0 the series is `done`, whatever the verdict; 1 `cancelled`, `failed` or no answer from the server; 2 a refused request (`NOT_RUNNABLE`, `NOT_FOUND`); 3 awaits a person's approval of the spend; 4 waits for a human answer |
| `uv run aqven mcp lumen` | MCP over stdio, registered in `.mcp.json` |
| `uv run python -m lumen` | the same server from the project's own entry point |
| `uv run pytest` | offline tests |
| `uv run ruff check . && uv run ruff format --check .` | lint and formatting |
