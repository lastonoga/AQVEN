---
title: Authoring Modes
description: Define an AQVEN project in YAML, Python, or both without creating two sources of truth.
---

AQVEN compiles a project before it runs it. YAML is the normal place to declare a project, types, flows, nodes, agents, tools, datasets, and evaluations. Python provides the implementation behind code references and can also build selected definitions. Both routes must describe the same project contract.

## Start with YAML

Use YAML when the definition should be easy to inspect, review, validate, and open in Studio. A flow, node, type, agent, or tool has a source file with an `apiVersion` and `kind`. The checker loads those files, validates their Pydantic models, resolves references, and compiles them together.

```yaml
apiVersion: "aqven/v1"
kind: "Node"
node: "code"
description: "Normalize incoming text"
run: "@root/code/text.py:normalize"
in:
  - name: "question"
    type: "Text"
    from: "$input.question"
out:
  - name: "question"
    type: "Text"
    description: "Normalized question"
```

Use [Project Layout](/engineering/project-layout/) to place the file and [the generated Node reference](/engineering/reference/nodes/) for the complete contract.

## Use Python for behavior

Python is the right home for deterministic transformations, domain integrations, custom providers, custom policy functions, evaluators, and display formatters. A YAML reference tells AQVEN which callable to load.

```python
def normalize(question: str) -> str:
    return " ".join(question.split())
```

The function signature is part of the contract. AQVEN checks it against the node, tool, policy, or formatter definition that refers to it. Keep the YAML declaration and Python behavior close together so a reviewer can read the entire boundary.

## Generated code is output

`uv run {{CLI_COMMAND}} generate .` creates `types.py` from the YAML type definitions. Import generated models from Python, but never edit the generated file. Change the YAML source and regenerate instead.

```bash
uv run {{CLI_COMMAND}} generate .
uv run {{CLI_COMMAND}} check .
```

The second command catches a stale generated file, invalid references, type mismatches, and simulated execution problems.

## Choose one owner for each concern

| Concern | Source of truth |
| --- | --- |
| Type shape and constraints | Type YAML |
| Flow order, bindings, limits, and return value | Flow and node YAML |
| Prompt text and variants | Markdown prompt files |
| Deterministic behavior and integrations | Python |
| Provider connection | Project and provider YAML, plus environment secrets |
| Runtime status and traces | AQVEN local data, viewed through Studio or the API |

Do not duplicate a type in YAML and handwritten Python. Do not put provider keys into YAML. Do not use Studio as an alternative project source: Studio reads and operates the project that YAML and Python define.

## Python builders

AQVEN also exposes a Python authoring API for projects that need programmatic construction. It produces the same compiled representation used by YAML authoring. Use it when a definition truly must be composed in Python; retain YAML for contracts that engineers need to review as project files. The generated [Python authoring API](/engineering/reference/authoring-api/) is the exact source for its signatures.
