---
title: How to call a model
description: Add an llm node that calls an agent through a typed inference, with its prompt in its own file.
---

# How to call a model

## When you need this

Use an `llm` node whenever a step in your flow needs a model to read something and produce structured
output — summarize a message, classify it, extract fields, draft a reply. Every other node kind runs
your own code or routes data; this is the one that talks to a model.

## Steps

- Create a folder for the node and give the node file, the inference file, and the prompt file the
  same stem, so AQVEN links them by filename alone — no `inference:` key needed in the node YAML.
- Write `<stem>.node.yaml`: `node: "llm"`, a `description`, an `agent` (an existing agent's id), and
  `in` — the bindings that pull values from the flow's input or from earlier nodes into the fields the
  inference expects.
- Write `<stem>.inference.yaml`: the `in` fields the model reads and the `out` fields it must return,
  each with a type and a description. This is the typed contract for the call — the model can't return
  a field that isn't declared here.
- Write `<stem>.prompt.md`: the prompt itself, in its own Markdown file — never inline in the YAML. It
  reads the same `in` field names the inference declares.
- Point `agent` at an agent file (`agents/<agent_id>.yaml`) that already exists in the project, or add
  one — it's where the model string, temperature, and retry settings live, shared by every node that
  uses that agent.

### Example

This is the showcase project's `triage` node, the first model call in its `support_case` flow. Create
it yourself with:

```bash
{{CLI_COMMAND}} new my_project --template showcase
```

Its files live at `flows/support_case/nodes/triage/`. The node YAML has no `inference` key — the
adjacent `triage.inference.yaml` supplies it by filename:

```yaml
apiVersion: "aqven/v1"
kind: "Node"
node: "llm"
description: "Parses the message and every attachment: a summary, a category, observations, a safety flag, marketplace intake fields"
agent: "gemini"
in:
  - name: "message"
    from: "$prepare.out.message"
  - name: "channel"
    from: "$prepare.out.channel"
  - name: "customer"
    from: "$input.customer"
  - name: "product"
    from: "$input.product"
  - name: "signals"
    from: "$prepare.out.signals"
  - name: "intake_fields"
    from: "$prepare.out.intake_fields"
  - name: "photo"
    from: "$input.photo"
  - name: "voice_note"
    from: "$input.voice_note"
  - name: "video"
    from: "$input.video"
  - name: "invoice"
    from: "$input.invoice"
```

`in` bindings read from two places: `$input.*` pulls straight from the flow's own input, and
`$prepare.out.*` pulls from the output of `prepare`, the code node that runs right before `triage`.

`triage.inference.yaml` declares the typed contract. Here's an excerpt of its `in` and `out` — the
real file has ten `in` fields and five `out` fields in total:

```yaml
apiVersion: "aqven/v1"
kind: "Inference"
description: "Parses the message and every attachment: a summary, product category, observations against category signals, a safety flag, and marketplace intake fields"
in:
  - name: "message"
    type: "Text"
    description: "The customer's message text after whitespace normalization"
    maxLength: 4000
  - name: "photo"
    type: "Image?"
    description: "A photo of the product or the defect; null if none was attached"
out:
  - name: "summary"
    type: "Text"
    description: "A summary of the case, covering both the text and the attachments"
    maxLength: 600
  - name: "category"
    type: "ProductCategory"
    description: "The product category the case is about"
  - name: "safety_risk"
    type: "Bool"
    description: "Whether the message or attachments show signs of a safety issue"
```

`triage.prompt.md` reads those same `in` field names. Here's an excerpt — the real file also branches
on `channel`, has a conditional block for each of the other attachments, and lists out `signals` and
`intake_fields` in full:

```
{% message system cache %}
You are a first-line support agent for a smart-lighting brand. Read the customer's message together
with any attachments: summarize it, identify the product category, and note only observations backed
by the signals list.
{% endmessage %}
{% message user %}
{% if photo %}
A photo is attached: describe what it shows and check it against the message.
{% endif %}
Customer message:
<customer_message>
{{ message }}
</customer_message>
{{ output_format }}
{% endmessage %}
```

And `agent: "gemini"` points at `agents/gemini.yaml`, which sets the actual model string and call
settings shared by every node using this agent:

```yaml
apiVersion: "aqven/v1"
kind: "Agent"
description: "Multimodal case parsing, an attachment questionnaire, and a reply draft from the Google model family"
model: "openrouter:google/gemini-2.5-flash-lite"
settings:
  temperature: 0.2
  max_tokens: 4000
output:
  strict: false
  retries: 2
```

## Under the hood

An `llm` node's model call runs on [Pydantic AI](/concepts/what-this-is-built-on/), with a fixed layer
of guarantees AQVEN adds on top of every call in the project. See that page for what AQVEN takes as-is
and what it adds.

## See also

- [The engineering loop](/concepts/engineering-loop/) — what to do when a run's output isn't what you
  expected.
- [Node specifications](/reference/nodes/) — every field on `LlmNodeSpec`, generated from the code.
