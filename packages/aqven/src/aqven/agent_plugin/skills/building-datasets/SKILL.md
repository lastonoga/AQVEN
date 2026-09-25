---
name: building-datasets
description: "Builds AQVEN datasets that can answer the question: source labels, synthetic cases with known answers, negatives and holdout from one population, tag counts per split. Use when editing datasets/, before filtering by tags, and when asked what a claim rests on."
---

## MUST

- Correctness is measured only against ground truth: an answer known by construction, or labels from the source.
- Explore and confirm on one population: negatives and holdout come from the same population as the
  positives and `dev`.
- Labels never come from a rule the agent made up. A table that derives labels from expert knowledge (a
  contract clause type mapped to a risk level) is marked "needs sign-off by a specialist".
- Sources and builder scripts live in the project, never in `/tmp`.
- A case you author points at its media with `file:`, a file in the project; private files stay out of git
  (`.gitignore` or Git LFS).
- Never rename a case an experiment already used: the split is a hash of the case `name`, so a renamed case is
  a new case.

## Procedure

| # | Step | Exit criterion |
|---|---|---|
| 1 | What the dataset must answer, and what one case is | a question sentence and the unit |
| 2 | Sources: the project's labelled data and public labelled datasets with a licence first; synthetic data only with ground truth by construction, each input checked to really have the property its label names (for media, `preparing-media-inputs`, step 6) | the licence recorded; the choice of synthetic data explained |
| 3 | Sources in `<package>/samples/<dataset_id>/`, media the cases point at in `<package>/datasets/<dataset_id>/`; the builder `scripts/build_<dataset_id>.py` at the project root next to `pyproject.toml` (outside the package, so the loader never reads it). The builder writes canonical YAML: a dumper with `ignore_aliases`, block style, double-quoted strings, no key sorting | the dataset rebuilds with `uv run python scripts/build_<dataset_id>.py`; `aqven_check` clean |
| 4 | Media: a file reference, `{$media: "image/jpeg", file: "<file>"}`, with the file in `datasets/<dataset_id>/`, or `file: "@root/<path>"` for a file several datasets share. No `size_bytes`; `name` defaults to the file name. `blob_id` values still work (a case saved from a run has them); `uv run aqven datasets materialize <package> [<dataset_id>…]` turns them into files. Private data (photos of people, scanned documents): ask the owner, then a `.gitignore` line on `datasets/<dataset_id>/` or Git LFS | every media value names a file in the project; `aqven_check` shows no `E_MEDIA_FILE_MISSING`, `E_MEDIA_PATH_INVALID` or `W_MEDIA_TYPE_MISMATCH` |
| 5 | Labels from the source data, agreed with the owner, or derived by a documented table marked "needs sign-off by a specialist" | the origin of every label is named |
| 6 | Negatives and holdout from the same population as positives and `dev`. The best negative mirrors a positive and differs only in what is asked, as Lumen's `planted_defect_replies` pairs every clean reply with a twin carrying one planted defect | no control "from another world"; `dev` and `holdout` look alike |
| 7 | Tags are the risk axes; every tag value the question compares is its own stratum; optional inputs are an explicit `null` | `aqven_check` clean |
| 8 | Count tag value × split before a series (the split is 50/50 by a hash of `name`, salted with the package name): every compared group has at least k cases in each half. For a graded series (levels of one property) write twice the cases per level, so both halves keep every level | the table shown to the owner, with what the dataset can and cannot confirm |
| 9 | Open a few inputs of every group | each group matches its tag |

A dataset is `datasets/<dataset_id>.yaml` with `apiVersion`, `kind: "Dataset"`, `flow` (or none for a local flow
of an experiment) and `cases`; a case has `name`, `inputs`, and optionally `tags`, `expected_output`, `context`,
`node_outputs` (for runs over a node range) and `metadata`. A media input is `$media` plus either `file`
(relative to `datasets/<dataset_id>/`, or `@root/<path>` from the package root; no absolute path, `..` or
`.aqven/`) or `blob_id`, never both. A single case runs with MCP `run_start` and
`dataset_item_id: "<dataset_id>/<case_name>"`. A series with `--cases N` takes the first N cases of the chosen
half in file order.

## Pitfalls

A pitfall is a general rule; the illustration after it is one instance.

| What goes wrong | Do instead |
|---|---|
| Media imported through an improvised route; sources and builders left in `/tmp` | media as `file:` next to the dataset, sources in `samples/`, a builder in `scripts/` |
| Media held only as `blob_id`: the bytes lived in one machine's `.aqven/blobs/`, and a fresh clone had none | `file:` references; `aqven datasets materialize` for old cases |
| Private media committed with the dataset: photos of customers' homes pushed to a shared repository | a `.gitignore` line on `datasets/<dataset_id>/` or Git LFS, agreed with the owner |
| A public labelled dataset put off until the owner asked twice | labelled data first |
| Labels invented from the agent's own rule | source labels, or a signed-off table |
| Negatives from another population: every negative came from one internal mailbox, every positive from the public channel, so the model separated channels, not classes | negatives from the same source, channel and length as the positives |
| The split thinned a graded series: some levels landed in one half only, and a series asked for more cases than its half held ran fewer | twice the cases per level; count before the series |
| A compared group of one: the only non-English ticket landed in `dev` | at least k cases per compared tag value in each half |
| A new kind of case added only before the confirmation series (long multi-intent messages): `dev` and `holdout` scores diverged | one population for both; add, then explore again on `dev` |
| YAML dumped with aliases: dozens of `E_YAML_ANCHOR` | the canonical dumper in the builder |
| A good pattern: the owner proposed a mapping ("error code → refund category"), the agent derived labels by that table and marked it for sign-off | do the same |

## Tools and commands

- `aqven` MCP `aqven_check`; `run_start` with `mode: "live"` and `dataset_item_id`; `series_start` with `look`
  (`flow_id`, `dataset_id`, `case_names`) to run named cases once.
- `uv run python scripts/build_<dataset_id>.py`.
- `uv run aqven datasets materialize <package> [<dataset_id>…]` (`--dry-run` first): `blob_id` values into files
  in `datasets/<dataset_id>/`; a blob missing from the local store is named, its value kept, and the exit code is 1.

## References

- `references/concepts/case-construction.md`: dimensions and tuples, ground truth by construction, labels
  from a documented mapping, negative controls, population, split and strata. Read before step 2.
- `references/reference/datasets.md`: every key of a dataset and a case. Read before writing a dataset file.
- `references/engine/experiments.md`: how an experiment selects cases by tags. Read at step 7.
- `references/engine/dataset-media-files.md`: `file:` references, the two path forms, private files,
  `materialize`, the three media diagnostics. Read at step 4.
- `references/studio/cases.md`: the owner's view of cases, filters and imports. Read at step 4.
- `references/mcp-cli/experiments-and-series.md`: the split, `look` with `case_names`, what `include_cases`
  shows. Read at step 8.
