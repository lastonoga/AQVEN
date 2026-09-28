# AQVEN skills for Claude Code

Twelve skills that teach Claude Code to work on an [AQVEN](https://aqvenstudio.com) project: build typed LLM
workflows as files, harden them, design datasets and experiments, run series, debug runs, choose models and
report results. AQVEN is a Python framework and a local Studio for building reliable LLM workflows; the
skills follow the engine of the same version.

| Skill | What it helps with |
| --- | --- |
| `building-flows` | writing flows, steps, prompts, types and agents as files |
| `hardening-flows` | checks, output contracts and failure policies |
| `designing-output-contracts` | typed outputs a model can actually produce |
| `preparing-media-inputs` | images and other media as step inputs |
| `building-datasets` | cases for experiments, with held-out splits |
| `designing-experiments` | the question, the checks and the decision rule before any data |
| `running-series` | running an experiment and reading its verdict |
| `running-the-engineering-loop` | the explore, confirm and decide rounds |
| `choosing-models` | candidates, providers and output modes for an agent |
| `debugging-runs` | reading a run step by step |
| `analyzing-failures` | grouping failures into modes |
| `reporting-results` | writing up findings and remaining risks |

## Install

```text
/plugin marketplace add lastonoga/AQVEN
/plugin install aqven@aqven
```

The skills are for a project created with `aqven new`, which also installs them into the project itself. See
the [quickstart](https://aqvenstudio.com/start/quickstart/).

## What the plugin runs and fetches

The plugin has no hooks, no MCP server and no scripts that run on their own. Its skills tell Claude to run
the AQVEN command line in your project (`uv run aqven check`, `uv run aqven run` and so on) and to use the
AQVEN MCP server that your project already declares. One skill, `choosing-models`, reads a model provider's
own model pages and, for an aggregator, its public catalogue with `curl` (for OpenRouter,
`GET https://openrouter.ai/api/v1/models`); that request needs no key and sends nothing from your project.
`preparing-media-inputs` includes a small Python script, `scripts/contact_sheet.py`, that builds a contact sheet
from local images when Claude runs it with `uv run`; uv fetches its one declared dependency, Pillow 12.3.0, into
a throwaway environment. The same skill may suggest trying an image library pinned to an exact version with
`uv run --with <package>==<version>`.

The plugin reads no credentials. Model keys stay in your project's `.env`, which the AQVEN engine, not the
plugin, uses when you start a run.

## License

Source-available under the [AQVEN License 1.0.0](https://github.com/lastonoga/AQVEN/blob/main/LICENSE).
