---
title: How to check your model providers are configured
description: What {{CLI_COMMAND}} models check reports for each agent's models — the structured output modes they support, and, with --live, whether they actually work against the real provider — without running any flow.
---

# How to check your model providers are configured

## When you need this

An agent's `model` field is just a string until something actually calls it. Before you run a flow for
real — after picking a new model, after changing an agent's `output.mode`, or after cloning a project
you didn't configure yourself — you want to know whether the models an agent points at can actually
return the structured output AQVEN expects, not only whether a request to them would succeed at all.
`{{CLI_COMMAND}} models check` answers that, one agent at a time, without running any flow.

## Steps

- `{{CLI_COMMAND}} models check [TARGET] --project PATH` checks one target or every agent in the
  project. `TARGET` is an agent id the way [`tree`](/engine/inspect-project/) lists it, or a
  `provider:model` string on its own (`openrouter:openai/gpt-oss-20b`) to check a model outside any
  agent. Leave it out and every agent gets checked. `--project` defaults to `.` and, like every other
  command, is searched upward for the project's `aqven.yaml` — you don't need to `cd` into the project
  root first.
- For each target it prints the agent's declared `output.mode` — `auto`, or one set explicitly — and
  what it resolves to, with why: an explicit setting always wins, `auto` on an agent with one model
  resolves by what that model supports, and `auto` on an agent whose models resolve to different modes
  falls back to the one mode every model can produce.
- Under each target, one block per model lists which of the three structured output modes —
  `tool`, `native`, `prompted` — that model supports, based on what's already known about it. This part
  never sends a request: it needs no API key and never touches the network, so it works the same with
  or without a provider configured.
- Add `--live` to find out for real instead of relying on what's known: it sends one small classification
  request per output mode to the actual provider behind each model. This is a genuine call — billed and
  counted like any other — and it needs a working key for every provider a checked model uses. Without
  one, it fails immediately with the same error a real run hits when a provider's key is missing.
- An agent with more than one model — a primary `model` plus `fallback_models` — gets one block per
  model, so you can compare what each one supports before deciding whether they actually agree.
- `--json` prints the same report as one JSON object instead of text: one entry per target with its
  resolved mode, and a `modes` list per model carrying `profile_supports` and, with `--live`, `live`,
  `code`, and `message` for anything that failed.
- It exits `0` when every checked target's resolved mode is supported — statically, or, with `--live`,
  when it actually worked — and `1` otherwise: a resolved mode the model doesn't support, a target
  that's neither an agent id nor a `provider:model` string, a live probe that failed, or a project that
  doesn't load at all.

### Example

Create the showcase project if you don't already have one:

```bash
{{CLI_COMMAND}} new my_project --template showcase
cd my_project/my_project
```

With no API key set anywhere, the static check still works — this is the real output for `gpt`, whose
agent file leaves `output.mode` as `auto`:

```bash
{{CLI_COMMAND}} models check gpt
```

```text
agent gpt (agents/gpt.yaml)
  output.mode: auto -> tool (profile: Pydantic AI profile default for openrouter:openai/gpt-oss-20b)
  model openrouter:openai/gpt-oss-20b (auto: tool)
    mode      profile
    tool      supported
    native    supported
    prompted  supported
  YAML for the agent file:
    output:
      mode: tool
```

That exits `0`. `painter` shows what a two-model agent looks like — a primary model and one fallback
model, each getting its own block:

```bash
{{CLI_COMMAND}} models check painter
```

```text
agent painter (agents/painter.yaml)
  output.mode: prompted -> prompted (declared: output.mode is set explicitly)
  model openrouter:google/gemini-3.1-flash-lite-image (auto: native)
    mode      profile
    tool      unsupported
    native    supported
    prompted  supported
  model openrouter:openai/gpt-5-image-mini (auto: tool)
    mode      profile
    tool      supported
    native    supported
    prompted  supported
  YAML for the agent file:
    output:
      mode: prompted
```

`--json` on that same `gpt` check gives the same report as one object, with `profile_supports` per mode
and a `live` field of `"not_run"` because `--live` wasn't set:

```bash
{{CLI_COMMAND}} models check gpt --json
```

```json
{
  "live": false,
  "ok": true,
  "targets": [
    {
      "agent": "gpt",
      "file": "agents/gpt.yaml",
      "declared_mode": "auto",
      "resolved_mode": "tool",
      "source": "profile",
      "reason": "Pydantic AI profile default for openrouter:openai/gpt-oss-20b",
      "models": [
        {
          "model": "openrouter:openai/gpt-oss-20b",
          "auto_mode": "tool",
          "auto_source": "profile",
          "auto_reason": "Pydantic AI profile default for openrouter:openai/gpt-oss-20b",
          "modes": [
            {
              "mode": "tool",
              "profile_supports": true,
              "live": "not_run",
              "code": null,
              "message": null,
              "excerpt": null
            },
            {
              "mode": "native",
              "profile_supports": true,
              "live": "not_run",
              "code": null,
              "message": null,
              "excerpt": null
            },
            {
              "mode": "prompted",
              "profile_supports": true,
              "live": "not_run",
              "code": null,
              "message": null,
              "excerpt": null
            }
          ],
          "working": null
        }
      ],
      "suggested_mode": "tool",
      "snippet": "output:\n  mode: tool",
      "ok": true
    }
  ]
}
```

Adding `--live` with no `OPENROUTER_API_KEY` set anywhere shows the real failure honestly instead of
skipping the check:

```bash
{{CLI_COMMAND}} models check gpt --live
```

```text
aqven models check: no API key for provider 'openrouter': set OPENROUTER_API_KEY in the project .env file or in the environment
```

That exits `1`. With a working key exported, `--live` runs the real requests instead and reports `ok`
or a failure for each mode, the same way the table above reports `supported` or `unsupported` for the
static check.

Naming something that's neither an agent id nor a `provider:model` string fails the same way:

```bash
{{CLI_COMMAND}} models check nope
```

```text
aqven models check: nope is neither an agent of the project nor a provider:model string
```

## See also

- [How to call a model](/engine/llm-node/) — where an agent's `model`, `fallback_models`, and
  `output.mode` are set.
- [How to run a flow without a server](/engine/run-locally/) — the `provider_key_missing` failure a real
  run hits when a provider's own key is the one still unset.
- [How to manage secrets](/engine/secrets/) — the inventory of every secret a project declares and
  whether it's set; this page checks what an already-configured model can actually produce, not whether
  its key exists.
- [How to see what's in a project and how it connects](/engine/inspect-project/) — lists every agent id
  `models check` accepts as a target.
- [How to set up a model provider](/integrations/model-providers/) — getting credentials for a provider
  family in the first place, so `--live` has a key to run against.
- [Environment Variables](/reference/environment/) — the default variable name for every built-in model
  provider.
- [CLI commands](/reference/cli/) — every other command, including `run` and `secrets`.
