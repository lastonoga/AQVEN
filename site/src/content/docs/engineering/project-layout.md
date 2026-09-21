---
title: Project Layout
description: Find the source of a flow, prompt, tool, and type.
---

An AQVEN project has one `aqven.yaml` at its module root. Definitions are source files; generated Python models are derived from them.

```text
my_workflow/
  aqven.yaml
  app.py
  agents/
  flows/
    answer_question/
      flow.yaml
      nodes/
        reply/
          reply.node.yaml
          reply.inference.yaml
          reply.prompt.md
  tools/
  types/
  evals/
  fragments/
  samples/
```

`flow.yaml` declares a flow's input, output, order, and return bindings. A `.node.yaml` declares one step. An LLM node can have a neighboring `.inference.yaml` and `.prompt.md`. `agents/` holds model choices; `types/` holds reusable schemas. `tools/` pairs tool contracts with Python implementations. `evals/` holds datasets and evaluations.

The CLI can answer “where is it defined?” without a file search:

```bash
uv run {{CLI_COMMAND}} tree .
uv run {{CLI_COMMAND}} refs inference:reply .
```

Keep Python host code in `app.py` or your application package. Do not edit generated `types.py`. [See the complete starter workflow](/engineering/example-workflow/) and the generated [Project reference](/engineering/reference/project/).
