from dataclasses import dataclass
from datetime import UTC, date, datetime
from typing import Final

from llm_harness import answer_inference, field_ir
from pydantic import BaseModel, JsonValue

from aqven.engine.llm.prompts import PromptRenderer, PromptSource
from aqven.engine.llm.readable import (
    ReadableMapping,
    ReadableSequence,
    dynamic_text,
    readable_text,
    readable_value,
    readable_values,
)
from aqven.ir import TemplatePrompt
from aqven.runtime.address import JsonObject
from aqven.spec import DynamicValue, FieldSpec

SCHEMA_HASH: Final = "sha256-" + "a" * 64
BLOB: Final = "sha256-" + "b" * 64
INTAKE: Final[JsonObject] = {
    "value": {"return_reason": "defective", "asin": None, "units": 2},
    "fields": [
        {"name": "return_reason", "type": "Text", "description": "Return reason on Amazon"},
        {"name": "asin", "type": "Text?", "description": "ASIN of the item; null if absent"},
        {"name": "units", "type": "Int", "description": "Returned units"},
    ],
    "schema_hash": SCHEMA_HASH,
}
READABLE_INTAKE: Final = (
    "- return_reason (Return reason on Amazon): defective\n"
    "- asin (ASIN of the item; null if absent): null\n"
    "- units (Returned units): 2"
)
TEMPLATE: Final = (
    "Customer: {{ customer.customer_id }} ({{ customer.tier }})\n"
    "Customer record:\n{{ customer }}\n"
    "Intake:\n{{ intake_extra }}\n"
    "Policies:\n{{ policies }}\n"
    "{% for policy in policies %}- {{ policy.title }}\n{% endfor %}"
)
DOCUMENT: Final[JsonObject] = {
    "customer": {"customer_id": "cus_7k2m9p4q1x8z", "tier": "plus", "name": "Анна"},
    "intake_extra": INTAKE,
    "policies": [{"title": "Warranty credit", "limit": 20}, {"title": "Return window", "limit": 30}],
}
MEDIA: Final[JsonObject] = {
    "$media": "image/jpeg",
    "blob_id": BLOB,
    "size_bytes": 2048,
    "name": "lamp.jpg",
}


class NoValues(BaseModel):
    pass


@dataclass(frozen=True, slots=True)
class NoCode:
    def load(self, ref: str) -> object:
        raise LookupError(ref)


def test_record_renders_as_yaml_like_lines_in_declaration_order() -> None:
    value: JsonValue = {"customer_id": "cus_1", "tier": "plus", "name": "Anna"}

    assert readable_text(value) == "customer_id: cus_1\ntier: plus\nname: Anna"


def test_nested_record_and_list_are_indented_under_their_key() -> None:
    value: JsonValue = {"title": "Warranty", "address": {"city": "Berlin"}, "tags": ["a", "b"]}

    assert readable_text(value) == "title: Warranty\naddress:\n  city: Berlin\ntags:\n  - a\n  - b"


def test_list_of_records_renders_one_dash_item_per_record() -> None:
    value: JsonValue = [{"title": "A", "limit": 20}, {"title": "B", "limit": 30}]

    assert readable_text(value) == "- title: A\n  limit: 20\n- title: B\n  limit: 30"


def test_scalars_render_without_python_repr() -> None:
    assert readable_text(True) == "true"
    assert readable_text(None) == "null"
    assert readable_text(2) == "2"
    assert readable_text(0.5) == "0.5"
    assert readable_text([]) == "[]"
    assert readable_text({}) == "{}"


def test_date_and_date_time_render_as_iso_8601() -> None:
    assert readable_text(date(2026, 9, 17)) == "2026-09-17"
    assert readable_text(datetime(2026, 9, 17, 12, 30, tzinfo=UTC)) == "2026-09-17T12:30:00+00:00"
    assert readable_value(date(2026, 9, 17)) == "2026-09-17"


def test_media_renders_as_a_short_placeholder() -> None:
    assert readable_text(MEDIA) == "[image/jpeg lamp.jpg, 2048 bytes]"
    assert readable_text({**MEDIA, "name": None}) == "[image/jpeg, 2048 bytes]"


def test_dynamic_value_renders_one_readable_line_per_field() -> None:
    assert dynamic_text(DynamicValue.model_validate(INTAKE)) == READABLE_INTAKE
    assert readable_text(INTAKE) == READABLE_INTAKE


def test_field_spec_renders_its_declared_keys_and_skips_empty_constraints() -> None:
    spec: JsonValue = {"name": "reply", "type": "Text", "description": "Answer", "maxLength": 200, "enum": None}

    assert readable_text(spec) == "name: reply\ntype: Text\ndescription: Answer\nmaxLength: 200"


def test_wrapped_values_keep_field_access_and_iteration_for_the_template() -> None:
    values = readable_values(DOCUMENT)
    customer = values["customer"]
    policies = values["policies"]

    assert isinstance(customer, ReadableMapping)
    assert customer["tier"] == "plus"
    assert isinstance(policies, ReadableSequence)
    assert len(policies) == 2
    assert [str(item["title"]) for item in policies if isinstance(item, ReadableMapping)] == [
        "Warranty credit",
        "Return window",
    ]


def test_template_renders_records_dynamic_values_and_lists_as_readable_fields() -> None:
    inference = answer_inference(
        input_fields=(
            field_ir("customer", "Customer"),
            field_ir("intake_extra", "Dynamic"),
            field_ir("policies", "Policy[]"),
        ),
        prompt=TemplatePrompt(level=2, template=TEMPLATE),
    )
    source = PromptSource(inference=inference, values=NoValues(), document=DOCUMENT, output_format="")

    rendered = PromptRenderer(NoCode()).render(inference.prompt, source)

    assert rendered.messages[0].text == (
        "Customer: cus_7k2m9p4q1x8z (plus)\n"
        "Customer record:\n"
        "customer_id: cus_7k2m9p4q1x8z\n"
        "tier: plus\n"
        "name: Анна\n"
        f"Intake:\n{READABLE_INTAKE}\n"
        "Policies:\n"
        "- title: Warranty credit\n"
        "  limit: 20\n"
        "- title: Return window\n"
        "  limit: 30\n"
        "- Warranty credit\n"
        "- Return window"
    )


def test_dynamic_field_without_the_dynamic_shape_falls_back_to_a_record() -> None:
    inference = answer_inference(input_fields=(field_ir("intake_extra", "Dynamic"),))
    broken: JsonValue = {"value": {"a": 1}}

    values = readable_values({"intake_extra": broken})

    readable = values["intake_extra"]
    assert isinstance(readable, ReadableMapping)
    assert str(readable) == "value:\n  a: 1"
    assert inference.input_fields[0].name == "intake_extra"


def test_dynamic_value_without_a_record_renders_the_value_as_a_list() -> None:
    fields = (FieldSpec(name="note", type="Text", description="Note"),)
    dynamic = DynamicValue(value=["a", "b"], fields=fields, schema_hash=SCHEMA_HASH)

    assert dynamic_text(dynamic) == "- a\n- b"
