# Designing reliable workflows

More nodes, parallel branches, critic loops and judges are not automatically more reliable. What each construct assumes, when it fits, when it does not, and how to measure the choice on your own cases instead of arguing it.

## Contents

- [In short](#in-short)
- [Start from the simplest flow](#start-from-the-simplest-flow)
- [What each construct assumes](#what-each-construct-assumes)
- [Measure the choice instead of arguing it](#measure-the-choice-instead-of-arguing-it)
- [Where the showcase splits its steps](#where-the-showcase-splits-its-steps)
- [Parallel branches and their diversity](#parallel-branches-and-their-diversity)
- [A loop with a critic, and its stop policy](#a-loop-with-a-critic-and-its-stop-policy)
- [A judge that picks among candidates](#a-judge-that-picks-among-candidates)
- [A question per item of a checklist](#a-question-per-item-of-a-checklist)
- [Engine facts and common traps](#engine-facts-and-common-traps)
- [How this shapes what you do](#how-this-shapes-what-you-do)
- [See also](#see-also)

## In short

Splitting a step, running branches in `parallel`, looping on a critic and adding a judge all cost calls,
latency or both, and none of them buys reliability just by existing. Each one rests on an assumption about
your task: that parts are independent, that two readings fail in different ways, that something outside the
model can score a pass. AQVEN has no rule that picks a construct for you, and this page proposes none: it
lists what each construct assumes, when it fits, when it does not, and the experiment that settles the choice.

## Start from the simplest flow

The baseline of every comparison is the fewest steps that express the decisions your flow must make: often
one `llm` call on the whole input, plus `code` for deterministic work and `tool` for anything that leaves the
flow. Every other construct on this page is a candidate that has to beat that baseline on your cases. Offer
two or three candidates, say when each fits, and let an experiment choose.

## What each construct assumes

| Construct | It assumes | Fits when | Does not fit when | Measure |
|---|---|---|---|---|
| a new node for part of the work | the next piece of work fails differently, or produces something you can check before moving on | the kind of uncertainty changes (extraction, then classification, then generation), or the cost of being wrong changes | the new node repeats the same kind of decision with a longer prompt | a `flow` factor: the one-step and the split flow in one `call` slot |
| `map` over parts | parts are independent and each answer is local | pages, rows or segments each carry their own answer | the answer needs context across parts | calls × parts, plus a merge and a coverage guard for lost items |
| `switch` on a value | input kinds need different handling, and the kind is known or cheap to get | one prompt cannot serve every kind well | one prompt already handles every kind | the router's own error rate: a wrong route fails silently |
| `parallel` with a `join` | the branches' mistakes are not the same mistakes | the branches use other models or other views of the input | every branch repeats one call on one model | calls × branches, against a variant of equal budget |
| `loop` with a critic | something outside the generator can score each pass | a schema, a rubric with a threshold, or a critic you have measured | nothing external scores the pass | passes × calls; the critic's own recall on planted defects |
| a second model as a judge | the property is cheaper to check than to produce | code or a built-in check cannot decide it | a rule in code can decide it | the judge's own errors, measured on planted defects |
| a question per item of a checklist | asking about each item finds more than one open question | every item must be looked for explicitly | false alarms cost more than misses | precision and cost next to recall |

The assumptions in the second column are hypotheses about your task, not facts about models. A series on
your own cases is what confirms or refutes them.

## Measure the choice instead of arguing it

Each choice above is a question an experiment can answer. The showcase project has an
experiment for several of them. The showcase's design (three drafts, a judge panel, a critic loop) is one
project's choice, shown here for the mechanisms, not a shape to copy:

| The choice | The showcase experiment | Its question |
|---|---|---|
| a split step: condense first, then classify | `intent_split_long_messages` | `compare` with a `flow` factor: a two-step flow against a one-step flow in the same `call` slot, at most 50% dearer per correct intent |
| a second vote on the evidence | `intent_ballot_pair` | `compare`: a pair of ballots settled by confidence against one ballot, with valid first outputs as a guardrail |
| a three-judge panel or one judge | `panel_single_judge` | `compare` on median latency, with the winner and the success rate as guardrails |
| which model does one job | `intent_escalation_agents` | `noninferior` with an `agent` factor: one agent against another on the same node, with valid first outputs and p95 latency as guardrails |
| how often a critic catches a defect | `critique_recall_by_agent` | `threshold`: each critic agent stops more than 80% of replies with a planted defect |
| how noisy a comparison is on its own | `panel_aa_noise` | `compare` of two identical runs with margin 0: the noise floor a real comparison has to beat |

A structure that calls the model more often than the baseline can win because it calls more, not because of
its shape. Before you credit the shape, add a variant with the same budget, for example k identical calls in a
`parallel` and a `code` majority vote. The server doesn't check call counts for you.
How to write an experiment covers the file, and
How a series decides covers the verdict.

## Where the showcase splits its steps

The showcase's `support_case` flow crosses several boundaries in a row. Each one is its author's choice, and
each is a mechanism you can reuse or leave out:

- `triage` is an `llm` node that extracts a short summary and a list of observations from the raw case.
- `vote` and `tally` classify the intent: three calls through a `map` with different prompt angles, reduced by
  a `code` node into one label. `intent_ballot_pair` measures whether more than one ballot pays.
- `drafts` generates three reply candidates in `parallel`, one per model family.
- `panel` calls a separate flow, `judge_panel`, that scores the candidates against a rubric.
- `polish` is a `loop` that revises the winning draft against a critique score.
- `approvals` waits on a person with a `human` node.
- `finalize` is a `code` node, because nothing left to decide is probabilistic.

The question behind each split is the same: does the next piece of work resolve a different kind of
uncertainty, produce something you can check before moving on, or change the cost of being wrong? If none of
those is true, it is more likely the same step. Whether a particular split pays is a `flow` factor to measure.

## Parallel branches and their diversity

The showcase uses `parallel` in two ways. `drafts` runs three branches on three model families and joins them
with `quorum(min_ok: 2)`: the node closes as soon as two branches succeed, so one model being down does not
stall the case, and the slowest branch never takes part. `vote` runs one inexpensive model three times through
a `map`, each with a different prompt angle.

A common hypothesis is that branches from different models, or from materially different prompts, make less
correlated mistakes than the same prompt re-run on the same model at a nonzero temperature. It is plausible and
it is not a fact about your task. Two measurements test it: an A/A experiment shows how much identical runs
disagree, and a variant of k identical calls with the same budget shows whether the diverse branches beat
plain repetition. A step that is a deterministic transformation (parsing a date, mapping a code to a category)
usually has no second reading to add, and `code` may replace the model entirely.

## A loop with a critic, and its stop policy

The showcase's `polish` node is a `loop`: it revises the draft, a critic from another model family scores the
result, and it repeats up to three passes. Its stop policy reads the score: `threshold(gte: 0.85)` stops when
the score clears 0.85, `stagnation(window: 1, min_delta: 0.02)` stops when a pass fails to move it by at least
that much, and `select: best` keeps the pass that scored highest, not the last one.

Two things here are engine facts. A `loop` without `stop:` runs to `max_iter` on every case, whether the extra
passes help that case or not. And `select` decides which pass the node returns. Two things are the author's
assumptions: that a critic from another family catches more than the generator re-reading its own answer, and
that the score tracks what the owner cares about. `critique_recall_by_agent` measures the first on planted
defects; a comparison of the loop against one pass with the same budget measures whether the loop pays at all.

## A judge that picks among candidates

The showcase's `judge_panel` flow has three `llm` judges from three model families score the same candidates
in `parallel`. A `code` node aggregates their scores, and a `switch` calls a fourth judge as a tie-break when
they disagree.

The design assumes that a judge from another family than the models it scores shares fewer of their blind
spots. That is a hypothesis, and AQVEN lets you enforce it where you decide it matters: `judge_panel` declares
`requires:` rules (`families_distinct` for its judges, `family_disjoint_from_input` against the candidates'
authors), and `aqven check` verifies them before the flow ships. Nothing enforces it unless you write
the rule. The same `requires:` block pins field order, so each judge writes its `rationale` before its
`scores`. Whether a panel beats one judge is `panel_single_judge`; how much its verdicts vary on their own is
`panel_aa_noise`.

## A question per item of a checklist

Some steps look for many things at once: 40 clauses a contract should have, 30 sound events in a recording, a
list of defects in a product photo, a set of rules for a code change. One yes/no question per item tends to
find more of what is there, and it also tends to say yes more often to what is not there, at several times the
cost of one open question.

Measure precision and cost next to recall before you keep a checklist. The candidates to compare include one
open question, a question per item, a yes that must carry evidence (a quote, a timestamp, a page and line, a
region) checked by a rule, and several readers whose answers are merged. Each is a variant of the same step.

## Engine facts and common traps

- A `loop` with no `stop:` runs to `max_iter` on every case.
- `quorum` closes on the first `min_ok` successful branches; it is a race, not a wait for the slowest.
- `requires:` rules are checked only where a flow declares them.
- A structure that calls the model more often compared only with a single call: the win may come from the
  budget, not the structure.
- A checklist judged by recall alone: false alarms and cost go unmeasured.
- A critic or judge trusted before its own errors were measured: its mistakes enter your metric.

## How this shapes what you do

None of this is a gate `aqven check` runs for you by default, except the `requires:` rules you write
yourself. Picking a join policy, writing a stop condition, choosing a critic's model and deciding whether a
step deserves its own node are choices you make while writing the flow. Start from the simplest flow, name one
or two alternatives with what each assumes, and keep a construct only when an experiment on your cases shows it
pays for its calls. [How to branch into parallel steps](../engine/parallel-node.md) and
How to repeat a step with a limit cover the mechanics.

## See also

- Ten kinds of nodes: every node kind as a mechanism.
- How to write an experiment: measuring a split, a panel or a critic on your own
  cases.
- [How to branch into parallel steps](../engine/parallel-node.md): the `parallel` node's fields and its four
  built-in join policies, including `quorum`.
- How to repeat a step with a limit: the `loop` node's fields, its `stop` and `select`
  policies, and the full `polish` example.
- How to route by a value: the node kind `judge_panel`'s `decide` step uses.
- How to reuse a flow as a step: a `call` node, and a `call` slot for comparing flows.
- [Built-in policies and evaluators](../reference/built-in-policies.md): every join, stop and select policy's
  full signature, generated from the code.
