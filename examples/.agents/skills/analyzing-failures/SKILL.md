---
name: analyzing-failures
description: "Turns AQVEN runs into agreed failure modes: first failing node, owner-read traces, riskiest hypothesis first, one check per claim. Use first when runs are in but answers look wrong, when asked for a check of how often an output fails, and before any hypothesis."
---

## MUST

- Offer the owner the first traces. If the owner declines, record it, read them yourself and write the notes; the
  owner confirms the modes. Never invent modes without reading traces.
- A question about the data is asked through a check of an experiment, never through your own script over REST
  or over `.aqven/`: the engine scores a check on every attempt and the owner sees it. A stage is measured by an
  experiment whose subject range ends at that node (`designing-experiments`).
- New check functions need no server restart: project Python reloads on the next run.
- Test the owner's premise on data already paid for before spending more.
- Web search is for literature only, never for facts about the engine.

## Procedure

| # | Step | Exit criterion |
|---|---|---|
| 1 | A `look` experiment on `dev` with cheap deterministic checks and `repeats: 1`, or `series_start` with `look` over named cases; then `series_get` with `include_cases: true` (with many variants, aggregates first: `running-series`) | every failing row read |
| 2 | For each failed attempt: the first failing node (`debugging-runs`), infrastructure error or counted failure | a table attempt → node → code |
| 3 | Offer the owner about 30 traces: failures first, then a few passing ones, each with its `run_id`, the Studio link `/runs/<run_id>` and the first failing node; ask for one short note per trace. A decline is recorded in the look experiment's `experiment.md`; then you read the traces and write the notes | notes received, or written by you after a recorded decline |
| 4 | Group the notes into modes: an id, a one-line definition, a count, 2 or 3 `run_id`s | the list agreed and written under "Failure modes" in the look experiment's `experiment.md` |
| 5 | Filter: specification gap, wiring, infrastructure, generalization gap | experiments only for generalization gaps |
| 6 | Scan literature and the web for the riskiest assumptions; mark domain assumptions that need an expert | sources cited |
| 7 | Order: first the hypothesis that could kill the product, then by count and harm; check ordinal fields for a pull to the middle | the hypothesis list agreed with the owner |
| 8 | One check per claim: what the claim is about comes from the case (a tag or `expected_output`), never from what the model happened to say; "returned something" never measures "returned the right thing" | every claim has a check that can refute it |
| 9 | Test the owner's premise, and any combination, on paid outputs before building it. A rule over outputs (the union or a vote of candidate variants, a merge in code): a test with `pytest_run` over outputs taken from `run_get_node` (`include_payloads: "full"`). A downstream model stage: its ceiling from a range experiment on that stage with the upstream truth in `node_outputs`, next to its value on the upstream outputs it really gets. Each result is a hypothesis until a variant runs the combination | a conclusion from outputs already paid for, or from one small range experiment, before the combination is built |
| 10 | Label audit on the cases every variant fails: open each input next to its label, count the disputed labels, hand them to the owner or an expert | the count handed over; no label changed without sign-off |

Stop adding modes when about 20 new failing traces add none. Few failures means the cases are too easy, not
that the flow is done.

## Pitfalls

| What goes wrong | Do instead |
|---|---|
| Traces promised to the owner and never delivered; failure-mode ids invented by the agent | offer the traces; after a recorded decline read them yourself, and the owner confirms the modes |
| Experiments designed before the risks were ranked, so the owner has to point at the riskiest assumption | step 7 before any experiment |
| A check that passes when the output holds anything at all: "extracted a total" passes on an invoice where the model read the tax line | a check per claim, its subject from the case tag or `expected_output` |
| Series analysed for hours with a private script over REST, on the belief that new checks need a restart | write the check; the engine reloads it |
| Outputs of hundreds of runs collected by subagents making one read each, then read from the engine's files under `.aqven/` | bounded reads with `run_get_node`; bulk export is a gap in AQVEN: tell the owner |
| Series after series score how often two model readings agree, not whether either one is right | ground truth and a negative control (`designing-experiments`) |
| A vote of three event taggers on warehouse camera clips, estimated from their separate series, promised more than the combined step delivered | a variant that runs the combination confirms it |
| Every model "failed" on the same call recordings, whose labelled intent the caller never stated | step 10: a label audit before blaming the models |
| The owner spots problems in the case rows before the agent does | read the case rows and traces yourself after every series |
| Good: the owner's premise tested first on outputs already paid for (the union of two extractors' recall on invoices) | do the same |
| Good: before a two-stage pipeline over long contracts was built, the second stage's ceiling with perfect clause extraction and its value on the real extractions were measured; the paid series matched the prediction | do the same |

## Tools and commands

- `aqven` MCP `series_start` (`look`), `series_get` (`include_cases: true`), `run_get_node`, `run_events`,
  `pytest_run`.
- Never `.aqven/` files or server logs: when the tools cannot give what you need in bounded reads, tell the owner
  it is a gap in AQVEN.
- Web search and fetch for literature only.

## References

- `references/concepts/finding-the-node-that-went-wrong.md`: the first failing node and cascades. Read at step 2.
- `references/mcp-cli/research-loop.md`: finding what to test, failure mode to experiment, cases and checks,
  combinations tested on paid outputs. Read before step 3 and at steps 8 and 9.
- `references/studio/investigate-a-run.md`: what the owner sees at `/runs/<run_id>`. Read before step 3.
- `references/engine/custom-evaluator.md`: writing a `run:` check. It returns a `Verdict` on every attempt, so
  a rate on part of the cases gets its own experiment with `cases.tags`. Read at steps 8 and 9.
- `references/concepts/hypothesis-categories.md`: categories of hypotheses and their setups. Read at step 7.
- `references/concepts/literature-scan.md`: where to search, what to write down, how to mark what is
  unverified. Read at step 6.
