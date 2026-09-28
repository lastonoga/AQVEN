---
name: running-series
description: "Runs and reads AQVEN series without making the owner the monitor: probes and a dev smoke first, fixed size, a background wait, the 90% spend pause, 429 and infra errors by rule. Use first when starting, watching or reading a series, or one is awaiting_approval."
---

## MUST

- Never claim anything from a provisional verdict or from n=1. Statuses are `running`, `awaiting_approval`,
  `waiting_human`, `done`, `failed`, `cancelled`; `invalid` is a verdict, not a status (verdicts: `confirmed`,
  `refuted`, `inconclusive`, `invalid`, `signal`).
- A pause at 90% of the cap (`pause.reason: spend_near_cap`) and a start above the project cap
  (`cap_above_project`) are decided by a person in Studio. Report the spend and wait: never cancel, never cut
  repeats, cases or variants, never raise `research.spend_cap_usd` to get past it.
- `research.spend_cap_usd` in `aqven.yaml` changes only to a number the owner named, followed by `aqven check`.
- The engine handles 429: the model's lane pauses and halves its parallel calls, and an attempt that ended on a
  rate limit runs once more at the end of the series. Never cancel over 429, never lower `rpm`.
- Follow a smoke to its end in the same turn. An infrastructure error, or a variant three times slower than the
  rest, stops the launch until it is fixed, the variant is dropped, or the owner decides.
- Wait in the background, unpiped: never `| head`, `| tail`, `sleep` loops, `curl` or REST calls to the server.
- While a series runs, change no file in the package: an edit to its subject, experiment, dataset, code or a
  shared type ends it `invalid` with `inputs_changed`, and bulk files (downloads, archives) make the server
  reindex. Cancel only a series the owner asked you to cancel.

## Procedure

| # | Step | Exit criterion |
|---|---|---|
| 1 | Preconditions: `aqven_check` clean; every new agent passed `models check --live` (`choosing-models`); a smoke of the same experiment on `dev` with `--cases 1 --repeats 1`, or `--cases 10` for a new output contract (the first ten `dev` cases in file order: make sure they vary). This smoke on the real node is the probe of record. Follow it to the end with `series_get` and `wait_seconds`; collect every distinct error per variant, fix them in one batch, rerun once | no `NOT_RUNNABLE` (it lists `problems[]` per case and variant before any model call), no `MODEL_FEATURE_UNSUPPORTED`; zero infrastructure errors; every variant finished an attempt; latency outliers named |
| 2 | Size, controls and `--cap` decided before the start; the design is not cut to fit the cap. Many variants: screen, then confirm (`designing-experiments`) | no design questions after the start |
| 3 | Before `holdout`: one line to the owner (claim, why now, what each verdict means); the last `dev` series of this experiment had `infra_error_rate` below 5% | the owner knows why holdout is spent |
| 4 | Start in the background, unpiped (Claude: Bash with `run_in_background: true`): `uv run aqven series <experiment_id> --path <package> --on dev`, adding `--on holdout`, `--cases N`, `--repeats R`, `--cap USD` when needed. The first line appears within seconds; read it once: `series <series_id> started on dev: N attempts (… cases × … repeats × … variants), cap $X, status running`; a next line `below the recommended …` means too few cases. Progress lines follow: `done/total attempts, $spent of $cap, status …` | `series_id` known; a shortage of cases passed on to the owner |
| 5 | First snapshot after the probe attempt (a series runs one attempt first, then up to 8 at once): MCP `series_get` with `{series_id, wait_seconds: 50}`, without `include_cases`. Per variant: `aggregates[].attempts` (finished), `aggregates[].infra_errors`, latency from the matrix. The snapshot is clean only when every variant has at least one finished attempt. Only when a variant has failures, `include_cases: true`: error codes from `cases[].attempts[].error`. When the host saves an oversized answer to a file, read only the keys you need from it; never `.aqven/`. A variant where every attempt failed, or infrastructure errors other than 429 above 5% → `series_cancel` and `debugging-runs`; swapping an owner's model needs the owner's yes. A median latency three times the other variants' → tell the owner, smokes included | the owner does not find the errors first |
| 6 | One line to the owner: "series <series_id> runs in the background, I continue when it ends", with its Studio page `/research/series/<series_id>` on the project server; end the turn. The end of the background command wakes you | the turn does not hang on polling |
| 7 | Exit code of the background command: 0 `done`; 1 `cancelled`, `failed` or the server did not answer; 2 refused (`NOT_FOUND`, `NOT_RUNNABLE`, `INPUT_INVALID`, `REQUEST_INVALID`); 3 awaits approval; 4 waits for a person at a `human` node. On 1 with `the project server did not answer`, the CLI lost contact but the series may still run: `series_get` before any restart | the branch chosen by the code |
| 8 | Code 3: report `pause.reason`, `pause.spent_usd`, the cap, the attempts left and the link; wait. When the owner has continued it and tells you, follow it with `series_get` and `wait_seconds: 50` | the owner knows what to decide and where |
| 9 | A series started over MCP or in Studio has no background command: follow it with `series_get` and `wait_seconds: 50`, never `sleep` | the same discipline |
| 10 | Stuck: two snapshots in a row without growth of `progress.done` while `running`, and no lane pause line (`… rate-limited — pausing …, parallel 8→4`) in the console → the attempts per variant (`run_list`, `run_get_node`): an attempt hanging at the provider with no error; the engine cuts it only after 600 s of stream silence (`MODEL_STREAM_STALLED`) or at the agent's `limits.seconds` | the hanging variant named to the owner |
| 11 | `done`: quote `verdict.text` as it is; the conclusion rests on case rows, not only on aggregates (`divergent: true` marks the cases the variants split on); open 5 to 10 lost and won cases with their inputs before the report (`reporting-results`); a failed attempt counts against every binary check; `spend.usd` is a lower bound when `spend.unpriced_attempts` > 0 | the conclusion rests on rows |
| 12 | `invalid` with `infra_errors`: fix the cause (provider fallbacks, `join`, `on_rate_limit`) and run again with the same threshold | the threshold never moved |
| 13 | Journal and report with `reporting-results`; go on with the work | the owner never has to ping |

