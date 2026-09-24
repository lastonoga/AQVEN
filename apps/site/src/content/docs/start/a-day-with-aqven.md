---
title: A day with AQVEN
description: One working day of a small business owner and a coding agent, from a slow support desk to a workflow with findings behind it — who types what, and who decides what.
---

This page follows one working day. I run a small business, I have a coding agent (Claude Code, or any
agent that speaks MCP), and I want an AI workflow I can rely on. The business is invented, but the files
are real: they make up AQVEN's showcase project, and every workflow file named below is in it. Only the
findings are missing, because the day's series write them. To get your own copy, run
`{{CLI_COMMAND}} new my_project --template showcase --provider openrouter` (see the
[quickstart](/start/quickstart/)).

The point is the way of working. I give the task and make the decisions. The agent builds, runs, checks
and experiments, round after round. Studio is where I watch.

## 8:30 — the problem

I sell smart lighting under the name Lumen: lamps, light strips, smart bulbs. Customers write through my
own store, Amazon and Ozon. Two people read every message, work out what happened, check the policy and
reply. It is slow, and it is inconsistent: the same burning smell gets "unplug it now" from one of them
and a troubleshooting guide from the other.

Last month I pasted the policy and one message into a chat model, and the reply was good. That demo is
where my questions start. Does it hold on real messages: long ones, angry ones, marketplace ones? What
does a case cost? When a reply is wrong, which part went wrong: reading the message, the decision or the
wording? A reply that promises a refund nobody approved costs me real money.

## 9:00 — the task

I open the agent in the project folder. `.mcp.json` connects it to AQVEN's MCP server, and `AGENTS.md`
and `CLAUDE.md` tell it how to work here. I type:

> Build a workflow that takes a customer case and drafts a reply my support lead can approve. Done means
> the reply never promises more than the decision gives, and a case costs under a cent. Work in rounds,
> and ask me before you spend more than a dollar.

The agent doesn't write anything yet. It sends me one message of questions: which fields come in, what
goes out, who approves, what happens on a safety risk. Then it writes files in order: types such as
`types/records/observation.yaml`, agents such as `agents/gemini.yaml`, the nodes, and
`flows/support_case/flow.yaml`. A step that calls a model, such as `triage`, is three files in
`flows/support_case/nodes/triage/`: `triage.node.yaml`, `triage.inference.yaml` with the typed input and
output, and the prompt `triage.prompt.md`. Last
comes `datasets/support_case_cases.yaml`: Lumen cases with an expected output and tags such as `channel`,
`action` and `length`.

```text
aqven_check
prompt_preview  {"flow_id": "support_case", "node_id": "triage"}
run_start       {"flow_id": "support_case", "mode": "live", "dataset_item_id": "support_case_cases/strip_flicker_credit"}
```

In Claude Code, a hook runs `{{CLI_COMMAND}} check --static` after every edit, so a broken reference comes
back at once, and the full check runs before the agent finishes its turn. The first version is the
simplest flow that works: one model step per real decision, code for the rest. The eighteen steps in the
showcase's `flow.yaml` are where more days like this one led.

I start Studio with `uv run {{CLI_COMMAND}} dev my_project`. The **Graph** tab draws every step, and a
click on `triage` shows its prompt. On **Runs** I open the agent's run: one card per step, and the cost
and duration at the top. The shape is right, and I add one rule: nothing reaches a customer before my
support lead approves it. That becomes the `approvals` step.

## 10:30 — the first surprise

> Run it on a handful of cases and show me what fails.

The agent starts a look: it runs the cases and shows each one with its checks, cost and trace, with no
verdict. One attempt ends `failed` with `MODEL_RETRIES_EXHAUSTED` at `triage`. The `gemini` agent, a
cheap model that can read the photos and invoices customers attach, wrote an observation longer than the
200 characters the `Observation` type allows. It did so on its first answer and on both retries (`output.retries: 2`).

The engine refused that output instead of passing it downstream. In Studio the run shows a red panel at
`triage` with the error code and a hint that names two ways out: tighten the prompt, or raise `maxLength`
in the type. Under the step are the three failed attempts, each with an excerpt of what the model
returned.

```text
run_events      {"run_id": "<run_id>"}
prompt_preview  {"flow_id": "support_case", "node_id": "triage"}
```

