---
title: Designing reliable workflows
description: More nodes, more parallel branches, and more critic loops are not automatically more reliable — when splitting a step, branching into parallel, looping on a critic, or building a judge panel actually earns its cost.
---

# Designing reliable workflows

## In short

Splitting a step into more nodes, running branches in `parallel`, looping on a critic, or building a
judge panel all cost something — latency, money, or both — and none of them buy reliability just by
existing. Each is worth it only at a real boundary: a genuine change in the kind of uncertainty a step is
resolving, a verifiable intermediate result, or independent signal that a single call can't produce on
its own. AQVEN's showcase project already makes these calls well in several places; this page names the
judgment behind them so you can make the same calls in your own flows.

## Where a step earns its own node

A new node is worth its cost at a real boundary, not just because a prompt is getting long. The
showcase's `support_case` flow shows several real ones, back to back:

- `triage` is an `llm` node doing extraction — turning a raw case into a short summary and a list of
  observations, every one of them traceable to something actually in the case.
- `vote` and `tally` come next, and they're a different kind of step: three independent votes on the
  case's intent, reduced by a plain `code` node into one label the rest of the flow treats as settled
  data. That's a boundary worth crossing on its own — the flow needs a single intent, not three opinions,
  before it can route on it.
- `drafts` is open-ended generation — three parallel attempts at a reply, each one introducing text that
  wasn't in the input, which is a genuinely different kind of uncertainty from either extraction or
  classification.
- `panel` calls a separate flow, `judge_panel`, to pick a winner — scoring existing candidates against a
  rubric, not producing more text. It's a distinct step because judging and generating fail in different
  ways and need different checks.
- `polish` loops on the winning draft with a critique behind it — another distinct step, because it's
  neither a first attempt nor a one-shot judgment, but iterative refinement against a score.
- `approvals` waits on a person — the stakes and the kind of check both changed again.
- `finalize` is a `code` node — by this point nothing left to decide is probabilistic, so a deterministic
  step is the right one.

None of these splits follow a step-count rule or a reliability formula — AQVEN doesn't have one, and this
page isn't proposing one. The judgment is qualitative: does the next piece of work resolve a different
kind of uncertainty than the step before it, does it produce something you can actually check before
moving on, or does the cost of being wrong (or the cost of a retry) change enough to deserve its own
step? If none of those is true, it's more likely the same step than a new one.

## When parallel and a join policy are worth the cost

The showcase reaches for `parallel` twice for the same underlying reason — get more than one independent
signal before committing to an answer — and picks a different shape each time, because the diversity
comes from a different place.

`drafts` runs three `llm` branches against three different model families — OpenAI-family,
Mistral-family, and Google-family models, not the same model called three times — and joins them with
`quorum(min_ok: 2)`: two
family-diverse drafts are enough to work with, and one model being down or refusing doesn't have to stall
the case. `vote` takes a different route to the same idea: one inexpensive model, run three times through
a `map` node, but with a different prompt angle each time — one pass reads mainly the customer's own
words, one reads mainly the observed facts, one reads mainly the cost of guessing wrong. A `code` node
afterward, `tally`, counts the three intents and only calls it agreement once at least two of them match
with high enough average confidence; otherwise it falls back to whichever single vote was most confident.

Both are legitimate diversity, but they're not equally strong. Diversity from different models, or from a
materially different prompt angle on the same model, gives you branches whose mistakes tend not to be
correlated — one model's blind spot usually isn't another's, and a prompt that makes the model focus on
facts over wording fails differently than one that doesn't. Diversity from re-running the identical
prompt on the identical model at a nonzero temperature is much weaker: it looks like three opinions, but
it's closer to the same opinion measured three times with noise added.

That's also the answer to when not to reach for `parallel` at all. If a step is a single deterministic
transformation — parsing a date, mapping a code to a category, reformatting a reply for a channel —
whatever variance you'd see across three calls comes from the model's own instability, not from a real
difference in what each call is looking at. Running it three times and joining the results doesn't add
anything a single call didn't already have; `drafts` and `vote` exist because the workflow needed
genuinely different candidates to reconcile in the first place, not because more calls are inherently
safer than one.

## When a loop critic earns its keep — and why it needs a real stop policy

The showcase's `polish` node is a `loop`: it revises the winning draft, has a critique from a different
model family score the result, and repeats — up to three passes — until the score clears a threshold or
stops improving. Two choices make this loop worth running, and both are decisions its author made, not
something a `loop` node does automatically. The critic (`mistral`) is a different model family from the
generator (`gpt`) — a model reviewing its own answer, in its own context, isn't a real check, because
whatever it got wrong the first time it's likely to miss again on review; a different model at least has
an independent chance of catching it. And there's an external number to check against — `critique`'s
score — rather than a vague "does this look better now." The stop condition reads it explicitly:
`threshold(gte: 0.85)` stops the loop the moment the score clears 0.85, `stagnation(window: 1, min_delta:
0.02)` stops it the moment a pass fails to move the score by at least that much, and `select: best` keeps
whichever pass actually scored highest — not necessarily the last one that ran.

