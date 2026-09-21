---
title: How to write a step in Python
description: Add a code node that runs a plain Python function, with typed parameters in and a typed record out.
---

# How to write a step in Python

## When you need this

Use a `code` node whenever a step is deterministic logic you'd rather write than prompt for: parsing
and normalizing a request, looking up values from a fixed table, shaping data for the next node. It
runs your own synchronous Python function, not a model call. If the step needs to call an external
service or do anything asynchronous, that's a `tool` node instead — a `code` node's function is never
`async`.

## Steps

- Create a folder for the node and give the node file and the Python file the same stem, so AQVEN
  links them by filename alone — write `run: "<function_name>"` in the node YAML and AQVEN looks for
  that function inside the `.py` file next to it. (`run` also accepts an explicit `module:function`
  reference to a function anywhere else in the project, but the filename convention above is what
  you'll use day to day.)
- Write `<stem>.node.yaml`: `node: "code"`, a `description`, `run` (the function name), `in` — the
  fields your function takes, each with a `name`, a `type`, a `description`, and a source (`from` a
  reference, or a literal `value`) — and `out` — the fields your function returns, each with a `name`,
  a `type`, and a `description`. Unlike an `llm` node, a `code` node has no separate inference file:
  the typed contract lives on the node itself.
- Write the function. Its parameters must match the `in` fields one for one, same names, same order.
  Its return value is a single record built from all the `out` fields together — AQVEN generates that
  record type for you from the node's `out` list, so you import it rather than define it. Run
  `{{CLI_COMMAND}} generate` (or `{{CLI_COMMAND}} check`, which does this too) any time you change
  `in` or `out` to regenerate that type.

### Example

This is the showcase project's `prepare` node, the first step in its `support_case` flow — it runs
before the flow ever calls a model. Create it yourself with:

```bash
{{CLI_COMMAND}} new my_project --template showcase
```

Its files live at `flows/support_case/nodes/prepare/`. `prepare.node.yaml` declares one input field,
taken straight from the flow's whole input, and five output fields:

```yaml
apiVersion: "aqven/v1"
kind: "Node"
node: "code"
description: "Normalizes the request text and derives the channel, the category's observation signals, the marketplace's intake fields, and the voting perspectives"
run: "prepare"
in:
  - name: "request"
    type: "CaseRequest"
    description: "The customer's request as a whole"
    from: "$input"
out:
  - name: "message"
    type: "Text"
    description: "The request text with whitespace normalized"
    maxLength: 4000
  - name: "channel"
    type: "Channel"
    description: "The channel the request came in on"
  - name: "signals"
    type: "SignalDef[]"
    description: "The observation signals allowed for the product's category"
    maxItems: 20
  - name: "intake_fields"
    type: "FieldSpec[]"
    description: "The intake fields the marketplace requires"
    maxItems: 10
  - name: "perspectives"
    type: "VotePerspective[]"
    description: "The independent voting perspectives for intent"
    maxItems: 3
```

`prepare.py` defines the function `prepare`, matching the file's own stem, the `run` value, and the
one `in` field name and order. It imports `SupportCasePrepareOut` — the record AQVEN generated from
the `out` list above — as its return type. The source project stores the signal labels and field
descriptions below in Russian, for a Russian-market storefront; they're translated to English here:

```python
from collections.abc import Mapping
from typing import Final

from aqven.spec import FieldSpec
from __package__.types import (
    CaseOriginMarketplace,
    CaseRequest,
    Channel,
    ProductCategory,
    SignalDef,
    SignalKey,
    SupportCasePrepareOut,
    VotePerspective,
)

MESSAGE_LIMIT: Final = 4000
PERSPECTIVES: Final[tuple[VotePerspective, ...]] = ("words", "evidence", "risk")

SIGNAL_LABELS: Final[Mapping[str, str]] = {
    "no_power": "Won't turn on",
    "flicker": "Flickers",
    "dead_segment": "A section of the strip is dark",
    "overheating": "Overheats",
    "burning_smell": "Smells like it's burning",
    "app_offline": "Not responding in the app",
    "cracked_shade": "Shade is cracked",
    "package_damaged": "Packaging is damaged",
    "missing_part": "A part is missing",
    "usage_question": "Question about using it",
}

LAMP_SIGNALS: Final = frozenset(SIGNAL_LABELS) - {"dead_segment", "app_offline"}

CATEGORY_SIGNALS: Final[Mapping[ProductCategory, frozenset[str]]] = {
    "desk_lamp": LAMP_SIGNALS,
    "floor_lamp": LAMP_SIGNALS,
    "smart_bulb": frozenset(
        {"no_power", "flicker", "overheating", "burning_smell", "app_offline", "package_damaged", "usage_question"}
    ),
    "light_strip": frozenset(SIGNAL_LABELS) - {"cracked_shade"},
    "accessory": frozenset({"no_power", "package_damaged", "missing_part", "usage_question"}),
}

INTAKE_FIELDS: Final[Mapping[Channel, tuple[FieldSpec, ...]]] = {
    "storefront": (),
    "amazon": (
        FieldSpec(
            name="return_reason",
            type="Text",
            description="The return reason the customer picked on Amazon",
            maxLength=20,
            enum=["defective", "damaged", "not_as_described"],
        ),
        FieldSpec(
            name="asin",
            type="Text?",
            description="The product's ASIN on Amazon; null if the request doesn't have one",
            maxLength=10,
            pattern=r"^B0[A-Z0-9]{8}$",
        ),
    ),
    "ozon": (
        FieldSpec(name="posting_number", type="Text", description="The Ozon shipment number", maxLength=40),
        FieldSpec(
            name="claim_type",
            type="Text",
            description="The claim type the customer picked on Ozon",
            maxLength=10,
            enum=["defect", "damage", "missing"],
        ),
    ),
}


def prepare(request: CaseRequest) -> SupportCasePrepareOut:
    origin = request.origin
    channel: Channel = origin.marketplace if isinstance(origin, CaseOriginMarketplace) else "storefront"
    keys = CATEGORY_SIGNALS[request.product.category] if request.product is not None else frozenset(SIGNAL_LABELS)
    return SupportCasePrepareOut(
        message=" ".join(request.message.split())[:MESSAGE_LIMIT],
        channel=channel,
        signals=[SignalDef(key=SignalKey(key), label=label) for key, label in SIGNAL_LABELS.items() if key in keys],
        intake_fields=list(INTAKE_FIELDS[channel]),
        perspectives=list(PERSPECTIVES),
    )
```

The lookup tables above (`SIGNAL_LABELS`, `CATEGORY_SIGNALS`, `INTAKE_FIELDS`, `PERSPECTIVES`) are
plain Python, nothing AQVEN-specific. What matters for the node's contract is the signature: one
parameter, `request`, typed `CaseRequest`, matching the single `in` field by name; one return value,
typed `SupportCasePrepareOut`, built from all five `out` fields at once. If the node had declared more
`in` fields, `prepare` would take more parameters — one per field, same names, same order — instead of
one bundled input record; only the output side is bundled into a single typed record.

## See also

- [How to call a model](/engine/llm-node/) — the node kind for the step right after this one, once
  the request is normalized.
- [The engineering loop](/concepts/engineering-loop/) — what to do when a run's output isn't what you
  expected.
- [Node specifications](/reference/nodes/) — every field on `CodeNodeSpec`, generated from the code.
