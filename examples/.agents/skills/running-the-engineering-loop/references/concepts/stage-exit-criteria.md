# When a stage is done

The exit criterion of every stage between a request and a reliable flow, the false exits that look like progress, the stage of the flow each experiment measures, and when to stop the whole loop or stop and ask.

## Contents

- [In short](#in-short)
- [Stages and their exits](#stages-and-their-exits)
- [False exits](#false-exits)
- [The stage of the flow and its metric](#the-stage-of-the-flow-and-its-metric)
- [When to stop the loop](#when-to-stop-the-loop)
- [When to stop and ask](#when-to-stop-and-ask)
- [An example](#an-example)
- [How this shapes what you do](#how-this-shapes-what-you-do)
- [See also](#see-also)

## In short

Work on a flow moves through stages: contract, simplest flow, cases, a first look, error analysis,
fixing the specification, hypotheses, Explore, Confirm, applying the finding. Each stage ends on a
criterion you can check, not on a feeling. The common false exits are a clean `aqven check`
taken for a working flow, one run taken for proof, and a signal on working cases taken for a finding.
Every experiment also measures one stage of the flow itself, and that stage decides the metric. The loop
stops on one of five conditions, and it stops to ask whenever a decision belongs to a person.

## Stages and their exits

| Stage | Done when | Not done just because |
|---|---|---|
| Contract | purpose, input, output, a measurable "done" (which check, which number), a budget per run and per series, and a latency are agreed; the models and providers are the ones the owner chose | the request sounds clear |
| Simplest flow | one `llm` step per real decision, `code` for the rest; `aqven check` is clean; the prompt preview of every `llm` node is read in full; one run on a real input passed, and its output reads well in the run view | `aqven check` is clean |
| Cases | a dataset with truth and tags exists; negative controls sit next to the positives; the count per compared tag value and half is known | the dataset file loads |
| First look | a `look` over working cases ran with cheap deterministic checks, and every failing case row was read | the series finished |
| Error analysis | the owner read the first traces and wrote notes; every failure has its first failing node and a failure mode the owner agreed to; new failing traces stop adding modes | the agent grouped the failures itself |
| Fix the specification | the failures the prompt never asked about are fixed in the prompt or the type, and the first look ran again | the prompt was edited |
| Hypotheses | each remaining failure mode has an experiment written before any number, and it passed the validity gate | `experiment.yaml` passes `aqven check` |
| Explore | series on working cases, one change between series, until the change is done and the question is frozen | a signal looks good |
| Confirm | one series on held-out cases, announced first in one line: the claim, why now, what each verdict means; `verdict.text` quoted | the series ended |
| Apply | the flow changed, the cases the change fixes are kept with a `regression` tag, a look over them is clean, the decision is written down | the winning variant exists |
| Decide | a new round on fresh cases, or a report with the findings, decisions, spend and remaining risks | the experiments allowed so far ran out |

## False exits

These look like progress and aren't:

- **A clean check.** `aqven check` proves the wiring and a simulated run. It says nothing about
  what a real model does with a real input.
- **One run.** One run proves one case. Two runs, one that extracts every line item of an invoice and one
  that misses half of them, prove nothing about line items in general.
- **A signal.** A series on working cases gives numbers to steer by, never a finding. A good number there
  is a reason to confirm, not a result.
- **A provisional verdict.** A verdict read while the series is still running can flip before it ends.
- **A taxonomy without traces.** Failure modes named before anyone read a trace test failures the flow
  may not have.

## The stage of the flow and its metric

"Stage" also means a part of the flow you are building. A flow often grows in layers: a divergent layer
that must find every candidate, then a judge that picks among them. While you build one layer, its own
job is the goal:

| Layer being built | "Good" means | Main metric |
|---|---|---|
| divergent: extractors, candidate generators | nothing is missed | recall on labelled positives, completeness |
| judge or filter | only right things pass | precision, agreement with labels |
| the whole flow | the contract's "done" | the contract's check and number |

Write the current layer and its "good" at the top of the project's
research journal, and check it before every held-out series. A threshold
for the whole flow, put on the divergent layer, fails a layer that did its job. Errors the judge will
remove later are the next stage's problem, not this one's.

## When to stop the loop

Stop and report when one of these holds:

1. **Done.** Every "done" criterion of the contract is `confirmed` on held-out cases, and the regression
   look is clean.
2. **Saturated.** A new round of exploration on fresh cases finds no failure mode seen at least twice, and
   the known modes are closed by a finding or a structural guard.
3. **Flat.** Two rounds in a row improved neither quality, `cost_of_pass` nor p95 without making another
   one worse.
4. **Out of data.** The launch plan recommends more cases than you can get. The answer stays "unclear",
   and a structural guard goes in instead.
5. **Out of budget.** The spend of the rounds reached the limit agreed with the owner.

## When to stop and ask

Stop before any of those, and ask the owner of the flow, when:

- traces wait for their notes: the first ones, or failures that fit no known mode;
- a series waits for approval of its spend;
- variants trade quality against cost, and the choice is a product decision;
- "done" turned out to be unmeasurable or contradictory;
- a failure mode needs human labels (tone, usefulness) that no truth by construction can give;
- the owner asks to skip a stage: name its cost in one line, and let them choose.

Working on your own under an instruction like "go on, don't ask", keep to cheap steps inside the task. At
the number of experiments the owner allowed, stop, report and update the journal.

## An example

The contract of a flow, written before the simplest flow, in the `experiment.md` of the first look:

```markdown
## Contract

- Purpose: flag customer messages that ask for a refund, for the refunds queue.
- Input: the message text and the order id, if any.
- Output: asks_refund (yes or no) and the sentence that asks, if any.
- Done: flag_matches_label above 0.90 on messages that ask, and above 0.95 on messages
  that don't, confirmed on held-out cases.
- Budget: $0.002 per run; the project spend cap per series.
- Latency: under 3 s per message.
- Now: building the detector; the queue routing comes later.
```

## How this shapes what you do

- Check each stage's exit criterion before you move on, and name which one is not met yet.
- Treat a clean check, one run, a signal and a provisional verdict as steps, never as results.
- Name the layer of the flow you are building and its metric before you pick a threshold.
- Stop on one of the five conditions, and stop to ask when a decision belongs to a person.

## See also

- [How an agent takes a task to a reliable flow](../mcp-cli/research-loop.md): the loop, round by round.
- [The engineering loop](engineering-loop.md): from an incident to a verified fix.
- Correctness needs ground truth and a control: metrics per stage.
- The research journal: where the current stage is written down.
