---
name: analyzing-failures
description: "Turns AQVEN runs into agreed failure modes: first failing node, owner-read traces, riskiest hypothesis first, one check per claim. Use first when runs are in but answers look wrong, when asked for a check of how often an output fails, and before any hypothesis."
---

## MUST

- A person reads the first traces. The agent lines them up and groups the notes; it never invents failure modes.
- A question about the data is asked through a check of an experiment, never through your own script over REST:
  the engine scores a check on every attempt and the owner sees it.
- New check functions need no server restart: project Python reloads on the next run.
- Test the owner's premise on data already paid for before spending more.
- Web search is for literature only, never for facts about the engine.

## Procedure

| # | Step | Exit criterion |
|---|---|---|
| 1 | A `look` experiment on `dev` with cheap deterministic checks and `repeats: 1`, or `series_start` with `look` over named cases; then `series_get` with `include_cases: true` | every failing row read |
| 2 | For each failed attempt: the first failing node (`debugging-runs`), infrastructure error or counted failure | a table attempt → node → code |
| 3 | Hand the owner about 30 traces: failures first, then a few passing ones, each with its `run_id`, the Studio link `/runs/<run_id>` and the first failing node; ask for one short note per trace | notes received |
| 4 | Group the notes into modes: an id, a one-line definition, a count, 2 or 3 `run_id`s | the list agreed and written under "Failure modes" in the look experiment's `experiment.md` |
| 5 | Filter: specification gap, wiring, infrastructure, generalization gap | experiments only for generalization gaps |
| 6 | Scan literature and the web for the riskiest assumptions; mark domain assumptions that need an expert | sources cited |
| 7 | Order: first the hypothesis that could kill the product, then by count and harm; check ordinal fields for a pull to the middle | the hypothesis list agreed with the owner |
| 8 | One check per claim: what the claim is about comes from the case (a tag or `expected_output`), never from what the model happened to say; "returned something" never measures "returned the right thing" | every claim has a check that can refute it |
| 9 | Test the owner's premise on paid data: a new check over earlier outputs (a test with `pytest_run` over outputs taken from `run_get_node`) | a conclusion from runs you have, before new spend |

Stop adding modes when about 20 new failing traces add none. Few failures means the cases are too easy, not
that the flow is done.

## Pitfalls

| What goes wrong | Do instead |
|---|---|
| Traces promised to the owner and never delivered; failure-mode ids invented by the agent | deliver the traces; the owner's notes make the modes |
| Experiments designed before the risks were ranked, so the owner has to point at the riskiest assumption | step 7 before any experiment |
| A check that passes when the output holds anything at all: "extracted a total" passes on an invoice where the model read the tax line | a check per claim, its subject from the case tag or `expected_output` |
| Series analysed for hours with a private script over REST, on the belief that new checks need a restart | write the check; the engine reloads it |
| Series after series score how often two model readings agree, not whether either one is right | ground truth and a negative control (`designing-experiments`) |
| The owner spots problems in the case rows before the agent does | read the case rows and traces yourself after every series |
| Good: the owner's premise tested first on outputs already paid for | do the same |

## Tools and commands

- `aqven` MCP `series_start` (`look`), `series_get` (`include_cases: true`), `run_get_node`, `run_events`,
  `pytest_run`.
- Web search and fetch for literature only.

## References

- `references/concepts/finding-the-node-that-went-wrong.md`: the first failing node and cascades. Read at step 2.
- `references/mcp-cli/research-loop.md`: finding what to test, failure mode to experiment, cases and checks.
  Read before step 3 and at step 8.
- `references/studio/investigate-a-run.md`: what the owner sees at `/runs/<run_id>`. Read before step 3.
- `references/engine/custom-evaluator.md`: writing a `run:` check. It returns a `Verdict` on every attempt, so
  a rate on part of the cases gets its own experiment with `cases.tags`. Read at steps 8 and 9.
- `references/concepts/hypothesis-categories.md`: categories of hypotheses and their setups. Read at step 7.
- `references/concepts/literature-scan.md`: where to search, what to write down, how to mark what is
  unverified. Read at step 6.
