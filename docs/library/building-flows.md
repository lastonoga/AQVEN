# Building flows that work

> Status: written 2026-09-17 for people and for coding agents that edit AQVEN projects.
> Layout and file names: [project-structure.md](project-structure.md). This guide is about the judgement calls the
> file layout does not make for you: wiring data, writing prompts, choosing a model and an output mode, designing
> scenario tests and reading what `aqven check` tells you.

## 1. The loop

```
edit a file  ->  aqven check  ->  aqven prompt preview <flow>.<node>  ->  pytest
```

- **`aqven check` is the gate.** It checks the files statically (references, types, prompts, code signatures,
  provider extras, output modes) and then simulates every flow: it runs the whole graph with generated values and
  simulated model answers, without a network and without spending tokens. A flow that `aqven check` accepts wires up
  and renders; what it cannot tell you is whether a model answers well.
- **`aqven prompt preview` is the eye.** It prints exactly what one llm node sends: the instructions, every message
  with fragments and variants already rendered, the attachments, the tools and the output contract. Most prompt bugs
  are visible there in one second: a placeholder that stayed literal, an input that never reaches the text, a variant
  that never switches.
- **Tests are the memory.** A scenario test pins a path through the flow so a later edit cannot silently change it.
- Never use a live model call to find out whether a flow is wired correctly. That is what the first two steps are for.

## 2. Wiring data between nodes, tools and flows

### 2.1. Bindings

A node declares what it needs in `in:`; each entry is `name` plus exactly one source, `from` (a reference) or `value`
(a literal):

```yaml
in:
- name: "text"
  from: "$prepare.out.text"
- name: "tone"
  from: "$input.tone"
- name: "language"
  value: "en"
```

References always start with `$`:

| Reference | Reads |
|---|---|
| `$input` | the flow input; `$input.customer.email` walks into it |
| `$<node>.out` | the output of another node of the same flow: `$classify.out.category` |
| `$item`, `$index` | the current element and its position inside `map` |
| `$case` | the value a `switch` matched |
| `$acc`, `$iter` | accumulator and iteration counter inside `loop` |
| `$branch.<key>` | the output of one branch of a `parallel` |
| `$ok`, `$failed` | the successful and failed elements after `map` |
| `$run.context.date`, `.time_zone`, `.locale`, `.tenant_id` | the run context |

Steps after the root: `.field`, `[0]` (one element), `[*]` (lift: the same field of every element, giving an array).
Inside an inference (variant selectors, allowed sets, dynamic shapes) the root is `$in`, the input of that inference.

Rules the compiler enforces, so you do not have to remember them: a reference must exist (`E_REF_MISSING`), must be
visible from that node (`E_REF_SCOPE`, a node cannot read a sibling inside another branch), must fit the declared type
(`E_BINDING_TYPE`), every declared input must be bound (`E_INPUT_UNBOUND`), and the graph must be acyclic (`E_CYCLE`).

### 2.2. Shapes

Declare every shape once, in `types/`, and let `aqven generate` write `types.py`. A node's contract is its
`in`/`out`; an llm node's contract lives in its inference. Keep outputs bounded: `maxLength`, `maxItems`, `minimum`
and `maximum` on output fields are what the engine turns into the "Output limits" block the model sees, and what it
rejects the answer by. An unbounded text output is `E_OUTPUT_UNBOUNDED`.

Optional fields end with `?` (`Image?`). An optional input that no binding fills arrives as `null`, so a prompt that
mentions it must guard it with `{% if %}`.

For a `Dynamic` output, `schema_from` reads a `FieldSpec[]` input on each run. When the possible value shapes are
also declared as a registry record or union, `value_type` lets Studio show their fields before a run:

```yaml
out:
- name: "record"
  type: "Dynamic"
  description: "Completed case form"
  schema_from: "$in.form_fields"
  value_type: "CaseRecord"
  limits: {max_fields: 30, max_depth: 2, max_text_length: 400, max_items: 10}
```

`value_type` is a design-time expected shape for `record.value`; it must name a registry record or union. The
runtime still shapes and validates the generated value from `schema_from`. The hint adds no second runtime check;
use a `narrow` node if the flow must validate the result against `CaseRecord` itself.

