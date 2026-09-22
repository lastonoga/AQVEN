---
title: How to read an eval and its gate
description: Start an eval run from the terminal, then read its scorers and its gate verdict — pass, warn, or block — in Studio.
---

## When you need this

Use this once you've run a fix against a dataset and need more than "it ran" — you need to know
whether it's actually safe to ship. An eval scores every case with the checks you defined, and its
gate compares that against a baseline you already shipped. This is what makes the
[Test step of the engineering loop](/concepts/engineering-loop/) a real verdict instead of an
eyeballed guess.

## Steps

- **Starting an eval run happens in the terminal, not in Studio.** Run
  `{{CLI_COMMAND}} eval --eval <eval_id>`, where `<eval_id>` is the file name of the eval under
  `evals/<flow_id>/`. Add `--baseline <eval_run_id>` to compare against a previous run and get a gate
  verdict, `--dataset <dataset_id>` to score a different dataset than the one the eval declares,
  `--repeats <n>` to override how many times each case runs, and `--json` to print the run record as
  JSON instead of text.
- Open a flow and click its **Evals** tab, alongside Runs, Nodes, and Datasets. The list shows every
  eval defined for this flow: its id and description, its target (which inference and which model
  agent it runs), how many scorers it declares, which dataset it scores, and the file it's defined in.
- Select an eval and Studio shows what it's set up to check: the full scorer list, and a policy
  section stating plainly whether this eval declares a release gate and a prompt-optimization job, or
  neither. Below that, its dataset panel shows that dataset's case count and splits.
- Under that, the eval's run history lists every past run: status, cases ok out of total, each
  scorer's mean, and cost. **This screen is read-only — there's no button to start a run here.** If
  the eval has never been run, the list says so directly: "No eval runs for `<eval_id>` yet. The CLI
  command `{{CLI_COMMAND}} eval --eval <eval_id>` produces one."
- Pick a run and its detail opens below: status, duration, repeats, seeds, cases ok, dropped cases,
  cost, and tokens, followed by a table of every scorer's mean, pass rate, and range.
- **The gate verdict is what this page is really for, and it's plain colored text, not a badge or an
  icon.** The overall decision reads as one of four words, colored:
  - `PASS` — green
  - `WARN` — amber
  - `BLOCK` — red
  - `GATE_UNAVAILABLE` — neutral gray

  Right below it, a gate-tests table repeats the same word and the same color per scorer, alongside
  that scorer's delta from the baseline, its confidence interval, and its adjusted p-value — so if the
  overall decision isn't `PASS`, this table tells you which scorer caused it.
- A run can also have no gate at all, and Studio distinguishes two different reasons with two different
  sentences:
  - Run without a baseline: "This run has no gate verdict: it ran without a baseline, so the engine
    had nothing to compare it against." You never asked for a comparison.
  - Run with a baseline, but the engine reported nothing: "The engine serves no gate report for this
    run." A comparison was requested, and the gate report itself is missing.
- Every case in the run gets its own row further down: status, seed, latency, and its scores. Click one
  to see its full detail — each scorer's value and whether it passed, the reason given, and the case's
  output or error — which is how you find the one case that dragged a gate verdict down.

### Example

Open the showcase project's `support_case` flow. From the terminal, in the project folder:

```
{{CLI_COMMAND}} eval --eval reply_quality
```

This scores `reply_quality`'s dataset with its four scorers — `critique`, `citations`, `promises`,
`cost_usd` — and prints the result. Run it again later with `--baseline <the first run's id>` and it
also computes a gate.

Back in Studio, open the `support_case` flow's Evals tab and select `reply_quality`. Its run history
now lists the run you just started. Open it: the scorer table shows each mean and pass rate, and once
you've run it with `--baseline`, the gate section shows `PASS` in green if every scorer held up against
that baseline, or `WARN` in amber or `BLOCK` in red with the gate-tests table pointing at whichever
scorer didn't.

## See also

- [The engineering loop](/concepts/engineering-loop/) — what a green gate actually means: every metric
  you set as a gate held up or improved against baseline, checked with a real statistical test, not
  eyeballed.
- [How to work with datasets in Studio](/studio/datasets/) — where the dataset an eval scores comes
  from, and how a batch run relates to an eval run.
- [How to investigate a run](/studio/investigate-a-run/) — the same run detail a case's flow-run link
  takes you to.
