---
title: Prompt Variants and Fragments
description: Reuse stable rules and change only the text a case needs.
---

Use a fragment for instructions shared across prompts, such as citation rules or brand voice:

```liquid
{% include "fragments/brand_voice" %}
{% include "fragments/citation_rules" %}
```

Use a variant when a small piece of wording depends on an input. An inference that writes a product answer can select guidance by `product.kind`:

```yaml
variants:
  product_guide:
    on: "product.lamp_kind"
    cases:
      physical: "physical"
      digital: "digital"
    default: "general"
```

The prompt inserts it with `{{ variants.product_guide }}`. Variant files live beside the inference under `<inference>.variants/product_guide/`, for example `physical.md` and `general.md`. Changing the selected variant changes prompt text, not the workflow path; use [Switch](/engineering/switch/) when different nodes must run.

Preview a case before calling a model:

```bash
uv run {{CLI_COMMAND}} prompt preview answer_product.reply \
  --project . --variant product_guide=physical
```

The target is a flow and node ID. If you are unsure of a child ID, run `uv run {{CLI_COMMAND}} tree .` first. The generated [Inference reference](/engineering/reference/inference/) lists the exact `variants` shape.
