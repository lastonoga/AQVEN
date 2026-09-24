from typing import Final

from llm_harness import FakeScope, agent, answer_inference, answer_node, field_ir, project
from pydantic import BaseModel, ConfigDict, JsonValue, SecretStr
from pydantic_ai import BinaryImage

from aqven.engine.assembly import ProjectModelFactories
from aqven.engine.llm.agents import call_media, media_modalities, with_unbound_optionals
from aqven.engine.llm.dynamic import DynamicForms, DynamicShaper, dynamic_forms, schema_hash
from aqven.engine.llm.output import output_plan
from aqven.ir import AgentModel, CompiledProject, DynamicOutput
from aqven.ports.execution import ExecutionScope
from aqven.runtime import CallMedia, CapabilityRoute, ModelCall, ModelProfile, ModelRoute
from aqven.spec import DynamicLimits, FieldSpec, Image, Modality, ModelString, ProviderName, TypeId
from aqven.testing import media_value

IMAGE_ROUTE: Final = ModelRoute(model="openrouter:google/gemini-3.1-flash-lite-image")
VISION_ROUTE: Final = ModelRoute(model="openrouter:google/gemini-2.5-flash-lite", zdr=False)
TEXT_ROUTE: Final = ModelRoute(model="openrouter:mistralai/mistral-nemo")
UNLISTED_MODEL: Final = "openrouter:acme/sketch-9"
IMAGE_ONLY: Final = frozenset({Modality.IMAGE})
TEXT_ONLY: Final = frozenset({Modality.TEXT})
PROJECT: Final = CompiledProject(package="shop", description="project")
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
    model = AgentModel(model=ModelString(UNLISTED_MODEL), provider=ProviderName("openrouter"))
    return ModelCall(model=model, uses_tools=uses_tools, media=CallMedia(input=media, output=output))


def test_model_profile_routes_by_the_call_media_and_declared_model() -> None:
    profile = ModelProfile(
        name="cheap",
        routes=(
            CapabilityRoute(output=frozenset({Modality.IMAGE}), route=IMAGE_ROUTE),
            CapabilityRoute(media=frozenset({Modality.IMAGE}), route=VISION_ROUTE),
            CapabilityRoute(models=frozenset({"openrouter:x-ai/grok-4.6"}), route=VISION_ROUTE),
            CapabilityRoute(route=TEXT_ROUTE),
        ),
    )

    painter = profile.route(model_call(IMAGE_ONLY, frozenset()))
    seeing = profile.route(model_call(TEXT_ONLY, IMAGE_ONLY))
    text = profile.route(model_call(TEXT_ONLY, frozenset()))

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


def test_the_call_asks_for_an_image_only_when_the_node_outputs_one() -> None:
    photo = media_value(b"png", "image/png", "photo.png")

    painting = call_media((), output_plan("prompted", Illustration))
    reading = call_media((photo,), output_plan("tool", Intake))

    assert painting == CallMedia(input=frozenset(), output=IMAGE_ONLY)
    assert reading == CallMedia(input=IMAGE_ONLY, output=TEXT_ONLY)


def test_an_image_output_call_requests_image_generation_from_a_model_outside_any_table() -> None:
    factories = ProjectModelFactories()
    key = SecretStr("k")

    painter = factories.factory(PROJECT, None, model_call(IMAGE_ONLY, frozenset())).build(
        UNLISTED_MODEL, settings=None, api_key=key
    )
    writer = factories.factory(PROJECT, None, model_call(TEXT_ONLY, frozenset())).build(
        UNLISTED_MODEL, settings=None, api_key=key
    )

    assert painter.profile.get("supports_image_output") is True
    assert (painter.settings or {}).get("extra_body") == {"modalities": ["image", "text"]}
    assert writer.profile.get("supports_image_output") is False
    assert (writer.settings or {}).get("extra_body") is None


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
