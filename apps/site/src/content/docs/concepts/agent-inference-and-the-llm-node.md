---
title: Agent, Inference, and the llm node
description: An llm node is backed by three separately filed entities that vary independently, not one blob of config.
---

## In short

One `llm` node is actually three separate files: an **Agent** (which model, at what settings — "how to
call"), an **Inference** (the typed in/out contract and the prompt that fills it — "what to ask"), and
the **Node** itself (where the call sits in the flow, and how flow data feeds the inference's input —
"when, with what"). The node references the other two by id; neither an Agent nor an Inference runs on
its own. They vary independently — one Agent can serve many Inferences, and one Inference can be asked
of many Agents — and that independence is the whole reason the split exists.

## Three files, three questions

Every `llm` node answers three different questions, and each one lives in its own file:

- **Agent — how to call.** Which model string, at what temperature and token limit, with what
  retry and structured-output settings, which tools it can reach. An Agent knows nothing about what
  it's being asked or what shape the answer should take.
- **Inference — what to ask.** The typed input fields the prompt reads, the typed output fields the
  model must return, and the prompt itself. An Inference knows nothing about which model answers it.
- **Node — when, with what.** Where this call sits in the flow, and which upstream values feed the
  inference's input fields. The node holds an `agent` id and an `inference` id, not the Agent's or the
  Inference's contents.

None of the three is runnable by itself. An Agent with no Inference has settings and nowhere to point
them. An Inference with no Agent has a question and no model to ask. A node exists only to connect a
specific Agent to a specific Inference at a specific point in a flow, by id — it doesn't embed either
one inline.

For the mechanics of creating this trio of files — the filename convention that lets a node's
`inference:` key be omitted, the field list, the prompt syntax — see
[how to call a model](/engine/llm-node/). This page is about why there are three files and how they fit
together, not how to write one.

## Why split them: two directions of reuse

The split pays off because Agent and Inference vary on their own schedules. A team adopts a new model
for every call it makes — that's an Agent change. A team rewrites what it asks a model for — that's an
Inference change. Coupling the two would force a change to one every time you touch the other.

**One Agent, many Inferences.** A single Agent — pointed at one model, with one set of settings — can
back every kind of call that model is good at: parsing an incoming message, drafting a reply, judging
another draft. Each of those calls is a different Inference (different input fields, different output
fields, different prompt), and all of them point `agent:` at the same Agent id. Change that Agent's
model string once, and every node using it switches models together.

**One Inference, many Agents.** The reverse also holds: the same question — same input fields, same
output contract, same prompt — can be put to several different models, each through its own Agent. This
is how you get independent answers to one well-defined question, one per model family, without writing
the question more than once.

### A real example: one prompt, two models

The [showcase](/start/quickstart/) project's `support_case` flow asks the same question more than once, once per model
family, to get independent draft replies. The question itself is one Inference file,
`nodes/polish/revise.inference.yaml`. Here's a slice of its typed contract:

```yaml
in:
- name: "summary"
  type: "Text"
- name: "chunks"
  type: "KbChunk[]"
out:
- name: "reply"
  type: "ReplyDraft"
```

Two node files put that same question to two different models. Each lives in its own file, in
`nodes/drafts/`, and each names the same inference by id but a different agent. `gemini.node.yaml`:

```yaml
node: "llm"
inference: "revise"
agent: "gemini"
```

`gpt.node.yaml`, right next to it:

```yaml
node: "llm"
inference: "revise"
agent: "gpt"
```

Both bind the same upstream fields, because it's the same question — only `agent:` changes. Each
`agent` id points at its own file: `agents/gemini.yaml` sets `model:
"openrouter:google/gemini-2.5-flash-lite"` with `temperature: 0.2`, and `agents/gpt.yaml` sets `model:
"openrouter:openai/gpt-oss-20b"` with `temperature: 0.3` and 4 retries. Two model calls, one prompt,
one contract, two independent drafts — a downstream node picks the best one.

The reverse direction is just as ordinary and easier to miss because it doesn't stand out in a file
tree: any two nodes anywhere in the project that both write `agent: "gemini"` are already reusing that
one Agent for whatever different questions their own Inference files ask.

## How this shapes what you do

When a call should switch models, change the Agent file — every node pointing at that Agent id picks up
the new model, settings, and retry policy together, without touching a single node or inference file.

When a call should ask something different — new input fields, a new output shape, new prompt wording —
change the Inference file, and every node built on top of it (if more than one is) changes with it.

When you want the same question answered by more than one model, don't copy the Inference: add another
node file that names the same `inference` id and a different `agent` id, the way the showcase project's
draft nodes do. And when you're deciding where a new `llm` node's three files fit among AQVEN's
other node kinds, [ten kinds of nodes](/concepts/ten-kinds-of-nodes/) is the map — `llm` is one of ten,
each with its own job.

## See also

- [How to call a model](/engine/llm-node/) — the concrete steps and field lists for writing an Agent,
  an Inference, and an `llm` node, with the triage node's full file set as the worked example.
- [What this is built on](/concepts/what-this-is-built-on/) — what Pydantic AI does for a model call and
  what AQVEN adds on top of it.
- [Files as source of truth](/concepts/files-as-source-of-truth/) — why a node's files sit colocated by
  filename in the first place.
- [Ten kinds of nodes](/concepts/ten-kinds-of-nodes/) — where `llm` sits among the other node kinds.