The agent asks me before it touches the limit, because that decision is mine. My support lead reads the
observations on the case record, so 200 characters stays. The preview shows that the model is already
told `observations[].value: at most 200 characters`. The prompt asks for the right thing and the model
sometimes ignores it, so this is a risk to measure, not a typo to fix. The failure mode gets a name,
`triage_contract_broken`, and `AGENTS.md` uses this very hypothesis as its worked example: `gemini` on
`triage` keeps its output contract in fewer than 95% of attempts, with `gpt` as the reference.

## 11:30 — risky hypotheses

> What else could break? Rank it by what it would cost me, and write each one down before you run
> anything.

The agent groups the failing traces into failure modes and writes one experiment per mode under
`experiments/`. Each `experiment.yaml` states a claim with a number, picks its cases from a dataset, names
its checks and sets a margin, all before any data. Each claim could come out against us, which is why it
is worth a test:

- `reply_overpromise_risk`: the `polish` loop keeps the reply within the decision in more than 97% of
  attempts, margin 0.01. A refund nobody approved is my costliest mistake, and a rate of a few percent
  doesn't show in twelve attempts, so the plan asks for 20 repeats of each case.
- `intent_split_long_messages`: condensing a long message before deciding the intent beats one step by
  more than 0.05, at most 50% dearer per correct intent. Long messages often open with a late parcel or a
  compliment, and a cheap model tends to classify the opening. Both versions run on the same cheap `llama`
  agent, so only the structure differs.
- `reply_noninferior_mistral`: the cheaper `mistral` agent revises the reply in place of `gpt`, scoring
  no more than 0.05 lower, with a passing reply at most 20% dearer.
- `critique_planted_defects`: the DeepSeek critic that scores the mistral question is tested first. Its
  verdict must match the label in more than 85% of attempts on sixteen replies, half clean, half with one
  planted defect such as a wrong amount or a dropped safety instruction.

A variant never names a bare model. It puts an agent on a step, `agents: {polish__revise: "mistral"}`,
and `agents/mistral.yaml` carries the model, its settings and its output mode.

In Studio I switch to **Research** and open `reply_noninferior_mistral`. I see the **Hypothesis** card and
the variants table with its swap, `polish › revise: agent gpt → agent mistral`. The `critique` judge has
a **validated** tag that points to `critique_planted_defects`. The tag only says which test vouches for
the judge, so I want that test confirmed before I trust this question. I read the margins closely,
because they are business decisions: 0.05 is how much reply quality I will give up for a cheaper step.
The **Launch** panel shows the price before anything is spent. In AQVEN's own copy of this project, with
nothing run yet, a held-out series was priced at ≤ $0.0056 for `intent_split_long_messages` and
≤ $0.098 for `reply_noninferior_mistral`. Both are upper bounds, because there is no past run to learn
from, and your numbers will move with the day's model prices. Both are far under the project's $1.00
spend cap. I tell the agent to go.

## 13:30 — explore on working cases

> Explore. One change between series, and show me the failing cases, not the averages.

```text
series_start  {"experiment_id": "intent_split_long_messages", "on": "dev"}
series_get    {"series_id": "<series_id>", "wait_seconds": 50, "include_cases": true}
```

The server puts each case of a dataset, for good, on one of two sides by a hash of its name: about half
are working cases, the rest are held out. Explore runs the working cases as often as needed. It gives
numbers and a `signal`, never a finding: a finding is the verdict on held-out cases that goes on record.

The agent reads each failing case down to the first step that failed, changes one thing and runs again.
For the `triage` limit, one change is a variant that puts `gpt` on `triage` to see whether it keeps to
200 characters. For replies that promise too much, it is a run-time check on the revise step,
`promises_match_resolution` from `code/support_case.py`, which sends any such reply back for another try.
If condensing helps only on `very_long` messages, the experiment's `experiment.md` already says what
then: put the split behind a length switch.

In Studio, the **Series** tab lists every series. A series page fills in live: **Variants × metrics**
shows a dot for each value and a whisker for its 95% interval, and **Stability** counts the cases that
pass every time, never or sometimes. I filter **Cases** to **Variants disagree** and follow an attempt to
its run. My decision is when the question is frozen. Once the change is done, the metric, the threshold
and the margin stay put; moving them after seeing data makes a new experiment.

## 15:30 — confirm on held-out cases

> Confirm the split once on held-out cases. Keep this first one tiny, three cases and one repeat, five
> cents at most. I want to see the whole path.

