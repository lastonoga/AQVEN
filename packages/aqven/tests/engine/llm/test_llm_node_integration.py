from typing import Final

from llm_harness import FakeScope, agent, answer_inference, answer_node, capabilities, field_ir, project
from pydantic import BaseModel, ConfigDict, JsonValue
from pydantic_ai import BinaryImage

from aqven.engine.llm.agents import media_modalities, with_unbound_optionals
from aqven.engine.llm.dynamic import DynamicForms, DynamicShaper, dynamic_forms, schema_hash
from aqven.engine.llm.output import output_plan
from aqven.ir import AgentModel, DynamicOutput
from aqven.ports.execution import ExecutionScope
from aqven.runtime import CapabilityRoute, ModelCall, ModelProfile, ModelRoute
from aqven.spec import DynamicLimits, FieldSpec, Image, Modality, ModelString, ProviderName, TypeId
from aqven.testing import media_value

IMAGE_ROUTE: Final = ModelRoute(model="openrouter:google/gemini-3.1-flash-lite-image")
VISION_ROUTE: Final = ModelRoute(model="openrouter:google/gemini-2.5-flash-lite", zdr=False)
TEXT_ROUTE: Final = ModelRoute(model="openrouter:mistralai/mistral-nemo")
FORM: Final[JsonValue] = [
    {"name": "order_id", "type": "Text", "description": "Order number", "maxLength": 20},
    {"name": "urgent", "type": "Bool?", "description": "Is it urgent"},
]


class Illustration(BaseModel):
    model_config = ConfigDict(extra="forbid")
    image: Image


class Intake(BaseModel):
    model_config = ConfigDict(extra="forbid")
    summary: str
    intake: dict[str, JsonValue]


class BuiltinTypes:
    def annotation(self, scope: ExecutionScope, type_id: TypeId) -> object:
        return {"Text": str, "Bool": bool}[type_id]


def model_call(output: frozenset[Modality], media: frozenset[Modality], uses_tools: bool = False) -> ModelCall:
    base = capabilities()
    model = AgentModel(
        model=ModelString("openrouter:openai/gpt-5.4-image-2"),
        provider=ProviderName("openrouter"),
        capabilities=base.model_copy(update={"output": tuple(sorted(output))}),
    )
    return ModelCall(model=model, uses_tools=uses_tools, media=media)


def test_model_profile_routes_by_capability_media_and_declared_model() -> None:
    profile = ModelProfile(
        name="cheap",
        routes=(
            CapabilityRoute(output=frozenset({Modality.IMAGE}), route=IMAGE_ROUTE),
            CapabilityRoute(media=frozenset({Modality.IMAGE}), route=VISION_ROUTE),
            CapabilityRoute(models=frozenset({"openrouter:x-ai/grok-4.6"}), route=VISION_ROUTE),
            CapabilityRoute(route=TEXT_ROUTE),
        ),
    )

    painter = profile.route(model_call(frozenset({Modality.TEXT, Modality.IMAGE}), frozenset()))
    seeing = profile.route(model_call(frozenset({Modality.TEXT}), frozenset({Modality.IMAGE})))
    text = profile.route(model_call(frozenset({Modality.TEXT}), frozenset()))

    assert (painter, seeing, text) == (IMAGE_ROUTE, VISION_ROUTE, TEXT_ROUTE)


def test_unbound_optional_inputs_become_null_and_media_maps_to_modalities() -> None:
    inference = answer_inference()
    photo = media_value(b"png", "image/png", "photo.png")
    invoice = media_value(b"pdf", "application/pdf", "invoice.pdf")

    assert with_unbound_optionals(inference, {"question": "where is my order?"}) == {
        "product": None,
        "question": "where is my order?",
    }
    assert media_modalities((photo, invoice)) == frozenset({Modality.IMAGE, Modality.DOCUMENT})


def test_sole_image_output_is_requested_as_binary_image() -> None:
    plan = output_plan("prompted", Illustration)

    assert plan.spec is BinaryImage
    assert plan.image_field == "image"


def test_dynamic_output_is_shaped_from_the_form_and_wrapped_with_its_hash() -> None:
    limits = DynamicLimits(max_fields=5, max_depth=1, max_text_length=100, max_items=3)
    inference = answer_inference(
        output_fields=(field_ir("summary", "Text"), field_ir("intake", "Dynamic")),
        dynamic_outputs=(DynamicOutput(name="intake", schema_from="$in.form", limits=limits),),
    )
    compiled, flow = project(answer_node(), [agent()], [inference])
    scope = FakeScope(compiled, flow, {"question": "q", "product": None})

    forms = dynamic_forms(inference, lambda ref: FORM)
    shaped = DynamicShaper(BuiltinTypes()).model(scope, Intake, forms)
    value = shaped.model_validate({"summary": "ok", "intake": {"order_id": "LUM-1", "urgent": None}})
    wrapped = forms.wrap(value.model_dump(mode="json"))

    fields = tuple(FieldSpec.model_validate(item) for item in FORM if isinstance(item, dict))
    assert set(shaped.model_json_schema()["properties"]["intake"]) != {"additionalProperties"}
    assert wrapped["intake"] == {
        "value": {"order_id": "LUM-1", "urgent": None},
        "fields": [field.model_dump(mode="json", by_alias=True, exclude_none=True) for field in fields],
        "schema_hash": schema_hash(fields),
    }
    assert DynamicForms({}).wrap({"summary": "ok"}) == {"summary": "ok"}
