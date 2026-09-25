# How to customize a node's display in Studio

Replace the raw JSON Studio shows for a node's input or output with a template built from sections, cards, fields, badges, lists and media.

## Contents

- [When you need this](#when-you-need-this)
- [Steps](#steps)
  - [Example](#example)
- [Under the hood](#under-the-hood)
- [See also](#see-also)

## When you need this

By default, Studio's run inspector shows a node's input and output as raw JSON. For an `llm` node
whose input or output is long, nested, or has fields a reviewer actually cares about — a customer
record, a set of citations, a generated image — that raw view is slower to read than it needs to be.
A display template replaces it with a small structured layout instead.

## Steps

- Write a `.display.liquid` file: one for the node's input, one for its output, or both. Name them
  anything that ends in `.display.liquid` — convention is `<stem>.input.display.liquid` and
  `<stem>.output.display.liquid`, next to the node's `.inference.yaml`.
- Wire each file in explicitly. Unlike the prompt file, a display template is never picked up by
  filename alone — add a `display` block to the `.inference.yaml`:

  ```yaml
  display:
    input:
      template: "illustrate.input.display.liquid"
    output:
      template: "illustrate.output.display.liquid"
  ```

  A path starting with `@root/` is relative to the project root instead of the node's own folder,
  for a template shared across nodes.
- Build the layout from seven elements, used as Liquid tags. Three take children and three of those
  need a matching `end` tag; the rest are leaves:

  | Tag | Takes children | Key attributes |
  |---|---|---|
  | `section` | yes, `{% endsection %}` | `title` (optional) |
  | `card` | yes, `{% endcard %}` | `title` (required), `description` (optional), `tone` |
  | `list` | yes, `{% endlist %}` | `title` (optional) |
  | `field` | no | `label` (required), `value` or `path`, `tone` |
  | `text` | no | `value` or `path`, `tone` |
  | `badge` | no | `value` or `path`, `tone` |
  | `media` | no | `path` (required), `alt` (optional) |

  `tone` is one of `neutral`, `positive`, `warning`, `critical`, available on `card`, `field`, `text`
  and `badge`.
- The whole template must produce **exactly one root `section`** — nothing before it, nothing after,
  and no loose text anywhere in the template. `{% if %}`, `{% unless %}`, and `{% for %}` around your
  tags are fine; a bare `{{ variable }}` printed outside of a tag's arguments is not. Nest a `section`
  inside a `list` or `card` freely — the one-root-section rule only applies at the top level.
- Point `field`, `text`, `badge` and `media` at the data with `path`, a JSON Pointer into the node's
  input or output (`/customer/tier`, `/reply/citations/0/quote`). Use `value` instead of `path` when
  you want a literal or a Liquid-computed string; the two are mutually exclusive on the same tag.
  Build a path for a list item inside a `{% for %}` loop with `{% assign %}` and the `append` filter,
  since `path` takes a plain string, not an expression.
- Pull in data the node's own input or output doesn't have — another field, or something from the
  run's context — with `variables` next to `template`:

  ```yaml
  display:
    output:
      template: "revise.output.display.liquid"
      variables:
        locale: "$in.locale"
  ```

  Each value is a reference starting with `$in`, `$out`, or `$run.context`; inside the template it's
  available as `variables.locale`.
- For logic a template can't express, set `run` instead of `template` on either `input` or `output` —
  exactly one of the two is required, never both. `run` names a synchronous Python function with the
  signature `(value, context)`, resolved the same way a level-3 prompt function is.
- `aqven check` parses every display template and rejects one that fails to parse, is
  missing, breaks the one-root-section rule, or has a `variables` entry that doesn't resolve — before
  it reaches a teammate or a release.

### Example

This is the real `illustrate` node from the showcase project. Create it
yourself with:

```bash
aqven new my_project --template showcase
```

`flows/support_case/nodes/illustrate/illustrate.inference.yaml` wires both sides:

```yaml
display:
  input:
    template: "illustrate.input.display.liquid"
  output:
    template: "illustrate.output.display.liquid"
```

`illustrate.input.display.liquid` shows the brief the model worked from, with the reference photo
card only when one was attached:

```
{% section title: "Illustration brief" %}
  {% card title: "Image brief", description: "Complete prompt and product context" %}
    {% field label: "Product category", path: "/category" %}
    {% text path: "/text" %}
  {% endcard %}
  {% if value.photo %}
    {% card title: "Reference photo", description: "Customer-provided image" %}
      {% media path: "/photo", alt: "Customer photo" %}
    {% endcard %}
  {% endif %}
{% endsection %}
```

`illustrate.output.display.liquid` renders the generated image as a single card:

```
{% section title: "Generated illustration" %}
  {% card title: "Generated image", description: "Final image asset", tone: "positive" %}
    {% media path: "/image", alt: "Generated illustration" %}
  {% endcard %}
{% endsection %}
```

A richer example from the same project, `revise.input.display.liquid`, shows `badge`, nested
`section`s inside a `list`, and a path built from a loop index:

```
{% card title: "Customer and case", description: "Who is asking and what happened" %}
  {% badge path: "/customer/tier", tone: "positive" %}
  {% field label: "Customer", path: "/customer/display_name" %}
{% endcard %}

{% card title: "Knowledge evidence", description: "Full retrieved passages and their identifiers" %}
  {% list title: "Sources" %}
    {% for chunk in value.chunks %}
      {% assign chunk_text_path = "/chunks/" | append: forloop.index0 | append: "/text" %}
      {% section title: chunk.title %}
        {% text path: chunk_text_path %}
      {% endsection %}
    {% endfor %}
  {% endlist %}
{% endcard %}
```

## Under the hood

Display templates render on python-liquid, the same engine
prompt templates use. AQVEN adds the seven typed tags above and removes everything that would let a
template print raw text: no `{{ output }}` statements, no literal text outside a tag's arguments. A
template only ever builds a tree of the seven elements — it can't emit anything else.

Studio's run inspector renders output display templates live from a real run's recorded data. There's
also a preview endpoint that renders one against the inference's `examples` (or generated sample data
if it has none) without a run — REST-only, not exposed as an MCP tool or a CLI command the way
`aqven prompt preview` is for prompts.

## See also

- [How to write a prompt](prompts.md) — the sibling file-naming and Liquid-template pattern for
  a node's prompt, on the same `.inference.yaml`.
- Investigate a run — where a node's display template actually shows up:
  the input/output panels in the run inspector.
- [How to call a model](llm-node.md) — the node kind `display` attaches to.
- [Inference specifications](../reference/inference.md) — every field on the inference spec, including
  `display`.
