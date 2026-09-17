from dataclasses import dataclass
from typing import Final

from llm_harness import answer_inference, field_ir
from pydantic import BaseModel, JsonValue

from aqven.engine.llm.prompts import PromptRenderer, PromptSource
from aqven.engine.llm.template_values import ReadableMapping, dynamic_text, template_values
from aqven.ir import TemplatePrompt
from aqven.runtime.address import JsonObject
from aqven.spec import DynamicValue, FieldSpec

SCHEMA_HASH: Final = "sha256-" + "a" * 64
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
    "Customer record: {{ customer }}\n"
    "Intake:\n{{ intake_extra }}\n"
    "{% for policy in policies %}- {{ policy.title }}: {{ policy }}\n{% endfor %}"
)
DOCUMENT: Final[JsonObject] = {
    "customer": {"customer_id": "cus_7k2m9p4q1x8z", "tier": "plus", "name": "Анна"},
    "intake_extra": INTAKE,
    "policies": [{"title": "Warranty credit", "limit": 20}],
}


class NoValues(BaseModel):
    pass


@dataclass(frozen=True, slots=True)
class NoCode:
    def load(self, ref: str) -> object:
        raise LookupError(ref)


def test_dynamic_value_renders_one_readable_line_per_field() -> None:
    assert dynamic_text(DynamicValue.model_validate(INTAKE)) == READABLE_INTAKE


def test_template_renders_dynamic_fields_and_json_mappings_instead_of_python_repr() -> None:
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
        'Customer record: {"customer_id": "cus_7k2m9p4q1x8z", "tier": "plus", "name": "Анна"}\n'
        f"Intake:\n{READABLE_INTAKE}\n"
        '- Warranty credit: {"title": "Warranty credit", "limit": 20}'
    )


def test_dynamic_field_without_the_dynamic_shape_falls_back_to_json() -> None:
    inference = answer_inference(input_fields=(field_ir("intake_extra", "Dynamic"),))
    broken: JsonValue = {"value": {"a": 1}}

    values = template_values(inference, {"intake_extra": broken})

    readable = values["intake_extra"]
    assert isinstance(readable, ReadableMapping)
    assert str(readable) == '{"value": {"a": 1}}'


def test_dynamic_value_without_a_record_renders_the_value_as_json() -> None:
    fields = (FieldSpec(name="note", type="Text", description="Note"),)
    dynamic = DynamicValue(value=["a", "b"], fields=fields, schema_hash=SCHEMA_HASH)

    assert dynamic_text(dynamic) == '["a", "b"]'