The judgment call behind reaching for a `loop` critic at all: it only earns its cost when there's a
genuine external check driving the stop condition — a schema the draft has to satisfy, a rubric with a
real threshold, a critic that's meaningfully independent of the generator. A loop that just asks the same
model to re-read its own output, with nothing external to check against, isn't doing useful work — it's
paying for extra calls to get the same blind spot back. And a `loop` with no `stop:` policy at all,
relying only on `max_iter`, has a different problem: it runs to the cap on every single case, whether the
extra passes are actually improving anything or not, instead of stopping early on the cases that didn't
need them.

## A judge panel: a real verdict, not just another draft

Judging is a different kind of step from generating, and the showcase's `judge_panel` flow treats it as
one. Three `llm` judges — DeepSeek-family, Qwen-family, and Meta-family models — score the same
candidates independently and in parallel. A `code` node aggregates their scores, and a `switch` node
checks whether they agree closely enough; when they don't, it calls in a fourth judge — an OpenAI-family
tie-break — to settle it.

The judgment call: a judge scoring another model's output is only as trustworthy as its independence from
what it's judging. A judge sharing a model family with the model it's scoring tends to share that
family's blind spots too, so a panel built from one family just repeats the same bias under a different
name and calls it consensus. `judge_panel` is deliberately built so none of its four judges share a
family with each other, and — just as important — none of them share a family with the models that
produced the drafts they're scoring. AQVEN can check this for you, but only where you ask it to:
`judge_panel`'s own flow definition declares it as an explicit requirement — that its three judges come
from distinct families, and that none of them shares a family with whatever produced the candidates — and
`aqven check` verifies that requirement before the flow ships. That check is opt-in, attached to this one
flow because its author asked for it; it isn't something every panel, or every `parallel`/`loop` scoring
a model's output, gets for free. The same requirement also pins down field order for each judge: a
`rationale` is written before the `scores` it's supposedly justifying, so the verdict gets argued into
existence rather than decided first and rationalized afterward.

## Watch out for

- A `loop` with no `stop:` policy — it runs to `max_iter` on every case, spending the same passes whether
  they're helping that case or not.
- A `parallel` node whose branches all call the same model with the same prompt — three calls that report
  back as three opinions, but a `quorum` join can't manufacture independence that was never there.
- A critic or judge that shares a model family with whatever it's grading — the second opinion shares the
  first one's blind spots.
- A critic loop with nothing external to check against — no schema, no rubric, no threshold, just "does
  this look better" — which a model can't judge about its own kind of mistake any more reliably than it
  avoided making the mistake the first time.

## How this shapes what you do

None of this is a gate `aqven check` runs for you by default. Picking a join policy, writing a stop
condition, choosing a critic's model family, and deciding whether a step deserves its own node are
judgment calls you make while writing the flow — not warnings the compiler raises if you skip them, with
the one exception of a `requires:` contract you write yourself, the way `judge_panel` does. [How to branch
into parallel steps](/engine/parallel-node/) and [How to repeat a step with a limit](/engine/loop-node/)
cover the mechanics: the fields, the four built-in join policies, the two built-in stop and select
policies. This page is about which of those tools is worth reaching for before you write the YAML — build
the extra node, the parallel branch, or the critic loop where a real change in uncertainty, a verifiable
score, or genuine independence justifies its cost, and skip it where it wouldn't add anything but latency.

## See also

- [How to branch into parallel steps](/engine/parallel-node/) — the `parallel` node's fields and its four
  built-in join policies, including `quorum`.
- [How to repeat a step with a limit](/engine/loop-node/) — the `loop` node's fields, its `stop` and
  `select` policies, and the full `polish` example this page draws its critic-loop judgment from.
- [How to route by a value](/engine/switch-node/) — the node kind `judge_panel`'s `decide` step uses to
  choose between a consensus verdict and a tie-break.
- [How to reuse a flow as a step](/engine/call-node/) — how `support_case`'s `panel` node calls
  `judge_panel` as if it were one node.
- [Ten kinds of nodes](/concepts/ten-kinds-of-nodes/) — the full set of node kinds this page assumes,
  including which three run other nodes as their body.
- [Built-in policies and evaluators](/reference/built-in-policies/) — every join, stop, and select
  policy's full signature, generated from the code.
