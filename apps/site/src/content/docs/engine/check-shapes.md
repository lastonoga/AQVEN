---
title: How to find a model's real structural limits
description: What {{CLI_COMMAND}} models shapes reports for an agent's models — the nesting depth, list length and enum size they actually handle correctly, found with real, billed API calls.
---

## When you need this

An agent's model claims to return structured output, but "structured output" doesn't say how deep it nests
correctly, how many items an array can hold before the model drops or reorders them, or how large an enum
can grow before it starts inventing values. None of that is published anywhere reliable — providers
document what their API accepts, not what a specific model actually fills in correctly. Before you design
a real schema around nested objects, an array of objects, or a large closed set of codes, `{{CLI_COMMAND}}
models shapes` finds the model's actual boundary with real requests instead of a guess.

## Steps

- `{{CLI_COMMAND}} models shapes [TARGET] --project PATH --live` checks one target or every agent in the
  project. `TARGET` is an agent id the way [`tree`](/engine/inspect-project/) lists it, or a
  `provider:model` string on its own, the same as [`models check`](/engine/check-providers/). `--live` is
  required: this command has no static mode, every probe is a real, billed request against the real
  provider.
- For each of the target's models it tests three axes, using the exact `output.mode` the agent resolves to
  today:
  - **`nesting_depth`** — an object nested one level deeper each step, asking the model to copy one
    literal token into the deepest field.
  - **`list_of_objects`** — an array of objects, asking the model to copy one literal token into each
    item, in order.
  - **`enum_at_depth`** — a closed enum one level deep, asking the model to copy the one literal value it
    was told to use, out of a set as large as 100.
- It climbs each axis from its smallest level and stops the moment a level comes back wrong, so the number
  it reports is a real, checked boundary, not an assumption about what "should" work. A level is wrong only
  when the model's answer itself doesn't match what was asked — a token landed at the wrong depth, an item
  went missing, the wrong enum value came back. A transient failure — a rate limit, a timeout, a dropped
  connection — never counts as the model's limit: the probe keeps climbing past it, and the report marks it
  separately so you can tell "the model can't do this" from "the provider hiccuped once."
- `--json` prints one object per target: one entry per model, one entry per axis with `boundary` (the
  highest level confirmed correct, `null` if even the smallest level failed) and the full list of `cases`
  tried, each with `ok`, `structural`, `code` and `message`.
- It exits `0` once every target has been probed, whether or not a boundary turned out low — a low boundary
  is real information, not a command failure. It exits `1` for an operational problem: a target that's
  neither an agent id nor a `provider:model` string, a missing provider key, or a project that doesn't
  load.

### Example

```bash
{{CLI_COMMAND}} models shapes vision --project my_project --live
```

```text
agent vision (agents/vision.yaml)
  model openrouter:google/gemini-2.5-flash-lite (mode: tool)
    nesting_depth     holds up to: 5
    list_of_objects   holds up to: 6
    enum_at_depth     holds up to: 100
  model openrouter:qwen/qwen3-vl-32b-instruct (mode: tool)
    nesting_depth     holds up to: 2
      breaks at 3: MODEL_SCHEMA_MISMATCH output of model openrouter:qwen/qwen3-vl-32b-instruct does not
      match the schema of inference shape_probe: next.next.next: Extra inputs are not permitted;
      next.next.token: Field required
    list_of_objects   holds up to: 6
    enum_at_depth     holds up to: 100
```

That's a real fallback model of a real agent losing track of the schema three levels deep — it invented an
extra nesting level while dropping the field the answer actually belonged in. This is exactly the kind of
restriction that isn't documented anywhere: the fix isn't more prompt wording, it's keeping this model's
real schemas at two levels of nesting or shallower, or not routing to it when the schema goes deeper.

## Testing a provider-specific setting

`--provider-options '<json object>'` merges into the request body sent for every probe, on both this
command and [`models check`](/engine/check-providers/) — the same place an agent's own
`settings.provider_options` YAML field lands. Use it to find out whether some provider-level knob actually
changes a model's behavior, instead of assuming it does because a provider's docs mention it.

The one worth knowing about on OpenRouter specifically is `require_parameters`: by default OpenRouter can
still route your request to an upstream provider that doesn't fully support the parameters you sent —
`tools` and `response_format` are only a *soft* preference between providers of the same model, not a hard
requirement, unless you set it:

```bash
{{CLI_COMMAND}} models shapes vision --project my_project --live \
  --provider-options '{"provider": {"require_parameters": true}}'
```

Run the same target with and without that flag and diff the two reports. If the boundaries move, some of
what looked like "this model can't do it" was actually "OpenRouter routed this call somewhere that
couldn't" — set `require_parameters: true` in the agent's `settings.provider_options` and the problem is
gone for good. If the boundaries don't move, as with the `qwen3-vl-32b-instruct` example above (its depth-3
break was identical with `require_parameters` on), the limit is the model itself, not the routing, and no
provider setting fixes it.

## How this shapes what you do

A boundary lower than what your real inference needs is a finding to design around, not a bug to work
around with a longer prompt: flatten the schema for that model, split one inference into two shallower
ones, cap a list at what the model actually holds, or route that node to a different model in
`fallback_models` for schemas past the boundary. A model that's never been probed hasn't been shown to
have *no* limit — it's only untested; treat an unfamiliar model's real depth as unknown until this command
has actually asked it.

## See also

- [How to check your model providers are configured](/engine/check-providers/) — which structured output
  *mode* a model supports and whether `output.strict` holds for it; this page is the companion question,
  how far a supported mode actually reaches.
- [What happens when a model is called](/concepts/what-happens-when-a-model-is-called/) — the
  structured-output repair retry that still runs during a real flow, independent of what this command
  finds.
- [How to call a model](/engine/llm-node/) — shaping `out` fields flat and small is already the default
  advice; this command is how you find out whether a specific model needs it more than most.
- [CLI commands](/reference/cli/) — every other command, including `run` and `secrets`.
