---
title: What happens when a model is called
description: Every model call lands on one of three outcomes before AQVEN parses anything, and only two kinds of retry happen for you.
---

## In short

Every model call ends in one of three outcomes — `ok`, `refusal`, or `truncated` — decided from the
provider's own finish reason before AQVEN tries to parse anything out of the response. Two kinds of
retry happen automatically: a transport-level retry for network and HTTP failures, and a
structured-output repair retry when the response is `ok` but doesn't match the schema. Neither one
retries a refusal or a truncation by sending the prompt again — today, a refusal or a truncation simply
fails the node.

## Three outcomes, decided before any parsing

Before AQVEN tries to read structured output out of a response, it checks the finish reason the provider
sent back with it:

- The provider ran out of room and cut the answer off mid-way — the call is `truncated`.
- The provider declined to answer at all — the call is `refusal`.
- Anything else — the call is `ok`, and only now does AQVEN go on to parse the response into the shape
  your node declared.

This ordering is deliberate: a response can't be checked for outcome after it's already been parsed,
because a truncated JSON object can look like valid, complete JSON right up until a field is missing. By
deciding the outcome first, from the finish reason rather than from whether parsing happened to succeed,
a cut-off answer can never get silently "repaired" into an object that looks complete but isn't.

## Two retries that happen automatically

Two different problems get retried, at two different layers, and neither one touches a refusal or a
truncation.

**Transport-level retry** covers the call never really completing: a rate limit, a request timeout, a
server error, a dropped connection. AQVEN retries these itself, honoring the provider's `retry-after`
header when it sends one, up to a small number of attempts within a time budget. A plain client error —
a bad request, for instance — is never retried; only failures that look transient are.

**Structured-output repair retry** covers a different problem: the call came back `ok`, but what it
returned doesn't match the schema your node declared. AQVEN re-prompts the model with the validation
errors so it can fix its own output, up to a bounded number of extra attempts you set per agent. This
only fires on the `ok` branch — a response that was refused or truncated never reaches this step, because
the outcome check already stopped it.

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

Here's the transport retry in action: a call gets back a `429` response with `retry-after: 2`, twice in a
row, then succeeds on the third attempt — each retry waits the two seconds the provider asked for, not a
guess.

## A refusal or a truncation fails the node

This is the part worth stating plainly: neither retry mechanism above re-sends the prompt after a
refusal or a truncation. There's no built-in step that asks for more room and tries again, and no
built-in fallback to a model with a larger context window. A `refusal` or `truncated` outcome fails the
node, the same run turn it happened on, full stop.

If your workflow needs to survive a refusal or a truncation, that recovery is something you build into
the flow yourself — routing to a fallback path after the node fails, for example — not something AQVEN
does for you underneath the node.

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

Don't build your own retry loop around network errors or schema mismatches — both are already handled
the same way for every model call in the project. Do build your own handling for a refusal or a
truncation if your workflow needs to survive one: check for that failure after the node and route around
it, because AQVEN won't retry the same prompt or fall back to another model for you. And don't rely on
every call's full prompt and response being scrubbed of personal data — only a failed attempt's captured
output is, and only for the five patterns listed above.

## See also

- [What this is built on](/concepts/what-this-is-built-on/) — the reader-facing summary of these same
  three behaviors, and everything else AQVEN takes as-is versus adds itself.
- [Agent specification](/reference/agents/) — the literal `output.retries`, `on_refusal`, and
  `on_truncated` fields, their types, and their defaults.
- [How to call a model](/engine/llm-node/) — where an agent's `output.retries` setting actually lives in
  a project, next to the model string and call settings.
