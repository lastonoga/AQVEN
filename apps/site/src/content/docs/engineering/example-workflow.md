---
title: Complete Starter Workflow
description: Read all the files for one small flow, from types to Python code.
---

This example answers a question in a requested tone. It has one deterministic preparation step and one model step. The files below form one project module named `my_workflow`; the generated Python `types.py` is created with `{{CLI_COMMAND}} generate .`.

```text
my_workflow/
  aqven.yaml
  agents/assistant.yaml
  types/records/question.yaml
  types/records/answer.yaml
  types/enums/tone.yaml
  flows/answer_question/flow.yaml
  flows/answer_question/nodes/prepare/prepare.node.yaml
  flows/answer_question/nodes/prepare/prepare.py
  flows/answer_question/nodes/reply/reply.node.yaml
  flows/answer_question/nodes/reply/reply.inference.yaml
  flows/answer_question/nodes/reply/reply.prompt.md
```

## Project and types

`aqven.yaml` identifies the Python package and provider. Supply the key through the environment; do not put it in source:

```yaml
apiVersion: "aqven/v1"
kind: "Project"
description: "Question answering workflows"
package: "my_workflow"
providers:
  - id: "openrouter"
    api_key: "ref:env/OPENROUTER_API_KEY"
    data_policy:
      allows_pii: false
      allows_sensitive: false
      retention: "unknown"
```

`types/records/question.yaml`:

```yaml
apiVersion: "aqven/v1"
kind: "Type"
type: "record"
description: "Question and requested tone"
fields:
  - name: "text"
    type: "Text"
    description: "Question text"
    maxLength: 2000
  - name: "tone"
    type: "Tone"
    description: "Requested tone"
```

`types/records/answer.yaml`:

```yaml
apiVersion: "aqven/v1"
kind: "Type"
type: "record"
description: "Answer to a question"
fields:
  - name: "reply"
    type: "Text"
    description: "Answer text"
    maxLength: 2000
  - name: "tone"
    type: "Tone"
    description: "Tone used for the answer"
```

`types/enums/tone.yaml`:

```yaml
apiVersion: "aqven/v1"
kind: "Type"
type: "enum"
description: "Allowed answer tones"
values:
  - value: "friendly"
    description: "Warm and informal"
  - value: "formal"
    description: "Polite and businesslike"
```

## Flow and nodes

`flows/answer_question/flow.yaml`:

```yaml
apiVersion: "aqven/v1"
kind: "Flow"
description: "Clean a question and answer it in the requested tone"
input: "Question"
output: "Answer"
returns:
  - name: "reply"
    from: "$reply.out.reply"
  - name: "tone"
    from: "$input.tone"
order:
  - "prepare"
  - "reply"
```

`flows/answer_question/nodes/prepare/prepare.node.yaml`:

```yaml
apiVersion: "aqven/v1"
kind: "Node"
node: "code"
description: "Collapse repeated whitespace in the question"
run: "prepare"
in:
  - name: "text"
    type: "Text"
    description: "Question text as received"
    maxLength: 2000
    from: "$input.text"
out:
  - name: "text"
    type: "Text"
    description: "Question text with single spaces"
    maxLength: 2000
```

Its neighboring `prepare.py` implements the named function:

```python
from typing import Annotated

from pydantic import StringConstraints

from my_workflow.types import AnswerQuestionPrepareOut

def prepare(text: Annotated[str, StringConstraints(max_length=2000)]) -> AnswerQuestionPrepareOut:
    return AnswerQuestionPrepareOut(text=" ".join(text.split()))
```

`flows/answer_question/nodes/reply/reply.node.yaml`:

```yaml
apiVersion: "aqven/v1"
kind: "Node"
node: "llm"
description: "Answer the prepared question"
agent: "assistant"
in:
  - name: "text"
    from: "$prepare.out.text"
  - name: "tone"
    from: "$input.tone"
```

`flows/answer_question/nodes/reply/reply.inference.yaml`:

```yaml
apiVersion: "aqven/v1"
kind: "Inference"
description: "Short answer in the requested tone"
in:
  - name: "text"
    type: "Text"
    description: "Question"
    maxLength: 2000
  - name: "tone"
    type: "Tone"
    description: "Requested tone"
out:
  - name: "reply"
    type: "Text"
    description: "Answer in at most 120 words"
    maxLength: 2000
```

`flows/answer_question/nodes/reply/reply.prompt.md`:

```liquid
Answer the question in a {{ tone }} tone, in at most 120 words.
<question>{{ text }}</question>
{{ output_format }}
```

`agents/assistant.yaml`:

```yaml
apiVersion: "aqven/v1"
kind: "Agent"
description: "Answer questions briefly"
model: "openrouter:openai/gpt-oss-20b"
settings:
  temperature: 0.2
  max_tokens: 1000
output:
  strict: false
```

## Check and change it

Run the commands from `my_workflow/`, the directory with `aqven.yaml`:

```bash
uv run {{CLI_COMMAND}} generate .
uv run {{CLI_COMMAND}} check .
uv run {{CLI_COMMAND}} prompt preview answer_question.reply --project .
uv run {{CLI_COMMAND}} dev .
```

If you add an output field to the inference, update the `Answer` type and flow `returns` only when callers should receive it. If you change the agent's model, the flow wiring stays the same, but cost, latency, and answer quality may change. Measure that change on a dataset. [Flows](/engineering/flows/) explains wiring variations; [Studio](/studio/workflow-tour/) shows how to inspect a run.
