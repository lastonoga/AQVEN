<div align="center">

# AQVEN

### AI workflows built for humans and coding agents.

Build your AI workflow, check it before it runs, and see exactly what it did.

[![License](https://img.shields.io/badge/license-source--available-blue)](LICENSE)
[![Python](https://img.shields.io/badge/python-3.14-blue)](https://github.com/lastonoga/AQVEN/blob/main/packages/aqven/pyproject.toml)
[![Providers](https://img.shields.io/badge/model%20providers-28-blue)](https://aqvenstudio.com/reference/provider-catalog/)

**[Documentation](https://aqvenstudio.com)** · **[Quickstart](https://aqvenstudio.com/start/quickstart/)** · **[Studio guide](https://aqvenstudio.com/studio/)** · **[Reference](https://aqvenstudio.com/reference/)**

<br>

<img src="apps/site/public/images/studio/canvas.png" alt="AQVEN Studio showing a multi-step AI workflow on one canvas" width="820">

</div>

<br>

## AI workflows get hard to follow, fast.

The prompt is in one file. The model settings are in another. Routing lives in code. Tools are
somewhere else. Then your coding agent edits ten things at once, twice a week.

A month in, nobody on the team can say what actually happens — and it's not a demo. It runs
thousands of times before anyone notices something drifted.

> *"I don't recognize half of this."*
> *"Did it connect that output to the next step, or does it only look like it did?"*
> *"It reorganized three steps. What did it drop?"*
> *"It feels worse than last month. I can't prove it."*

It's live behind refunds, invoices, approvals, and customer records. AQVEN keeps that behavior as
something your team can read, check, and change with confidence — not something scattered across
prompts, glue code, and one person's memory.

<br>

## Quick start

You need [uv](https://docs.astral.sh/uv/getting-started/installation/). AQVEN runs on Python 3.14,
and uv fetches it for you.

```bash
uv tool install aqven
aqven new my_project --template showcase --provider openrouter
cd my_project/my_project
uv run aqven check .
```

You get AQVEN's full example on disk: a customer support flow that triages an incoming message, routes
it, drafts a reply with three model providers at once, has a panel of judges pick the best draft, and
sends it for human approval. `aqven check` validates every file and simulates a run of every flow with
fake model calls: no network, no API key. On a fresh project it prints `errors: 0, warnings: 0`.

To run it for real, copy `.env.example` to `.env`, set `OPENROUTER_API_KEY` in it, save a case as
`case.json`, and run the flow in your terminal. It prints one line per event as it happens:

```bash
uv run aqven run support_case --input case.json --context date=2026-09-21 --context tenant_id=demo
```

→ [Full quickstart](https://aqvenstudio.com/start/quickstart/), with the case file ·
[Open the same project in Studio](https://aqvenstudio.com/start/engineering-loop-walkthrough/)

<br>

## Your team can read the workflow

<table>
<tr>
<td width="38%" valign="top">

**See every step on one screen.**
What runs, what feeds what, where a person has to approve. Read from your files, not from a
diagram somebody drew six months ago.

</td>
<td width="62%" valign="top">

<img src="apps/site/public/images/studio/project-flows.png" alt="AQVEN Studio showing a project and its workflows" width="100%">

</td>
</tr>
<tr>
<td width="38%" valign="top">

**Find where a bad result came from.**
Open the exact run and walk back to the first step that didn't do what it should.

</td>
<td width="62%" valign="top">

<img src="apps/site/public/images/studio/runs.png" alt="AQVEN Studio showing a recorded run with cost, duration and completed steps" width="100%">

</td>
</tr>
<tr>
<td width="38%" valign="top">

**Look inside any step.**
What went in, what came out, which model answered, what it cost. Raw values, not a summary.

</td>
<td width="62%" valign="top">

<img src="apps/site/public/images/studio/node-inspector.png" alt="AQVEN Studio node inspector showing the input and output of one step" width="100%">

</td>
</tr>
</table>

Studio, the local browser interface, ships inside the same install and has two modes. **Flow** shows
one workflow's graph, its runs and its cases. **Research** shows the experiments and every series as it
fills in: variants side by side with their intervals, the cases where they disagree, and a link from
each attempt to its run. You launch a series there to **Explore** on working cases or **Confirm** on
held-out cases, see its estimate before anything is spent, and approve spend above the project cap.

**Check it before it runs.** Broken connections between steps, inputs that don't match, a prompt
pointing at something that isn't there. Caught before a customer finds it.

**Review a change like code.** A prompt edit shows up in your diff, and so does a new finding in
`FINDINGS.md`. Your teammate reviews the logic in a pull request, the same as everything else you ship.

<br>

## Not a tracing tool. Not a drag-and-drop builder.

| | Tracing tools | Visual builders | AQVEN |
| --- | --- | --- | --- |
| Where the logic lives | Your code, scattered | Their platform | Files in your repo |
| Check before it runs | No | No | **Yes** |
| Your coding agent can edit it | No | No | **Yes** |
| Yours if they disappear | Yes | No | **Yes** |

Tracing shows you what happened, after it happened. Visual builders keep your logic on their
platform. AQVEN keeps the workflow as files in your repo — your team reads it, your agent edits
it, a command checks it.

<br>

## Your coding agent stops guessing

Claude Code and Cursor are already writing your AI workflows. Give them something to read.

- **It connects on its own.** A new project comes with `AGENTS.md`, `CLAUDE.md` and `.mcp.json`, so
  an agent started in its folder reaches AQVEN's MCP server and knows how to work there.
- **It reads the whole workflow before it edits.** Steps, inputs, outputs, what connects to what.
- **It can't wire two steps together wrong.** Types don't match, the check fails — before
  production does.
- **It has to pass a check before it can say it's done.**
- **The docs are written for it,** not only for you — including a machine-readable
  [`llms.txt`](https://aqvenstudio.com/llms.txt).

<br>

## From a demo to a workflow that holds

One run proves one case, and `aqven check` proves the wiring. Neither says whether the workflow holds
on real inputs. Your agent finds that out in rounds: it builds, runs, checks, experiments and repeats
until the findings show the workflow holds. You read the first traces and make the decisions.

1. **You set the goal.** What the workflow is for, what "done" means in numbers, and a budget.
2. **The agent builds** the simplest flow that works, writes tagged cases with expected outputs, and
   runs `aqven check` after every change.
3. **It runs a look on working cases and hands you the traces.** The failing runs first, then a few
   passing ones: about 30 in all, or every one if there are fewer. Each comes with its run id and where
   to open it in Studio, and a failing one with the first step that failed. You write one short note per
   trace: the first thing that went wrong, or "fine". The agent prepares; you judge.
4. **It groups your notes into failure modes**: an id, a one-line definition, a count and two or three
   run ids. It writes them into the look's `experiment.md` only after you agree the list.
5. **It writes one experiment per failure mode** before any data: the claim with a number, the cases,
   the checks and the margin.
6. **It explores on working cases**, one change between series, as often as it needs. Those series give
   numbers and a signal, never a finding.
7. **It confirms once on held-out cases**, the half of each dataset it never sees case by case. The
   server writes the verdict (`confirmed`, `refuted` or `inconclusive`) as one sentence from the 95%
   interval and the margin, and the finding lands in `FINDINGS.md`.
8. **It applies the finding**, keeps the cases it fixed as regression cases, and starts the next round.
   From then on it maps new failing traces to the known modes itself and brings you only the ones that
   fit none.

It stops when every "done" criterion is confirmed on held-out cases, when a fresh round finds no failure
mode seen twice, when two rounds in a row move neither quality, cost nor latency, or when the budget is
spent. The decisions stay with you: which limits are requirements, how much quality a cheaper step may
lose, when a question is frozen, and any spend above the project cap. An agent can start a series but
never approve its spend.

→ [A day with AQVEN](https://aqvenstudio.com/start/a-day-with-aqven/) ·
[How an agent takes a task to a reliable flow](https://aqvenstudio.com/mcp-cli/research-loop/) ·
[Experiments, series and findings](https://aqvenstudio.com/concepts/experiments-series-and-findings/)

<br>

## What's inside

Every part of an AI workflow, as files in your project.

| | |
| --- | --- |
| **Flows and nodes** | Ten node kinds — `llm`, `code`, `tool`, `human`, `switch`, `parallel`, `map`, `loop`, `call`, `narrow` — composed into a typed graph |
| **Types** | Records, enums, unions, IDs, values, and media, checked at every boundary — a model can't return a field that isn't declared |
| **Prompts** | Plain text, Liquid templates with shared fragments, or a Python function — always a file of its own, never a string inside YAML |
| **Agents and providers** | An agent is a model with its settings and output mode, in its own file. 28 model providers through [Pydantic AI](https://ai.pydantic.dev/) — OpenAI, Anthropic, Google, OpenRouter, Mistral, DeepSeek, Groq, Together AI, and more |
| **Tools** | Python functions or MCP servers, with declared `read` / `write` / `external` effects |
| **Human review** | A workflow step that waits on a person, with a timeout and a default |
| **Cases** | Datasets of tagged cases with expected outputs, split by a hash of each name into working and held-out halves |
| **Experiments and findings** | An experiment writes one question down before any data, a series answers it across variants and cases, and a verdict on held-out cases is written once as a finding and summed up in `FINDINGS.md` |
| **Durable execution** | Built on [DBOS](https://www.dbos.dev/) — a run survives a crash and resumes where it left off |

→ [Full documentation](https://aqvenstudio.com)

<br>

## License

AQVEN is **source-available**, not open source, under the AQVEN License 1.0.0 — based on the
[PolyForm Shield License 1.0.0](https://polyformproject.org/licenses/shield/1.0.0), with one
addition.

You may use it for any purpose, including in production and in commercial products you build with
it: the AI workflows you create with AQVEN are yours, and selling them is explicitly permitted.

You may not use AQVEN — original or modified — to provide a product that competes with it. You may
redistribute copies of AQVEN itself only free of charge and for a non-commercial purpose. The
right to sell AQVEN itself stays with the licensor.

Copyright Kirill Burkhanov. Full terms: [LICENSE](LICENSE).

<div align="center">
<br>

**[Documentation](https://aqvenstudio.com)** · **[GitHub](https://github.com/lastonoga/AQVEN)**

</div>
