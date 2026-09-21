---
title: Agents
description: Configure model calls with AQVEN agents backed by Pydantic AI.
---

An AQVEN agent chooses a model and settings for one or more inferences. AQVEN uses [Pydantic AI agents](https://ai.pydantic.dev/agents/overview/) for model calls; the AQVEN agent file controls the model used by an `llm` node. The inference owns its prompt and typed task; the agent owns model routing, instructions, tools, and call limits. Two agents can run the same inference so you can compare providers without rewriting the task.

## Configure one model

This complete `agents/assistant.yaml` configures a concise answerer:

```yaml
apiVersion: "aqven/v1"
kind: "Agent"
description: "Answer short questions"
model: "openrouter:openai/gpt-oss-20b"
settings:
  temperature: 0.2
  max_tokens: 1000
output:
  strict: false
  retries: 2
```

The project declares providers in `aqven.yaml`, with API keys referenced from the environment, for example `ref:env/OPENROUTER_API_KEY`. AQVEN handles the surrounding workflow contract, node bindings, checks, and durable execution.

Lowering `temperature` generally favors repeatable answers; changing `max_tokens` changes how long a response can be. `top_p`, `seed`, and `provider_options` are also available in `settings`. Provider support can differ, so test the resolved request rather than assuming every model honors every setting.

## Change structured output behavior

`output.mode` can be `auto`, `tool`, `native`, or `prompted`. `auto` lets AQVEN resolve a supported mode from the model profile. The defaults are `strict: true`, `retries: 1`, `on_refusal: fail`, and `on_truncated: fail`.

```yaml
output:
  mode: "auto"
  strict: false
  retries: 2
  on_refusal: "fail"
  on_truncated: "fallback"
```

Changing the mode changes how AQVEN asks the provider for structured output. Lowering `strict` may admit providers that cannot guarantee a strict schema, but output still needs validation. More retries can repair a bad response at the cost of more calls. `fallback` for refusal or truncation only makes sense when the alternate behavior is acceptable for your task. Keep the inference output type unchanged while comparing modes so the effect is measurable.

## Prepare for provider failure

`fallback_models` gives ordered alternatives:

```yaml
fallback_models:
  - "openrouter:qwen/qwen3-30b-a3b-instruct-2507"
  - "openrouter:mistralai/mistral-nemo"
```

The fallback must accept the task's input modalities and output mode. A fallback can change quality, cost, latency, and data policy. Run `models check` and evaluation cases with the fallback enabled before relying on it.

## Give an agent tools

An agent may declare `tools`, `mcp_servers`, and `subagents`. A model-facing tool runs through Pydantic AI's tool primitives; AQVEN adds the project tool contract, effects, and approval rule. For a sensitive tool, require a human decision:

```yaml
tools:
  - "send_message"
approval:
  tools: ["send_message"]
  assignee: "reviewer"
  timeout_seconds: 3600
  on_timeout:
    policy: "fail"
```

Only list tools the agent needs. Changing `tools` changes what actions the model may request. Changing `approval` changes when a person must intervene. [Tools and human steps](/engineering/tools-and-human-steps/) covers the tool contract and wait behavior.

Before relying on a provider, inspect the resolved output mode with `uv run {{CLI_COMMAND}} models check --project .`. The generated [Agent reference](/engineering/reference/agents/) lists every setting and default; [Project reference](/engineering/reference/project/) lists provider fields. [Prompts](/engineering/prompts/) covers the request each agent receives.

## Every agent field

| Field | Purpose | Effect of changing it |
| --- | --- | --- |
| `apiVersion`, `kind`, `description` | Identify and describe the entity | The first two must be `aqven/v1` and `Agent`. |
| `model` | Primary `provider:model` route | Changes model behavior, cost, latency, and data route. |
| `fallback_models` | Ordered alternatives | Changes what can run after a primary failure. |
| `settings` | Generation parameters | Changes response style, length, and provider-specific behavior. |
| `output` | Output mode, strictness, retry and failure policies | Changes how typed output is requested and handled. |
| `instructions` | Markdown file shared by uses of this agent | Changes model-facing guidance across its tasks. |
| `tools` | Project tool IDs | Changes what actions the model may request. |
| `mcp_servers` | Project MCP server IDs | Changes externally supplied tool availability. |
| `subagents` | Named specialist agent/inference pairs | Adds delegated model work and failure paths. |
| `approval` | Human gate for selected tools | Pauses a model-requested effect for review. |
| `limits` | Request, tool, token, cost, and time budget | Bounds work in this agent call. |
| `capabilities` | Family, modality, and strict-output overrides | Changes compatibility assumptions, not actual provider capability. |

Unknown fields are rejected. The [generated Agent reference](/engineering/reference/agents/) has exact nested types, defaults, and allowed values.

## Keep instructions in a file

Use `instructions` for stable guidance shared by tasks that use this agent:

```yaml
instructions: "./assistant.instructions.md"
```

It is a Markdown path, not inline prompt text. A supported `@root/...` path also works. Keep task-specific facts in the inference prompt and input; use the agent file for role and tool rules. Changing instructions can affect every inference that reuses the agent. [Code references and aliases](/engineering/code-references-and-aliases/#reference-prompt-and-instruction-files) explains paths.

## Compare output modes

`output.mode` accepts `auto`, `native`, `tool`, and `prompted`. `auto` resolves from the selected model profile. `native` tests a provider's native structured-output route; `tool` tests a tool-style typed response; `prompted` relies on prompt instructions plus validation. The defaults are `mode: auto`, `strict: true`, `retries: 1`, and `on_refusal`/`on_truncated: fail`. Retries accept 0–5.

The settings schema permits `temperature` from 0 to 2, `top_p` greater than zero and at most one, positive `max_tokens`, nonnegative `seed`, and provider-specific JSON `provider_options`. Schema acceptance does not mean every provider honors a setting. Compare **both** schema adherence and field accuracy on the same cases. [Design structured output](/engineering/schema-design/) gives a measurement plan.

## Configure approval outcomes

`approval.on_timeout` has three shapes. A timeout may fail, return a declared default value, or escalate to another assignee:

```yaml
on_timeout: {policy: "fail"}
```

```yaml
on_timeout:
  policy: "default"
  value: {approved: false}
```

```yaml
on_timeout:
  policy: "escalate"
  assignee: "team_lead"
  timeout_seconds: 1800
```

Choose the outcome before using a write or external tool. A default must have a safe meaning for the tool's effect and downstream contract; escalation needs another owner and a bounded wait. A `human` node is appropriate when the workflow itself asks a person; approval gates a specific model-requested tool call.

## Add an MCP server or specialist

List project-declared `mcp_servers` beside `tools` when the model needs tools from a server. The server definition owns its connection; listing its ID on an agent exposes its tools for that model call. Keep the set narrow and test an unavailable server path.

`subagents` names a model-facing specialist, another agent, and the inference it performs:

```yaml
subagents:
  - name: "research_policy"
    description: "Find the relevant policy and cite its source"
    agent: "researcher"
    inference: "research_policy"
```

The referenced agent and inference must exist. Give the specialist a narrow output type; each delegated call adds cost and another failure path. Use it when a task needs a distinct tool set, model, or context, and set limits on the parent and specialist.

## Override capabilities only with evidence

`capabilities` may declare `family`, `input`, `output`, and `strict` when model profiling is insufficient. It changes what AQVEN assumes during compatibility checks; it cannot make a text-only endpoint accept images or add strict output support. Document the reason for an override and test it with a live model check and a dataset case.

## Check a single target

```bash
uv run {{CLI_COMMAND}} models check --project .
uv run {{CLI_COMMAND}} models check assistant --project .
uv run {{CLI_COMMAND}} models check openai:your-model-id --project .
uv run {{CLI_COMMAND}} models check assistant --project . --live --json
```

Without a target, the command checks every project agent. An agent ID checks its configured model and fallbacks; a `provider:model` string checks one model route. `--live` makes small real requests and may incur cost. After compatibility checks, run a representative dataset: model support alone does not prove the task's answer is correct. [Providers](/engineering/providers/) shows catalog, compatible, and custom routes.
