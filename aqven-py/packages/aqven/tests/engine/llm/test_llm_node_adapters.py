import asyncio

import pytest
from llm_harness import SCHEMA, FakeScope, agent, answer_inference, answer_node, field_ir, project
from pydantic import JsonValue, SecretStr
from pydantic_ai.messages import ImageUrl

from aqven.engine.llm import EnvironmentSecrets, LlmFailureCode, LlmNodeError, UrlMediaLoader
from aqven.engine.llm.prompts import media_values
from aqven.ir import CompiledInference
from aqven.spec import InferenceId, MediaValue, SecretRef

BLOB = "sha256-" + "a" * 64


def _media_inference() -> CompiledInference:
    return CompiledInference(
        inference_id=InferenceId("inspect"),
        description="photo inspection",
        input_fields=(field_ir("question", "Text"), field_ir("photos", "Image[]")),
        output_fields=(field_ir("verdict", "Text"),),
        input_schema=SCHEMA,
        output_schema=SCHEMA,
    )


def _photo(url: str | None) -> JsonValue:
    return {"$media": "image/png", "blob_id": BLOB, "size_bytes": 10, "name": "lamp.png", "url": url}


def _scope() -> FakeScope:
    compiled, flow = project(answer_node(), [agent()], [answer_inference()])
    return FakeScope(compiled, flow, {"question": "what is wrong with the lamp?", "product": None})


def test_media_inputs_become_user_content_parts() -> None:
    document: dict[str, JsonValue] = {
        "question": "what is wrong with the lamp?",
        "photos": [_photo("https://cdn.example/lamp.png")],
    }

    values = media_values(_media_inference(), document)
    content = asyncio.run(UrlMediaLoader().content(_scope(), values[0]))

    assert [value.blob_id for value in values] == [BLOB]
    assert isinstance(content, ImageUrl)
    assert content.url == "https://cdn.example/lamp.png"
    assert content.media_type == "image/png"


def test_media_without_url_is_reported_as_unavailable() -> None:
    media = MediaValue.model_validate(_photo(None))

    with pytest.raises(LlmNodeError) as raised:
        asyncio.run(UrlMediaLoader().content(_scope(), media))

    assert raised.value.code == LlmFailureCode.MEDIA_UNAVAILABLE


def test_environment_secrets_resolve_env_refs_only() -> None:
    secrets = EnvironmentSecrets({"CRM_TOKEN": "t0ken"})

    resolved = asyncio.run(secrets.secret(SecretRef("ref:env/CRM_TOKEN")))

    assert resolved == SecretStr("t0ken")
    with pytest.raises(LlmNodeError):
        asyncio.run(secrets.secret(SecretRef("ref:env/MISSING")))
