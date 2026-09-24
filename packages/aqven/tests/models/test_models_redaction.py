import asyncio
import warnings
from collections.abc import Iterator
from typing import Final

import pytest
from models_support import ScriptedModel, text_script
from pydantic import BaseModel, ValidationError
from pydantic_ai.messages import ModelMessage, ModelMessagesTypeAdapter, ModelRequest, RetryPromptPart
from pydantic_ai.models import ModelRequestParameters
from pydantic_core import ErrorDetails

from aqven.models import (
    CallPolicy,
    CassettePolicy,
    MemoryCassetteStore,
    PatternRedactor,
    RedactionPolicy,
    canonical_request,
    guard_model,
)
from aqven.models.cassette import CASSETTE_BEHAVIORS
from aqven.models.redaction import redact_messages
from aqven.runtime import CassetteMode

MODEL_REF: Final = "openrouter:openai/gpt-5-nano"
BROKEN_JSON: Final = '{"answer": "mail bob@example.com'
MISSING_SCORE: Final = '{"answer": "mail bob@example.com"}'
REDACTOR: Final = PatternRedactor(["email"])


class Verdict(BaseModel):
    answer: str
    score: int


def validation_errors(raw: str) -> list[ErrorDetails]:
    try:
        Verdict.model_validate_json(raw)
    except ValidationError as error:
        return error.errors(include_url=False)
    raise AssertionError(raw)


def retry_history() -> list[ModelMessage]:
    errors = [*validation_errors(BROKEN_JSON), *validation_errors(MISSING_SCORE)]
    return [ModelRequest(parts=[RetryPromptPart(content=errors)])]


def retry_part(messages: list[ModelMessage]) -> RetryPromptPart:
    request = messages[0]
    assert isinstance(request, ModelRequest)
    part = request.parts[0]
    assert isinstance(part, RetryPromptPart)
    return part


@pytest.fixture
def strict_serializer() -> Iterator[None]:
    with warnings.catch_warnings():
        warnings.simplefilter("error")
        yield


def test_the_retry_prompt_carries_the_json_invalid_and_missing_field_errors() -> None:
    content = retry_part(retry_history()).content

    assert not isinstance(content, str)
    assert [(error["type"], error["loc"]) for error in content] == [("json_invalid", ()), ("missing", ("score",))]


@pytest.mark.usefixtures("strict_serializer")
def test_a_redacted_retry_prompt_keeps_its_error_locations_as_tuples() -> None:
    redacted = redact_messages(retry_history(), REDACTOR)
    content = retry_part(redacted).content

    assert not isinstance(content, str)
    assert [error["loc"] for error in content] == [(), ("score",)]
    assert "bob@example.com" not in str(content)
    assert "<EMAIL>" in str(content)
    ModelMessagesTypeAdapter.dump_python(redacted, mode="json")
    canonical_request(MODEL_REF, redacted, None, ModelRequestParameters())
    assert "json_invalid" in retry_part(redacted).model_response()


@pytest.mark.usefixtures("strict_serializer")
def test_the_guarded_chain_sends_a_redacted_retry_prompt_without_serializer_warnings() -> None:
    inner = ScriptedModel([text_script("done")])
    redaction = RedactionPolicy(redactor=REDACTOR)
    call_policy = CallPolicy(
        cassettes=CassettePolicy(store=MemoryCassetteStore(), behavior=CASSETTE_BEHAVIORS[CassetteMode.RECORD]),
        redaction=redaction,
    )
    guarded = guard_model(inner, model_ref=MODEL_REF, policy=call_policy)

    asyncio.run(guarded.request(retry_history(), None, ModelRequestParameters()))
    wire = retry_part(inner.seen[0])

    assert "<EMAIL>" in str(wire.content)
    assert "bob@example.com" not in str(wire.content)
    assert "Field required" in wire.model_response()