```text
series_start  {"experiment_id": "intent_split_long_messages", "on": "holdout", "cases": 3, "repeats": 1, "cap_usd": 0.05}
```

The estimate warns that three cases is below the recommended size. The estimate and the five-cent cap are
both under the project's $1.00 cap, so the series starts on its own, and it stops if it reaches five
cents. A series estimated above $1.00, or one with no price at all, would wait in **AWAITING APPROVAL**:
the agent tells me, and only I can click **Approve spend**. The agent has no tool for it.

Six attempts later the series has spent $0.00096. The verdict is `inconclusive`, reason `uninformative`:
both versions got all three cases right. Three of three still leaves each version a 95% interval from
0.44 to 1.00, and with no case where the two differ there is nothing to compare. The agent quotes the
server's sentence as written, without rounding or retelling it.

The finding is written once, to `experiments/intent_split_long_messages/findings/<series_id>.yaml`, and
`FINDINGS.md` at the module root gains a line under `intent_misread` on its **Inconclusive** shelf, with
the scope: `holdout`, 3 × 1, the model and the date. Inconclusive means nobody knows yet, not that
the risk is gone. The cases were too easy, and every further series on the same three would be counted in
the finding. So the agent writes boundary cases, where the opening topic and the intent differ, for a new
held-out series at the recommended size.

Once `critique_planted_defects` has confirmed the critic, the reviser question goes the same way. Say it
comes back as `mistral vs gpt on critique: -0.010 (95% CI -0.040 to +0.020): not worse by more than the
0.05 margin; guardrail cost_of_pass holds.` That is `confirmed`. The agent points `agent:` in
`flows/support_case/nodes/polish/revise.node.yaml` at `mistral`, keeps the cases this change fixes in the
dataset tagged `regression: "yes"`, records the decision under "Decision" in `experiment.md`, and names
the finding path in the commit message.

## 17:00 — end of the day

> Before tomorrow: what do we know, what is left, and what did it cost?

The agent reports `FINDINGS.md`, its decisions, the spend of every round and the risks left. That file is
how knowledge adds up: the agent reads it before any change, builds on what is confirmed and doesn't test
it again unless the flow changed. A finding speaks only for the flow, prompts and models it ran on.

One question has a limit I can see. `reply_overpromise_risk` wants a margin of 0.01. At two repeats per
case its estimate recommended about 1187 cases, and only six working cases were available. The agent says
so instead of pretending, and I make the call: the guards stay, the run-time check on the revise step and
my support lead's approval.

We stop when every "done" criterion is confirmed on held-out cases and a look over the regression cases
comes back clean. We also stop when a fresh round finds no failure mode seen twice, when two rounds in a
row moved neither quality, cost per passing case nor p95 (the slow end of response times), or when the
budget is spent. Until then, tomorrow starts with `FINDINGS.md`.

## Who did what

| Me | My agent |
|---|---|
| Said what the workflow is for and what "done" means in numbers | Asked the questions that change the build, in one message |
| Read the graph, the runs and the failing cases in Studio | Wrote types, agents, nodes, prompts, the flow and tagged cases as files |
| Decided the 200-character limit is a requirement | Ran `{{CLI_COMMAND}} check` after every change and read the prompt previews |
| Agreed the margins: how much quality a cheaper step may lose | Traced each failure to its first failing step and named the failure mode |
| Held the spend: the $1.00 cap, and any approval above it | Wrote each hypothesis as an experiment before any data |
| Said when a question was frozen and when to confirm | Explored on working cases, one change at a time |
| Chose a guard where the needed data was out of reach | Confirmed once on held-out cases and quoted the verdict |
| Decided when to stop | Applied findings, kept regression cases, reported spend and risks |

## Go further

- [How to set up a coding agent outside Studio](/mcp-cli/set-up-an-agent-outside-studio/): connect the
  agent this page assumes.
- [How an agent takes a task to a reliable flow](/mcp-cli/research-loop/): the loop behind this day,
  stage by stage.
- [From a bad answer to a verified fix](/start/engineering-loop-walkthrough/): the same loop by hand.
- [Experiments, series and findings](/concepts/experiments-series-and-findings/) and
  [How a series decides](/concepts/how-a-series-decides/): why the question comes before the data.
- [How to run a series](/engine/run-a-series/) and [How to use Research in Studio](/studio/research/):
  the mechanics behind the afternoon.