### 2.3. Tools

A tool is a contract plus a function: `tools/<tool>.yaml` with `run`, `effect` (`read`, `write`, `external`), `in`
and `out`; the function lives in `tools/functions.py`. An MCP tool has `mcp: {server, tool}` instead of `run`, and no
`in`/`out`: the server provides the schema. Agents list the tools they may call; nodes never configure tools.

`effect: read` tools run inside the model step. A `write` or `external` tool is a side effect: the engine runs it as a
separate durable step and asks for approval first. Approval comes from the agent's `approval` block (`tools`,
`assignee`, `timeout_seconds`, `on_timeout`); without it every such call is denied at run time with
"agent does not declare approval". `aqven check` verifies that `approval.tools` names tools the agent actually
has (`E_APPROVAL_TOOL`).

The model sees a tool by its id and its description, so the description is prompt text: write what the tool does and
when to call it, not how it is implemented. `aqven prompt preview` lists the tools the model will be offered.

### 2.4. Splitting work between nodes

- A `code` node is the right place for anything deterministic: normalising text, arithmetic, validation, picking a
  winner out of several answers. Do not ask a model to do arithmetic a function can do exactly.
- A `switch` node routes on a value that already exists; make the branch value an enum type, so exhaustiveness is
  checked (`E_SWITCH_NOT_EXHAUSTIVE`).
- A `parallel` node fans out to independent branches, `map` fans out over a list, `loop` repeats with an accumulator.
- A `call` node reuses another flow; that is how a subgraph is shared.
- An llm node should receive exactly the data its prompt renders. Binding a whole record and rendering one field of it
  is fine; binding data the prompt never mentions is `E_PROMPT_INPUT_UNUSED`.

## 3. Writing prompts

### 3.1. What a prompt is

The prompt of an inference is a Markdown file next to it (`<inference>.prompt.md`), never a string in YAML. It is a
small Liquid template with a deliberately narrow set of tags: `if`/`elsif`/`else`, `case`/`when`, `for`, `include`,
`comment`, `#` and `message`. **Filters are not allowed** (`E_PROMPT_FILTER_FORBIDDEN`): formatting belongs in a code
node, so that what the model reads is what the data is.

Three levels:

1. **Instruction** — plain text with no variables. The engine appends the inputs and the output format itself.
2. **Template** — the usual case: variables, conditions, fragments and variants.
3. **Code** — a function that returns `RenderedPrompt`, for prompts a template cannot express.

### 3.2. The rules the renderer enforces

- Every variable must be a declared input of the inference (`E_PROMPT_VARIABLE_UNDECLARED`), and every declared input
  must appear in the template (`E_PROMPT_INPUT_UNUSED`). The contract and the text cannot drift apart.
- `{{ output_format }}` must appear exactly once in a template prompt (`E_PROMPT_OUTPUT_FORMAT`). It renders the
  output fields with their descriptions and the allowed values of the id types.
- `{% message system %}`, `{% message user %}` and `{% message assistant %}` split the prompt into a conversation;
  they are allowed only at the top level, and the last message must be `user`. Without any `{% message %}` block the
  whole text is one user message. System text is merged into the model instructions, not sent as a user turn.
- `{% include "fragments/brand_voice" %}` inlines a fragment. Fragments are static text: a variable inside a fragment
  is an error, because a fragment has no contract of its own.
- `{% for %}` iterates only over an input array field; `{% case %}` over an enum must cover every value
  (`E_PROMPT_CASE_NOT_EXHAUSTIVE`).
- Media inputs (`Image`, `Audio`, `Video`, `Document`) are sent as message parts, not as text. Use them only in
  conditions (`{% if photo %}`); rendering one is `E_PROMPT_MEDIA_RENDERED`.
- A `Dynamic` value renders as a whole (`{{ form }}`): the engine prints one readable line per field. Reaching into
  it is `E_OPAQUE_ACCESS`.
- Records and lists render as readable text, not as a Python repr; a value whose every field is media has no text form
  (`W_PROMPT_VALUE_UNREADABLE`).

### 3.3. Variants

A variant slot swaps a piece of text on a value:

```yaml
variants:
  tone:
    on: "$in.mood"
    cases:
      calm: "calm"
      warm: "warm"
```

The files are `<inference>.variants/<slot>/<case>.md`, the prompt prints `{{ variants.tone }}`, and a value with no
case needs a `default` or the run fails. Use variants for wording that changes with the data, not for logic: a branch
that changes what the flow does belongs in a `switch` node.

### 3.4. What to write

- Put the stable instruction (role, standing rules) into the agent's `instructions`, and the per-call work into the
  prompt. The agent instruction is shared by every inference that agent runs.
- Give the model the data, not a description of the data. Wrap free text in a tag (`<question>{{ text }}</question>`)
  so the boundary is unambiguous.
- Do not repeat the output schema in prose. `{{ output_format }}` and the generated "Output limits" block already
  state the fields, the allowed values and every bound; a second, hand-written copy is what drifts.
- Say what to do when the data is missing or contradictory, otherwise the model invents a rule for you.
- One instruction per sentence, no alternatives ("either ... or ..."), and keep the ordering of the steps the same as
  the ordering of the output fields.

### 3.5. Read the preview

```
aqven prompt preview support_case.reply --project src/lumen
aqven prompt preview support_case.reply --input case.json --variant tone=warm
aqven prompt preview support_case.reply --json
```

Without `--input` the preview fills the inference input with sample values built from the input schema (the first
value of an enum, a `<field>` placeholder for text, the lower bound of a number, a valid placeholder for a media
field), so it works on a fresh project.
`--variant slot=case` forces one variant. What to look at, in order:

1. the **input** block: is every field the prompt needs actually there;
2. the **messages**: is every placeholder replaced, is the fragment inlined, did the right variant land;
3. the **instructions**: the agent text, then the output limits generated from the output schema;
4. the **output contract**: the resolved `output.mode`, the output tool and, in `prompted` mode, the JSON schema block
   the model layer appends;
5. the **notes**: what the preview could not resolve (an allowed set that comes from another node's output, a prompt
   function whose generated models are not importable).

The same preview is available to tools: `POST /api/flows/{flow_id}/nodes/{node_id}/prompt/preview` with
`{"input": ..., "variants": ...}`, and the MCP tool `prompt_preview`.

## 4. Choosing a model and an output mode

### 4.1. The model

`model: "provider:model"` in the agent file; `fallback_models` lists what to try when the first one fails. The
provider must be declared in `aqven.yaml` and its extra installed, otherwise `aqven check` reports
`E_PROVIDER_EXTRA_MISSING` with the exact `uv add` line. Every request is streamed, so a provider without streaming is
`E_PROVIDER_NO_STREAMING`.

Pick the cheapest model that holds the contract, and check before you commit to it:

```
aqven models check --project src/<module>            # every agent, offline
aqven models check openrouter:openai/gpt-oss-20b --live
```

Offline it prints what each output mode needs and what `auto` resolves to; `--live` sends one tiny request per mode
and prints which of them actually worked, with a YAML snippet to paste.

Raise the model only when the failure is judgement (the answers are wrong, not malformed). A malformed answer is
usually an output-mode problem, a missing bound or a prompt that asks for two things at once.

### 4.2. `output.mode`

```yaml
output:
  mode: "auto"      # auto | tool | native | prompted
  strict: true
  retries: 2
```

- **tool** — the model must call the `final_result` tool whose parameters are the output schema. The default for
  models with good tool calling.
- **native** — the provider enforces the schema itself. The strictest option where it exists.
- **prompted** — the schema is sent as text and the answer is parsed as JSON. Every model supports it; use it for
  small or old models that ignore tools.
- **auto** resolves deterministically at compile time from the model profile plus a table of known models shipped
  inside aqven; there is no switch at run time. The resolved mode is visible in `aqven tree`, in the preview and in
  `W_OUTPUT_MODE_RESOLVED`. Pin the mode in the agent file when you want it fixed.

`strict: false` is needed for models that do not accept strict JSON schemas (`E_STRICT_UNSUPPORTED` says so).
`retries` is how many times the engine asks again after a schema violation; each rejection carries the violated field
back to the model.

