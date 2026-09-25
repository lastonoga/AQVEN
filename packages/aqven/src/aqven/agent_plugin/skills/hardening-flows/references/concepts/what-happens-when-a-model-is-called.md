# What happens when a model is called

Every model call lands on one of four outcomes before AQVEN parses anything, and each agent decides whether an error, a refusal or a truncation fails the node, retries the model, or falls back to the next one.

## Contents

- [In short](#in-short)
- [Four outcomes, decided before any parsing](#four-outcomes-decided-before-any-parsing)
- [Two retries that happen automatically](#two-retries-that-happen-automatically)
- [What an agent does with an error, a refusal or a truncation](#what-an-agent-does-with-an-error-a-refusal-or-a-truncation)
- [What gets redacted, and when](#what-gets-redacted-and-when)
- [How this shapes what you do](#how-this-shapes-what-you-do)
- [See also](#see-also)

## In short

Every model call ends in one of four outcomes — `ok`, `error`, `refusal`, or `truncated` — decided from
the provider's own finish reason before AQVEN tries to parse anything out of the response. Two kinds of
retry happen automatically: a transport-level retry for network and HTTP failures, and a
structured-output repair retry when the response is `ok` but doesn't match the schema. The other three
outcomes follow a policy you set per agent: `fail` the node, `retry` the same model, or `fallback` to the
next model. By default an `error` is retried, and a `refusal` or a `truncated` answer fails the node.

## Four outcomes, decided before any parsing

Before AQVEN tries to read structured output out of a response, it checks the finish reason the provider
sent back with it:

- The provider ended the response with an error — for example, the model wrote a broken tool call and
  the provider reported `MALFORMED_FUNCTION_CALL` — the call is `error`.
- The provider ran out of room and cut the answer off mid-way — the call is `truncated`.
- The provider declined to answer at all — the call is `refusal`.
- Anything else — the call is `ok`, and only now does AQVEN go on to parse the response into the shape
  your node declared.

This ordering is deliberate: a response can't be checked for outcome after it's already been parsed,
because a truncated JSON object can look like valid, complete JSON right up until a field is missing. By
deciding the outcome first, from the finish reason rather than from whether parsing happened to succeed,
a cut-off or broken answer can never get silently "repaired" into an object that looks complete but
isn't. It also means your checks only ever see a response that finished normally.

## Two retries that happen automatically

Two different problems get retried, at two different layers, and neither one is triggered by an `error`,
a `refusal` or a `truncated` answer — those follow the agent's outcome policy, described in the next
section.

**Transport-level retry** covers the call never really completing: a rate limit, a request timeout, a
server error, a dropped connection. AQVEN retries these itself, honoring the provider's `retry-after`
header when it sends one, up to a small number of attempts within a time budget. A rate limit (`429`) also
pauses every other call of the same model until the wait is over, and the provider's
`on_rate_limit` decides how long it waits and
how often it tries. A plain client error — a bad request, for instance — is never retried; only failures
that look transient are.

**Structured-output repair retry** covers a different problem: the call came back `ok`, but what it
returned doesn't match the schema your node declared. AQVEN re-prompts the model with the validation
errors so it can fix its own output, up to a bounded number of extra attempts you set per agent. This
only fires on the `ok` branch — a response that ended with an error, was refused or was truncated never
reaches this step, because the outcome check already stopped it.

The showcase project's `gpt` agent (`agents/gpt.yaml`) raises this bound above the default of 1, for an
agent that drafts a long answer and revises it against critique before a final call:

```yaml
apiVersion: "aqven/v1"
kind: "Agent"
model: "openrouter:openai/gpt-oss-20b"
output:
  strict: false
  retries: 4
```

`strict: false` here is what makes this retry the one doing the work: it asks AQVEN to validate the
response itself rather than asking the provider to constrain generation to the schema up front — every
template ships this way by default. See How to check your model providers are
configured for what turning `strict: true` on actually requires.

Here's the transport retry in action: a call gets back a `429` response with `retry-after: 2`, twice in a
row, then succeeds on the third attempt — each retry waits the two seconds the provider asked for, not a
guess.

## What an agent does with an error, a refusal or a truncation

Each agent chooses what happens after each of the three bad outcomes, with one field per outcome under
`output`:

| Field | Outcome | Default |
|---|---|---|
| `on_error` | `error` | `retry` |
| `on_refusal` | `refusal` | `fail` |
| `on_truncated` | `truncated` | `fail` |

Each field takes one of three values:

- `fail` — the node fails on the same run turn, with the outcome as its error code (`provider_error`,
  `refusal`, or `truncated`) and a hint that names the field to change in the agent file.
- `retry` — AQVEN sends the same request to the same model again. The bad response is dropped: it is
  not part of the conversation the model sees next, and your checks never see it. These retries share
  the `output.retries` budget with repair retries, so one model answers at most `output.retries + 1`
  times for a node. When the budget is used up, the node fails.
- `fallback` — AQVEN sends the same request to the next model in the agent's `fallback_models`. That
  model starts with its own full `output.retries` budget. When no model is left, the node fails.

An agent whose primary model sometimes ends a response with an error, and which has a second model to
fall back on:

```yaml
apiVersion: "aqven/v1"
kind: "Agent"
description: "Sorts a support ticket into a queue"
model: "openrouter:google/gemini-2.5-flash-lite"
fallback_models:
- "openrouter:openai/gpt-oss-20b"
output:
  retries: 3
  on_error: "fallback"
```

When the first model ends a response with an error, this agent doesn't spend its three retries asking the
same model again: it sends the same request to the fallback model, which gets its own three retries. A
refusal or a truncation still fails the node, because `on_refusal` and `on_truncated` keep their
default. `aqven check` rejects `fallback` on an agent that has no `fallback_models`
(`E_OUTCOME_FALLBACK`).

Every attempt that ends this way shows up in the run history as a failed attempt, with its cause
(`provider_error`, `refusal`, or `truncated`) and what AQVEN did next (`retry`, `fallback`, or `none`). If
the node streams its output, the text of the dropped attempt is marked as discarded, the same way as
after a repair retry. The tokens and cost the provider reported for the dropped attempt still count
toward the node's usage.

## What gets redacted, and when

When an attempt fails for any reason, the raw model output that gets captured into the failure's error
details goes through one small, always-on redactor first: five fixed patterns — email address, IBAN,
card number, phone number, IP address — get replaced with a placeholder before that text is stored or
shown in run history. This runs with no configuration, on every failed attempt, because that failure
text is exactly the kind of raw provider output that ends up in logs and observability tooling while
you're debugging.

If a failed attempt's raw output includes `anna@example.com`, the stored record has that address
replaced with `<EMAIL>` — the rest of the output is untouched.

That's the only redaction that's automatic. A broader mechanism exists that can redact an entire outgoing
prompt and incoming response — not just the error text from a failure — and it's real and tested. But it
is off by default, and there's no project-level setting yet that turns it on. Don't assume every call's
full request and response gets scrubbed; only a failed attempt's captured error text does, and only
against those five patterns.

## How this shapes what you do

Don't build your own retry loop around network errors, schema mismatches or provider errors — all three
are already handled the same way for every model call in the project. Do choose an outcome policy per
agent: `fallback` when another model is likely to succeed where the first one failed, `retry` when the
failure looks random, and `fail` when a refusal or a cut-off answer should stop the workflow so that the
flow can route around the failed node. And don't rely on every call's full prompt and response being
scrubbed of personal data — only a failed attempt's captured output is, and only for the five patterns
listed above.

## See also

- What this is built on — the reader-facing summary of these same
  behaviors, and everything else AQVEN takes as-is versus adds itself.
- [Agent specification](../reference/agents.md) — the literal `output.retries`, `on_error`, `on_refusal`, and
  `on_truncated` fields, their types, and their defaults.
- How to check your model providers are configured — what `output.strict`
  does instead of leaning on this retry, and what `aqven check` requires before it compiles.
- How to find a model's real structural limits — the repair retry can fix a
  wrong shape once; this finds the depth, list length and enum size where a model stops getting it right
  at all.
- How to call a model — where an agent's `output.retries` setting actually lives in
  a project, next to the model string and call settings.
