# How to check your model providers are configured

What aqven models check reports for each agent's models — the structured output modes they support, and, with --live, whether they actually work against the real provider — without running any flow.

## Contents

- [When you need this](#when-you-need-this)
- [Steps](#steps)
- [Strict mode](#strict-mode)
  - [Example](#example)
- [See also](#see-also)

## When you need this

An agent's `model` field is just a string until something actually calls it. Before you run a flow for
real — after picking a new model, after changing an agent's `output.mode`, or after cloning a project
you didn't configure yourself — you want to know whether the models an agent points at can actually
return the structured output AQVEN expects, not only whether a request to them would succeed at all.
`aqven models check` answers that, one agent at a time, without running any flow.

## Steps

- `aqven models check [TARGET] --project PATH` checks one target or every agent in the
  project. `TARGET` is an agent id the way `tree` lists it, or a
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
- Add `--provider-options '<json object>'` alongside `--live` to merge that object into every probe's
  request body — the same place an agent's own `settings.provider_options` lands. Run the same target
  with and without it to find out whether a provider-level setting changes what a model can do; see
  [How to find a model's real structural limits](check-shapes.md) for OpenRouter's
  `require_parameters` specifically.
- `--json` prints the same report as one JSON object instead of text: one entry per target with its
  resolved mode, and a `modes` list per model carrying `profile_supports` and, with `--live`, `live`,
  `code`, and `message` for anything that failed.
- It exits `0` when every checked target's resolved mode is supported — statically, or, with `--live`,
  when it actually worked — and `1` otherwise: a resolved mode the model doesn't support, a target
  that's neither an agent id nor a `provider:model` string, a live probe that failed, or a project that
  doesn't load at all.

## Strict mode

The mode a model resolves to is one axis; whether the provider is asked to *guarantee* the schema at
generation time is a separate one — an agent's `output.strict`. When it's `false`, the default every
`aqven new` template ships with, AQVEN validates the response itself after the call lands and, on a
mismatch, re-prompts the model with the validation error, up to `output.retries` times (see
What happens when a model is called). Seeing that
repair retry fire in a run's events is that safety net working as designed, not proof `strict` needs
turning on — only a node whose *last* attempt still failed after retries ran out is worth chasing.

Turning `output.strict: true` on asks the provider to constrain generation to the schema instead of
leaning on the retry. Not every provider honors that request the same way: OpenRouter's own docs say
enforcement "varies by provider — some guarantee schema-conforming output, while others translate your
schema into their own structured-output format or treat it as a strong hint," so exact compliance isn't
guaranteed on every endpoint it routes to. `aqven check` doesn't second-guess that: it keeps no list of which
models support strict output, so `output.strict: true` compiles for any model and the provider decides — a provider
that refuses the request answers with an error, and that error is the step's error.

`--live` is how you find out before a real run: every mode it probes runs with strict enforcement forced on, so a mode
reported `ok` under `--live` has already worked strict against the real provider. AQVEN keeps no model list of its
own: `output.strict` reaches *every* model in the agent's list as you set it, `model` and every `fallback_models`
entry alike, and Pydantic AI leaves the flag out of the request only where its profile for that model says the
provider can't take it — so probe each one you're trusting, not only the first that happens to answer.

### Example

Create the minimal project if you don't already have one — `models check` works on one agent file at a
time, so it needs nothing flow-shaped:

```bash
aqven new my_project
cd my_project/my_project
```

With no API key set anywhere, the static check still works — this is the real output for `assistant`,
whose agent file leaves `output.mode` as `auto`:

```bash
aqven models check assistant
```

```text
agent assistant (agents/assistant.yaml)
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

That exits `0`. An agent with more than one model — a primary `model` plus `fallback_models` — gets one
block per model instead of one, so you can compare what each one supports before deciding whether they
actually agree.

`--json` prints the same facts as one JSON object instead of text. Here's the shape, trimmed to one
target and the first of its model's three modes — the other keys and modes follow the same pattern:

```bash
aqven models check assistant --json
```

```json
{
  "live": false,
  "ok": true,
  "targets": [
    {
      "agent": "assistant",
      "file": "agents/assistant.yaml",
      "resolved_mode": "tool",
      ...
      "models": [
        {
          "model": "openrouter:openai/gpt-oss-20b",
          ...
          "modes": [
            {
              "mode": "tool",
              "profile_supports": true,
              "live": "not_run",
              "code": null,
              "message": null,
              "excerpt": null
            },
            ...
          ]
        }
      ]
    }
  ]
}
```

Adding `--live` with no `OPENROUTER_API_KEY` set anywhere shows the real failure honestly instead of
skipping the check:

```bash
aqven models check assistant --live
```

```text
aqven models check: no API key for provider 'openrouter': set OPENROUTER_API_KEY in the project .env file or in the environment
```

That exits `1`. With a working key exported, `--live` runs the real requests instead and reports `ok`
or a failure for each mode, the same way the table above reports `supported` or `unsupported` for the
static check.

Naming something that's neither an agent id nor a `provider:model` string fails the same way:

```bash
aqven models check nope
```

```text
aqven models check: nope is neither an agent of the project nor a provider:model string
```

## See also

- What happens when a model is called — the repair
  retry `output.strict: false` leans on, and the four outcomes decided before it ever runs.
- [How to find a model's real structural limits](check-shapes.md) — the companion question this
  page doesn't answer: how deep a supported, strict-capable mode actually nests correctly.
- How to call a model — where an agent's `model`, `fallback_models`, and
  `output.mode` are set.
- How to run a flow without a server — the `provider_key_missing` failure a real
  run hits when a provider's own key is the one still unset.
- How to manage secrets — the inventory of every secret a project declares and
  whether it's set; this page checks what an already-configured model can actually produce, not whether
  its key exists.
- How to see what's in a project and how it connects — lists every agent id
  `models check` accepts as a target.
- How to set up a model provider — getting credentials for a provider
  family in the first place, so `--live` has a key to run against.
- Environment Variables — the default variable name for every built-in model
  provider.
- CLI commands — every other command, including `run` and `secrets`.