When a run fails with `MODEL_NO_STRUCTURED_OUTPUT`, `MODEL_INVALID_JSON`, `MODEL_SCHEMA_MISMATCH`,
`MODEL_FEATURE_UNSUPPORTED` or `MODEL_RETRIES_EXHAUSTED`, the error carries a hint that names the file to change. Read
the hint before changing the model.

## 5. Presenting inference values in Studio

An inference may declare a display template for its input, output, or both. This changes only how Runs presents a
recorded value. The value used by the model, checks, references, retries and replay stays the same. Runs offers
**Formatted** and **Raw** (the complete JSON value). If the formatter is missing or fails, Raw remains available.

```yaml
display:
  input:
    template: "@root/flows/support_case/nodes/polish/revise.input.display.liquid"
    variables:
      locale: "$in.locale"
  output:
    template: "@root/flows/support_case/nodes/polish/revise.output.display.liquid"
    variables:
      locale: "$in.locale"
```

The template is a Liquid component document, not a template for JSON text. It must have one root `section`. Each
component tag builds a typed display node; `if` and `for` choose and repeat nodes. For example:

```liquid
{% section title: "Customer reply" %}
  {% card title: "Revised answer", description: "Complete response", tone: "positive" %}
    {% text path: "/reply/text" %}
  {% endcard %}
  {% if value.reply.citations %}
    {% card title: "Evidence" %}
      {% list title: "Citations" %}
        {% for citation in value.reply.citations %}
          {% assign quote_path = "/reply/citations/" | append: forloop.index0 | append: "/quote" %}
          {% text path: quote_path %}
        {% endfor %}
      {% endlist %}
    {% endcard %}
  {% endif %}
{% endsection %}
```

The component tags are `section`, `card`, `list`, `text`, `field`, `badge` and `media`. A `card` groups other
components under a required title, optional description and optional `neutral`, `positive`, `warning` or `critical`
tone. Scalar `path` values are JSON Pointers into the selected recorded input or output. A `field` also has a
`label`; `media` points to a recorded image, audio or video value. The template can read `value` (the selected side),
`input`, `output`, resolved `variables`, prompt `variants`, actual `model`, `inference_id`, execution `address` and UI
`locale`. Variable references in the inference YAML may read `$in`, `$out` and `$run.context`. An output may be absent
for a failed inference; input may be absent on runs recorded before input capture was added.

AQVEN returns a validated `DisplayDocument` with `version: 1`. Studio maps its nodes to local components styled
with the shadcn design system; templates cannot supply HTML, CSS classes, JavaScript or remote component names.
Lumen's revision template groups customer, product, decision, source passages, previous draft and review notes into
cards. Its output card shows `/reply/text` and every citation with its full quote. Studio lists any value fields that
the document does not cover under **Additional data**, so a tailored presentation still exposes the complete recorded
value. Lumen's illustration templates show an optional input photo and the generated output image in media cards.

For cases that need code, `display.input` or `display.output` may still use `run: "@root/path.py:function"` instead
of `template`. The synchronous function receives `(value, context)` and returns a `DisplayDocument`. AQVEN validates
the result, but project Python is trusted and is not sandboxed.

Historical runs use their compiled inference declaration and recorded data, but load the **current** template or
Python formatter source. If it changes, the appearance of an older run can change. Raw continues to show the
recorded value exactly as it was stored.

## 6. Designing scenario tests

A scenario test runs one path through a flow offline and asserts the outcome. The pytest plugin ships the fixtures:
`aqven_project` (the compiled project), `aqven_engine` (a local engine), `cassette_config` (cassettes next to the
test) and `scripted_human` (answers for human steps).

```python
from aqven.testing import node_output, offline_options


def test_refund_path(aqven_project, aqven_engine, cassette_config):
    flow = aqven_project.flow_typed("support_case", CaseRequest, CaseOutcome)
    options = offline_options(
        cassettes=cassette_config,
        outputs=[node_output("classify", {"category": "refund", "rationale": "asks for money back"})],
    )

    result = asyncio.run(flow.run(CaseRequest(text="the parcel never arrived"), options))

    assert result.status == "completed", result.error
    assert result.output.decision == "refund"
```

