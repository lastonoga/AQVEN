import hashlib
import json
from collections.abc import Sequence

from pydantic_ai.messages import ModelRequest, TextPart, UserPromptPart

from aqven.engine.llm.prompts import Conversation, RenderedParts
from aqven.runtime.address import JsonObject
from aqven.runtime.executions import PromptPart, PromptTrace, PromptTraceMessage
from aqven.runtime.vocabulary import PromptPartKind, PromptRole
from aqven.spec import MediaValue


def _text(role: PromptRole, content: str) -> PromptTraceMessage:
    return PromptTraceMessage(role=role, parts=(PromptPart(kind="text", text=content, media=None),))


def _media_part(value: MediaValue) -> PromptPart:
    major = value.media_type.partition("/")[0]
    kind: PromptPartKind = "document"
    if major == "image":
        kind = "image"
    elif major == "audio":
        kind = "audio"
    elif major == "video":
        kind = "video"
    return PromptPart(kind=kind, text=None, media=value)


def captured_prompt(
    rendered: RenderedParts,
    conversation: Conversation,
    instructions: str | None,
    media: Sequence[MediaValue],
    template: str | None,
    output_schema: JsonObject | None,
) -> PromptTrace:
    """Record the resolved messages AQVEN prepared for this inference call."""
    messages: list[PromptTraceMessage] = []
    if instructions:
        messages.append(_text("system", instructions))
    for item in conversation.history:
        if isinstance(item, ModelRequest):
            for part in item.parts:
                if isinstance(part, UserPromptPart) and isinstance(part.content, str):
                    messages.append(_text("user", part.content))
        else:
            for part in item.parts:
                if isinstance(part, TextPart):
                    messages.append(_text("assistant", part.content))
    final_parts = tuple(
        [PromptPart(kind="text", text=part, media=None) for part in conversation.prompt if isinstance(part, str)]
        + [_media_part(item) for item in media]
    )
    messages.append(PromptTraceMessage(role="user", parts=final_parts))
    serialized = json.dumps([item.model_dump(mode="json") for item in messages], ensure_ascii=False, sort_keys=True)
    return PromptTrace(
        level=rendered.level,
        template_sha256=None if template is None else f"sha256-{hashlib.sha256(template.encode()).hexdigest()}",
        rendered_sha256=f"sha256-{hashlib.sha256(serialized.encode()).hexdigest()}",
        rendered_ref=None,
        messages=tuple(messages),
        slot_ranges=(),
        variants=dict(rendered.variants),
        output_schema_sent=output_schema,
    )
