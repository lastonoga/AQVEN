import json
from collections.abc import Iterator, Mapping, Sequence
from typing import Final

from aqven.preview.prompt import PreviewMessage, PreviewOutput, PreviewTool, PromptPreview

INDENT: Final = "  "
NONE: Final = "(none)"
UNKNOWN_MEDIA: Final = "media type unknown"
DELIVERY_TEXTS: Final[Mapping[str, str]] = {
    "tool": "the model must call the tool {tool} whose parameters are the output schema",
    "native": "the provider enforces the output schema itself (native structured output)",
    "prompted": "the schema is sent as text in the instructions and the answer is parsed as JSON",
    "image": "the model answers with an image; the node stores it as the single Image output field",
}


def render_preview_text(preview: PromptPreview) -> str:
    return "\n".join(_lines(preview))


def render_preview_json(preview: PromptPreview) -> str:
    return json.dumps(preview.model_dump(mode="json"), ensure_ascii=False, indent=2)


def _lines(preview: PromptPreview) -> Iterator[str]:
    yield f"flow {preview.flow_id} node {preview.node_id}"
    yield f"{INDENT}agent {preview.agent_id} ({preview.agent_file or NONE}) model {preview.model}"
    if preview.fallback_models:
        yield f"{INDENT}fallback models: {', '.join(preview.fallback_models)}"
    inference = f"inference {preview.inference_id} ({preview.inference_file or NONE})"
    yield f"{INDENT}{inference} prompt level {preview.prompt_level}"
    yield f"{INDENT}input: {preview.input_source} values"
    yield from _section("input", (json.dumps(preview.input, ensure_ascii=False, indent=2),))
    yield from _variants(preview)
    yield from _attachments(preview)
    yield from _tools(preview.tools)
    yield from _section("instructions", (preview.instructions,) if preview.instructions else ())
    yield from _messages(preview.messages)
    yield from _output(preview.output)
    yield from _section("notes", tuple(f"- {note}" for note in preview.notes))


def _variants(preview: PromptPreview) -> Iterator[str]:
    if not preview.variants:
        return
    chosen = tuple(
        f"- {item.slot}: {item.case} (from {item.selector}{', forced' if item.forced else ''})"
        for item in preview.variants
    )
    yield from _section("variants", chosen)


def _attachments(preview: PromptPreview) -> Iterator[str]:
    if not preview.attachments:
        return
    items = tuple(
        f"- {item.name}: {item.type} {item.media_type or UNKNOWN_MEDIA} {item.url or item.blob_id or ''}".rstrip()
        for item in preview.attachments
    )
    yield from _section("attachments sent with the last user message", items)


def _tools(tools: Sequence[PreviewTool]) -> Iterator[str]:
    if not tools:
        return
    items = tuple(f"- {item.name} ({item.kind}): {item.description}" for item in tools)
    yield from _section("tools the model may call", items)


def _messages(messages: Sequence[PreviewMessage]) -> Iterator[str]:
    for index, message in enumerate(messages, start=1):
        yield from _section(f"message {index} {message.role} ({message.origin})", (message.text,))


def _output(output: PreviewOutput) -> Iterator[str]:
    mode = f"{output.declared_mode.value} -> {output.mode}" if output.delivery != "image" else output.delivery
    header = (
        f"output.mode {mode} ({output.mode_source}: {output.mode_reason})",
        f"strict {_flag(output.strict)}, output retries {output.retries}",
        DELIVERY_TEXTS[output.delivery].format(tool=output.tool_name),
        *_limits_line(output),
    )
    yield from _section("output contract", header)
    if output.schema_instructions is not None:
        header_text = "schema block the model layer appends in prompted mode"
        yield from _section(header_text, (output.schema_instructions.strip(),))


def _limits_line(output: PreviewOutput) -> tuple[str, ...]:
    if output.limits is None:
        return ()
    fields = len(output.limits.splitlines()) - 1
    return (f"the instructions above end with the output limits of {fields} fields, built from the output schema",)


def _flag(value: bool) -> str:
    return "true" if value else "false"


def _section(title: str, body: Sequence[str]) -> Iterator[str]:
    if not body:
        return
    yield ""
    yield f"--- {title}"
    for item in body:
        yield from item.splitlines()