`aqven_engine` configures a local engine for the test and shuts it down afterwards; `aqven_engine.models({...})`
replaces one model with a `FunctionModel` when a scenario needs a scripted answer instead of a cassette.

Principles:

- **Force the branch, do not hope for it.** `node_output(node_id, output)` replaces the output of one node;
  `node_failure(node_id, message)` forces its failure path; `branch_key`, `iteration` and `item_index` address one
  branch of a `parallel`, one pass of a `loop` or one element of a `map`. A test that depends on a model choosing a
  category is a test that fails on a bad day for reasons that have nothing to do with your change.
- **One scenario, one question.** Name the test after the path it pins (`test_denied_approval_keeps_the_case_open`),
  and assert the decision and the shape, not the wording of a generated sentence.
- **Cassettes prove the model contract, nothing else.** Record a live run (`AQVEN_LIVE=1`) for the one scenario that
  must show real model behaviour, and replay it in `replay_strict` everywhere else. Recorded answers are data, not
  control flow: if the branch matters, force it with an override as well.
- **Offline means offline.** `ALLOW_MODEL_REQUESTS=False` plus `FunctionModel` or a cassette; no provider key is
  needed, and a test that tries to reach the network fails loudly.
- **Assert the failure paths too.** A timeout, a denied approval, a rejected output: these are the paths a live run
  never shows you.

## 7. Reading `aqven check`

A diagnostic is a code, a file with a path inside it, a message and often a hint that names the fix. Errors (`E_`)
make the exit code 1; warnings (`W_`) do not, but each of them means something is unclear and will surprise someone.

| Code | Usually means |
|---|---|
| `E_REF_MISSING`, `E_REF_SCOPE` | a binding points at something that does not exist or is not visible there |
| `E_BINDING_TYPE`, `E_TYPE_UNKNOWN` | the value does not fit the declared type |
| `E_INPUT_UNBOUND`, `E_INPUT_UNKNOWN` | the node contract and its bindings disagree |
| `E_PROMPT_VARIABLE_UNDECLARED`, `E_PROMPT_INPUT_UNUSED` | the prompt and the inference contract disagree |
| `E_PROMPT_OUTPUT_FORMAT` | `{{ output_format }}` is missing or written twice |
| `E_CODE_SIGNATURE_MISMATCH` | the Python function does not match the declared `in`/`out` |
| `E_OUTPUT_UNBOUNDED` | an output field has no upper bound |
| `E_SWITCH_NOT_EXHAUSTIVE` | a branch value is not covered |
| `E_OUTPUT_MODE_UNSUPPORTED`, `E_STRICT_UNSUPPORTED` | the model cannot do what the agent asks for |
| `W_OUTPUT_MODE_RESOLVED` | `auto` picked a mode; pin it if that matters |
| `W_GENERATED_STALE` | `types.py` was hand-edited or is out of date |

The simulated run adds its own codes: `E_SIM_PROMPT_RENDER` (the prompt does not render with the simulated data),
`E_SIM_OUTPUT_INVALID` (a node returned something its own schema rejects), `E_SIM_NODE_FAILED` and `E_SIM_RUN_FAILED`
(the simulated run stopped), `W_SIM_NODE_UNREACHED` (no simulated input reaches that node — usually a condition that
can never be true). Their hints carry the simulated flow input, so the failure is reproducible with `aqven run`.

Use `aqven check --static` for the fast loop while editing and the full `aqven check` before you finish. In a
generated project both are wired into Claude Code hooks (`.claude/settings.json`): the static check after every file
edit, the full check when the agent stops.

## 8. Checklist before you call a flow done

- [ ] `aqven check` has no errors, and every warning left is one you decided to keep.
- [ ] `aqven prompt preview` of every llm node you touched shows real data in every placeholder and the output mode
      you expect.
- [ ] Every output field has a bound; the prompt does not repeat the schema in prose.
- [ ] `aqven models check` agrees that the chosen model supports the chosen output mode.
- [ ] A scenario test pins each branch that matters, with node output overrides rather than model luck.
- [ ] The failure paths (rejected output, denied approval, timeout) have a test.
- [ ] No API key, no secret and no recorded personal data is in the repository.