`include_cases` returns `dev` rows only, failing first, at most 50, the rest counted in `hidden_cases`;
held-out cases are never shown one by one. A counted failure is a failed check, a broken output type after
retries (`MODEL_RETRIES_EXHAUSTED`, `MODEL_SCHEMA_MISMATCH`, `OUTPUT_SCHEMA_REJECTED`), truncation or a refusal;
a missing key, a provider error, a timeout, `MODEL_STREAM_STALLED` or `MODEL_FEATURE_UNSUPPORTED` is an
infrastructure error and stays out of the metrics.

| Verdict (reason) | What to do |
|---|---|
| `confirmed` | apply the change, keep its cases as regression cases, record the decision |
| `refuted` | drop the change or form a new hypothesis; never read it as "no risk" |
| `inconclusive` (`below_mde`) | fresh cases and a new holdout series of the recommended size; never rerun for another answer |
| `inconclusive` (`uninformative`, `no_discordance`) | the cases are too easy or too hard; write cases at the boundary |
| `signal` (`dev_split`, `judge_not_validated`) | keep exploring, or validate the judge first |
| `invalid` (`cancelled`, `budget_cut`, `inputs_changed`, `infra_errors`, `no_data`) | fix the cause, run again |

## Pitfalls

| What goes wrong | Do instead |
|---|---|
| A home-made `curl` loop over the REST API breaks on the response body and waits for a status that never comes (`invalid` is a verdict, not a status) | `series_get`, the statuses above |
| `sleep` loops and long timeouts hold the turn and flood the owner with polling calls to approve | the background command and one line |
| The owner finds a failing variant or a slow model before the agent does | step 5 on the first snapshot |
| The owner reported a smoke's errors four times, because the turn ended after each start and each fix | follow the smoke to its end; fix every error it shows in one batch |
| A smoke showed one timeout, the full series started anyway, and a quarter of that variant's attempts timed out | an infrastructure error in the smoke stops the launch |
| Series output piped through `tail`, so nothing showed until the end and the owner asked whether requests went out | unpiped; the start line, then progress lines |
| A polling `sleep` on the output file was blocked by the host | read the start line once; the end of the command wakes you |
| `include_cases` on twenty variants overflowed the tool answer | aggregates first; case rows only when a variant fails |
| A turn ends after a start without a word, and the owner has to ask what is going on | step 6 |
| Repeats, cases or variants cut, or one series split in two, to stay under the approval line; a comparison postponed over spend | the design stays; report and wait |
| The cap key guessed, or looked up on the web | `research.spend_cap_usd`, only the owner's number |
| A variant hangs at one provider and the delay is blamed on `rpm` | step 10 |
| A holdout series ends `invalid` on 429: provider fallbacks are off and a parallel panel needs every branch (`join: all`) | provider fallbacks, `fallback_models`, `join: quorum` where a missing branch is acceptable |
| A shared type or check edited while a series runs makes it `invalid` with `inputs_changed` | no edits while it runs |
| An archive unpacked into the package during a series: the server reindexed and the CLI lost contact | raw downloads stay outside the package (`building-datasets`); `series_get` before any restart |

## Tools and commands

- `uv run aqven series <experiment_id> --path <package> --on dev|holdout [--cases N] [--repeats R] [--cap USD] [--json]`, exit codes 0 to 4; in the background, unpiped.
- `aqven` MCP `series_start`, `series_get` (`series_id`, `wait_seconds`, `include_cases`), `series_cancel`, `run_list`, `run_get_node`.

## References

- `references/engine/run-a-series.md`: the smoke, purpose, size, the launch plan, the cap, the CLI flags and exit
  codes. Read before step 1.
- `references/engine/read-a-series.md`: statuses, the first snapshot, verdicts and reasons, the matrix, stability,
  failures against infrastructure errors. Read at steps 5 and 11.
- `references/mcp-cli/experiments-and-series.md`: `series_start`, `series_get`, `series_cancel`, `look`, the split.
  Read before the first MCP call.
- `references/reference/status-and-verdicts.md`: every status, verdict, pause reason, attempt outcome and exit
  code, generated from the engine. Read when a value is not in this skill.
- `references/studio/series.md`: what the owner sees and where Continue is. Read at step 8.
- `references/reference/project.md`, `references/studio/settings.md`: `research.spend_cap_usd` and the Research
  budget setting. Read before touching the cap.
- `references/integrations/model-providers.md`: rate-limit lanes and `on_rate_limit`. Read at steps 5 and 12.
- `references/reference/cli.md`: every CLI command.
- `references/reference/findings.md`: the finding file a holdout series writes.
