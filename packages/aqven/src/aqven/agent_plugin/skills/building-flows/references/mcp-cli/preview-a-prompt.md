# How to preview a prompt as an agent

Call prompt_preview to see the exact instructions, messages, attachments and resolved output mode an llm node sends, and read its two real failure modes.

## Contents

- [When you need this](#when-you-need-this)
- [Steps](#steps)
  - [Example](#example)
- [See also](#see-also)

## When you need this

Call `prompt_preview` after editing a prompt, a fragment, a variant, or an `llm` node's inference
contract, to see exactly what the model will receive before spending a real call on it. It renders the
same prompt the engine would send, with no network call and no tokens spent.

## Steps

- Call it with `flow_id` and `node_id`. `input` and `variants` are both optional.
- Leave `input` out and every field is filled with a placeholder sample value built from the inference's
  own input schema — enough to see the prompt's shape without wiring real data. Pass `input` yourself to
  preview the exact values one real case would send.
- `variants` forces one variant slot to a specific case: pass the slot's declared name and one of its
  case names, or `"default"` to force the slot's own fallback text.
- The result covers the whole call:
  - `instructions` — the rendered system-level text, with every output limit appended automatically
    (max lengths, allowed enum values, and so on).
  - `messages` — every message the model receives, in order, each tagged with its `role` and `origin`:
    `"example"` for the few-shot pairs an inference file can declare, `"prompt"` for the actual rendered
    prompt.
  - `attachments` — every media field resolved to its field name, type, media type, and blob reference.
  - `variants` — the case in effect for each variant slot the inference declares, and whether it came
    from the `variants` argument or was picked by the field the slot reads.
  - `tools` — every tool, MCP tool, and subagent the calling agent has available.
  - `output` — the resolved output mode: whether the model answers through a tool call, a native
    structured-output mode, a plain JSON instruction, or — for a node whose only output is a single
    image — an image; why that mode was picked; the retry count; and the full JSON Schema the answer
    must satisfy.
- Two real failure modes:
  - **The node isn't an `llm` node.** A `code` node, for instance, has no prompt at all — the call fails
    with `NOT_FOUND`, naming the node and its actual kind.
  - **An unknown variant slot.** Pass a slot name in `variants` that the inference doesn't declare, and
    the call fails with `INPUT_INVALID`, naming the slots that do exist.
- `prompt_preview` reads the nodes of the project's own flows. An experiment's variants and its local flows have
  no preview yet. Run the experiment on one case instead,
  `aqven series <experiment_id> --cases 1 --repeats 1`, and open the `llm` node of each attempt's run
  with `run_get_node` to see what each variant sent.

### Example

Create the showcase project and connect an agent to it as in
How to connect AQVEN as an MCP server:

```bash
aqven new my_project --template showcase
cd my_project/my_project
```

Preview `revise`, the node inside `support_case`'s `polish` step that writes the customer-facing reply,
with no `input` at all. Real response, trimmed to the fields the list above actually walks through —
`messages` has one entry here because `revise` declares no few-shot examples:

```json
{
  "flow_id": "support_case",
  "node_id": "polish__revise",
  "model": "openrouter:openai/gpt-oss-20b",
  "input_source": "sample",
  "instructions": "You polish a reply to a customer on behalf of Lumen support. You get the draft reply, the accepted decision and the knowledge base passages the draft relies on. Keep every fact the draft states and change only the wording: shorter sentences, a calm and friendly tone, no jargon. Do not add promises, amounts or deadlines that the decision does not contain, and do not remove the safety step if the draft has one. Keep the citations exactly as they are: each one is a verbatim quote from a passage. If the draft addresses the customer by name, keep the name. The reply goes to the store chat, so write plain text without headings or lists longer than three steps. Answer in the language of the customer's request.",
  "messages": [
    { "role": "user", "origin": "prompt", "text": "The reply goes to the store's chat, so it can be informal but must stay polite. Draft reply: \"Hi Anna, please unplug the strip and check that the controller plug is fully seated. If the flicker comes back, we will replace the controller under warranty.\" Decision: replace the controller under warranty." }
  ],
  "variants": [
    {
      "slot": "lamp_guide",
      "case": "mains",
      "selector": "$in.product.lamp_kind",
      "forced": false,
      "text": "The lamp runs on mains power without an app. Start any troubleshooting with the power: unplug the lamp, check the plug and the socket, and plug it back in before suggesting anything else."
    }
  ],
  "output": {
    "mode": "tool",
    "mode_reason": "Pydantic AI profile default for openrouter:openai/gpt-oss-20b",
    "retries": 4,
    "tool_name": "final_result"
  }
}
```

The sample input's `product.lamp_kind` came back `"mains"`, so the `lamp_guide` variant slot picked its
`mains` case on its own — `forced: false`. The full `output.json_schema` behind `tool_name` is the shape
prose above already describes (a `reply` with `text` and `citations`).

Now call it on `prepare`, a `code` node earlier in the same flow — a real failure, not a tool error with
a false flag inside it:

```json
{
  "ok": false,
  "op": "prompt_preview",
  "code": "NOT_FOUND",
  "message": "node support_case.prepare is a code node: only llm nodes have a prompt"
}
```

Call `revise` again, this time forcing a variant slot that doesn't exist. Real response:

```json
{
  "ok": false,
  "op": "prompt_preview",
  "code": "INPUT_INVALID",
  "message": "inference revise has no variant slot nonexistent_slot: slots are lamp_guide"
}
```

`revise` does declare a real slot, `lamp_guide` — passing `{"lamp_guide": "smart_wifi"}` instead of the
bad slot name above would succeed, with `variants` in the result showing `"case": "smart_wifi"` and
`"forced": true`.

## See also

- [How to write a prompt](../engine/prompts.md) — the file format `prompt_preview` renders: plain text,
  Liquid template, or Python function.
- [How to call a model](../engine/llm-node.md) — the `llm` node kind `prompt_preview` reads from, and the
  only kind it works on.
- How to check and test a project as an agent — `aqven_check`, which a
  project must pass for `prompt_preview` to have a compiled prompt to render in the first place.
- How to connect AQVEN as an MCP server — getting an agent connected in
  the first place.
