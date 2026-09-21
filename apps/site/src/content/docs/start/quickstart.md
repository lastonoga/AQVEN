---
title: Quickstart
description: From an empty folder to your first run, in under 30 minutes.
---

## What you'll have at the end

A real AQVEN project on disk, built from AQVEN's full example workflow. You will have checked it
without touching the network, and run it once to see how AQVEN reports what happened, node by node.

## Before you start

You need:

- **Python 3.14.** AQVEN's engine is pinned to this exact version — not 3.13, not 3.15. If you use
  `uv` for everything below, it will fetch the right Python for you.
- **[uv](https://docs.astral.sh/uv/getting-started/installation/).** AQVEN uses it to install itself,
  install a new project's own dependencies, and run project commands.

Install AQVEN as a standalone command:

```bash
uv tool install {{CLI_COMMAND}}
```

This puts an `{{CLI_COMMAND}}` command on your PATH. Studio, AQVEN's local browser interface, ships
inside the same install — there's no separate Node.js toolchain to set up.

## 1. Create a project

```bash
{{CLI_COMMAND}} new my_project --template showcase
```

`{{CLI_COMMAND}} new` does three things in one step: it writes the project's files from a template,
installs the project's own dependencies with `uv sync`, and generates typed Python models for every
type the project declares. `--template showcase` picks AQVEN's full example: a customer support case
that triages an incoming message, routes it, drafts a reply with three model providers at once, has a
panel of judges pick the best draft, and sends it for human approval. Most of the rest of this site
builds on this same project, so it's worth the extra minute over the smaller default template.

When it finishes, you'll see something like this:

```text
created my-project in my_project from the showcase template
generated my_project/types.py
next steps:
  cd my_project
  cp my_project/.env.example my_project/.env and set the API keys in it
  uv run {{CLI_COMMAND}} dev my_project
```

## 2. Look at what you got

The next-steps message above says `cd my_project`. Go one folder further, into the AQVEN project
itself:

```bash
cd my_project/my_project
```

Two folders share the name `my_project` on purpose. The outer one is a regular Python project —
`pyproject.toml`, its own virtual environment, a lockfile. The inner one is the AQVEN project: that's
where `aqven.yaml` lives, and every `{{CLI_COMMAND}}` command looks for it from wherever you run it.

Inside, a flow is a folder with a `flow.yaml` and a `nodes/` folder. Each node is its own
`<node_id>.node.yaml` file; a few related nodes are often kept in the same subfolder. Here's the real
layout of this project's main flow:

```text
flows/support_case/
  flow.yaml
  nodes/
    prepare/
      prepare.node.yaml
      prepare.py
    triage/
      triage.node.yaml
      triage.inference.yaml
      triage.prompt.md
    ... 16 more folders, one for each remaining step: route, search_kb, record, drafts,
        polish, vote, illustrate, approvals, finalize, case_form, clip, intent, panel,
        tally, to_record, voice
```

`prepare` is a plain code step: a `.node.yaml` plus the `.py` file with the function it calls.
`triage` calls a model, so it's a `.node.yaml`, an `.inference.yaml` describing the call, and a
`.prompt.md` — the prompt text itself. A prompt is never a string inside YAML; it's always its own
Markdown file, so you can open it, edit it, and diff it like any other piece of text.

Some of the other folders group more than one node together — `drafts` holds three parallel drafting
nodes, one per model provider; `record` holds a node plus the one that validates its output. Either
way, a node's identity is its own `.node.yaml` file, not the folder around it.

## 3. Check it without network or tokens

```bash
uv run {{CLI_COMMAND}} check .
```

This walks every flow, validates every YAML file against the Python it points to, and then simulates a
run of each flow with fake stand-ins for the model calls. Nothing here touches the network or needs an
API key. On a fresh showcase project, you'll see:

```text
errors: 0, warnings: 0
```

Run this after every change you make. It's the fast, offline check that catches most mistakes before
you spend a token.

## 4. Run it

A real run calls a real model, so it needs an API key. The templates default to
[OpenRouter](https://openrouter.ai): open `my_project/.env`, the file you copied from `.env.example`
in step 1, and set `OPENROUTER_API_KEY`.

The project's own sample case carries a photo and an invoice, which need a couple of extra Studio
steps to attach — that's covered on the next page. For now, save a smaller case without attachments as
`case.json` in the folder you're in:

```json
{
  "customer": {
    "customer_id": "cus_demo00000001",
    "display_name": "Ada",
    "email": null,
    "tier": "standard",
    "locale": "en-US"
  },
  "origin": { "kind": "storefront", "page": "/support" },
  "message": "The light strip controller gets hot after ten minutes.",
  "order_id": null,
  "product": null,
  "tags": ["hot_controller"],
  "urgent": false,
  "photo": null,
  "voice_note": null,
  "video": null,
  "invoice": null
}
```

Then run the flow:

```bash
uv run {{CLI_COMMAND}} run support_case --input case.json --context date=2026-09-21 --context tenant_id=demo
```

`{{CLI_COMMAND}} run` runs the flow right there in your terminal — no server involved — and prints one
line per event as it happens. Here's a real run of the command above, taken before an API key was set:

```text
run 01a0c4a2-89c2-73f2-aecf-3de9480b933e
· run_started
▶ prepare
■ prepare ok 19 ms
▶ triage
· inference_input_captured
■ triage failed 7 ms provider_key_missing: no API key for provider openrouter (openrouter:google/gemini-2.5-flash-lite): set OPENROUTER_API_KEY in the project .env or the environment
● run failed provider_key_missing: no API key for provider openrouter (openrouter:google/gemini-2.5-flash-lite): set OPENROUTER_API_KEY in the project .env or the environment cost $0 tokens 0/0
```

`prepare` is a code step, so it ran immediately. `triage` is the first step that calls a model, and it
stopped right there with a message naming the exact node, the exact provider, and the exact fix. That's
the same kind of reporting you'd get for any other failure, not just a missing key.

With a real key in `.env`, the same command keeps going through every remaining node and ends with a
line like `● run completed cost $<amount> tokens <in>/<out>`, followed by the flow's actual output — a
routed, drafted, judged reply.

## What's next

[From a bad answer to a verified fix](/start/engineering-loop-walkthrough/) picks up from here: the
same project, opened in Studio, to see the graph, find why a run went wrong, and verify a fix.
