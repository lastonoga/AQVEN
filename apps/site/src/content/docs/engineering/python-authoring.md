---
title: Python Authoring
description: Define flows and inferences in Python when types and functions are the clearest source.
---

AQVEN accepts either YAML or a Python builder for a flow or inference. Choose Python when the contract already lives in Pydantic models or when a code node's typed function should define its ports. The project still needs `aqven.yaml`, agents, and any referenced prompts or tools. Studio and `check` read the built result the same way they read YAML.

## Build a flow in Python

Create `flows/answer_question/flow.py` instead of `flow.yaml`. Its `build()` must return `aqven.spec.Flow`:

```python
from {{PYTHON_MODULE}}.spec import Flow, flow, llm
from my_workflow.types import Answer, Question


def build() -> Flow:
    reply = llm(
        "reply",
        inference="reply",
        agent="assistant",
        bind={"text": "$input.text", "tone": "$input.tone"},
        description="Answer the question",
    )
    return flow(
        description="Answer a question in the requested tone",
        input=Question,
        output=Answer,
        returns={"reply": "$reply.out.reply", "tone": "$input.tone"},
        nodes=[reply],
    )
```

`nodes` determines the top-level execution order. `returns` must name every field of `Answer`; `bind` must name every input of the referenced inference. The `reply` inference and `assistant` agent are still separate project entities. Run `uv run {{CLI_COMMAND}} check .` after changing a builder: AQVEN calls `build()` during checking and reports builder failures with the Python file path.

## Derive a code node from a function

The `code()` helper reads typed parameters and a Pydantic return model. Put the function in an importable project module, such as `my_workflow/logic.py`:

```python
from typing import Annotated

from pydantic import BaseModel, Field


class Cleaned(BaseModel):
    text: str = Field(description="Question without surrounding spaces", max_length=2000)


def clean(text: Annotated[str, Field(description="Question to clean", max_length=2000)]) -> Cleaned:
    return Cleaned(text=text.strip())
```

Then add the node before `reply` in `flow.py`:

```python
from {{PYTHON_MODULE}}.spec import code
from my_workflow.logic import clean

prepare = code(
    "prepare",
    clean,
    bind={"text": "$input.text"},
    description="Clean the question",
)
reply = llm(
    "reply",
    inference="reply",
    agent="assistant",
    bind={"text": "$prepare.out.text", "tone": "$input.tone"},
    description="Answer the cleaned question",
)
# In flow(...): nodes=[prepare, reply]
```

Changing the function parameter list changes the node input contract. Changing `Cleaned` changes its output contract and any downstream `$prepare.out.*` reference. `code()` requires descriptions for each parameter and returned field; a return type without a Pydantic model is rejected. The helper `tool()` adds a node for an already declared tool. These helpers build the same node specs as the [YAML node guide](/engineering/nodes/); control nodes currently use YAML.

## Build an inference in Python

Create `flows/answer_question/nodes/reply/reply.inference.py` instead of `reply.inference.yaml`:

```python
from {{PYTHON_MODULE}}.spec import In, Inference, InferenceSpec, Out, inference_spec
from my_workflow.types import Tone


class Reply(Inference):
    text: str = In(description="Question to answer", max_length=2000)
    tone: Tone = In(description="Requested tone")
    reply: str = Out(description="Answer in at most 120 words", max_length=2000)


def build() -> InferenceSpec:
    return inference_spec(
        Reply,
        description="Answer a question in the requested tone",
        prompt="reply.prompt.md",
    )
```

`In()` and `Out()` mark the direction of each field. The builder derives type names and constraints from annotations. A field without either marker fails checking. The prompt can instead name a Python renderer; [Prompts](/engineering/prompts/) covers that path.

## Choose one source per entity

Do not keep `flow.yaml` beside `flow.py` for the same flow, or `.inference.yaml` beside `.inference.py` for the same inference. AQVEN reports a source conflict. Python builders are executed at load/check time, so keep `build()` deterministic and free of network calls and side effects. Use a code node or tool for runtime work. The [Python API reference](/engineering/reference/python-api/) covers the public runtime API; `aqven.spec` supplies the authoring helpers shown here.
