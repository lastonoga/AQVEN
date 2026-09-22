import json
from pathlib import Path
from typing import Final

import pytest
from pydantic import JsonValue, TypeAdapter

from aqven.cli import main
from aqven.compiler import compile_root
from aqven.ir import CompiledInference, CompiledProject, FieldIr
from aqven.preview import (
    PreviewInputInvalid,
    PreviewNotFound,
    PromptPreview,
    PromptPreviewRequest,
    preview_prompt,
    render_preview_text,
    sample_document,
)
from aqven.preview.prompt import attachments, sample_media
from aqven.spec import BlobId, FlowId, InferenceId, MediaValue, NodeId
from aqven.testing import copy_project

FIXTURES: Final = Path(__file__).parent / "fixtures"
STANDARD_SHOP: Final = FIXTURES / "standard_shop"
FIXTURE_SHOP: Final = FIXTURES / "fixture_shop"
JSON_OBJECT: Final[TypeAdapter[dict[str, JsonValue]]] = TypeAdapter(dict[str, JsonValue])
PROMPTED_OUTPUT: Final = '\noutput:\n  mode: "prompted"\n'


@pytest.fixture(scope="module")
def shop() -> CompiledProject:
    return compile_root(STANDARD_SHOP)


@pytest.fixture(scope="module")
def triage() -> CompiledProject:
    return compile_root(FIXTURE_SHOP)


def preview_of(
    project: CompiledProject,
    flow: str,
    node: str,
    document: dict[str, JsonValue] | None = None,
    variants: dict[str, str] | None = None,
) -> PromptPreview:
    request = PromptPreviewRequest(flow_id=FlowId(flow), node_id=NodeId(node), input=document, variants=variants)
    return preview_prompt(project, request)


def last_message(preview: PromptPreview) -> str:
    return preview.messages[-1].text


def test_sample_values_fill_the_inference_input(shop: CompiledProject) -> None:
    preview = preview_of(shop, "intake", "reply")
    assert preview.input_source == "sample"
    assert preview.input == {"text": "<text>", "mood": "calm"}
    assert preview.agent_id == "writer"
    assert preview.inference_id == "reply"
    assert preview.model == "openai:gpt-5.4-mini"
    assert preview.prompt_level == 2


def test_sample_document_honours_enums_bounds_and_arrays() -> None:
    schema: dict[str, JsonValue] = {
        "type": "object",
        "properties": {
            "kind": {"enum": ["a", "b"]},
            "score": {"type": "number", "minimum": 0.5, "maximum": 1},
            "count": {"type": "integer", "minimum": 3},
            "flag": {"type": "boolean"},
            "when": {"type": "string", "format": "date"},
            "short": {"type": "string", "maxLength": 3},
            "items": {"type": "array", "items": {"type": "string"}},
            "nested": {"$ref": "#/$defs/Inner"},
        },
        "$defs": {"Inner": {"type": "object", "properties": {"note": {"type": "string"}}}},
    }
    assert sample_document(schema) == {
        "kind": "a",
        "score": 0.5,
        "count": 3,
        "flag": True,
        "when": "2026-01-01",
        "short": "<sh",
        "items": ["<items>"],
        "nested": {"note": "<note>"},
    }


def test_prompt_shows_fragments_variants_and_the_given_input(shop: CompiledProject) -> None:
    preview = preview_of(shop, "intake", "reply", document={"text": "Коробка мятая", "mood": "calm"})
    text = last_message(preview)
    assert preview.input_source == "request"
    assert "Пиши спокойно и коротко." in text
    assert "Держи ровный тон." in text
    assert "<note>Коробка мятая</note>" in text
    assert "Output fields:" in text


def test_variant_case_is_forced_without_touching_the_input(shop: CompiledProject) -> None:
    preview = preview_of(shop, "intake", "reply", variants={"tone": "warm"})
    [variant] = preview.variants
    assert (variant.slot, variant.case, variant.forced, variant.selector) == ("tone", "warm", True, "$in.mood")
    assert "Добавь тепла." in last_message(preview)
    assert preview.input["mood"] == "warm"


def test_instructions_carry_agent_text_and_output_limits(shop: CompiledProject) -> None:
    preview = preview_of(shop, "intake", "reply")
    instructions = preview.instructions or ""
    assert "Ты отвечаешь на заметки покупателей" in instructions
    assert "Output limits" in instructions
    assert "- text: at most 200 characters" in instructions
    assert '- mood: one of "calm", "warm"' in instructions
    assert preview.output.limits is not None
    assert preview.output.limits in instructions


def test_output_contract_reports_the_resolved_mode_and_tool(shop: CompiledProject) -> None:
    output = preview_of(shop, "intake", "reply").output
    assert (output.delivery, output.mode, output.tool_name) == ("tool", "tool", "final_result")
    assert output.declared_mode == "auto"
    assert output.mode_source == "profile"
    assert output.schema_instructions is None
    assert output.json_schema["properties"] is not None


def test_sample_media_values_pass_the_media_model() -> None:
    inference = CompiledInference(
        inference_id=InferenceId("shot"),
        description="one photo and one file",
        input_fields=(
            FieldIr(name="photo", type="Image", description="Photo"),
            FieldIr(name="files", type="Document[]", description="Files"),
        ),
        output_fields=(FieldIr(name="text", type="Text", description="Caption"),),
        input_schema={},
        output_schema={},
    )

    filled = sample_media(inference, {"photo": {"$media": "<$media>"}, "files": [{"$media": "<$media>"}]})

    assert MediaValue.model_validate(filled["photo"]).media_type == "image/png"
    files = filled["files"]
    assert isinstance(files, list)
    assert MediaValue.model_validate(files[0]).media_type == "application/pdf"


def test_media_inputs_are_listed_as_attachments_not_as_text() -> None:
    blob = BlobId(f"sha256-{'a' * 64}")
    photo = MediaValue(media_type="image/png", blob_id=blob, size_bytes=12, name="photo.png")
    inference = CompiledInference(
        inference_id=InferenceId("shot"),
        description="one photo",
        input_fields=(FieldIr(name="photo", type="Image", description="Photo"),),
        output_fields=(FieldIr(name="text", type="Text", description="Caption"),),
        input_schema={},
        output_schema={},
    )

    [attachment] = attachments(inference, {"photo": photo.model_dump(mode="json", by_alias=True)})

    assert (attachment.name, attachment.type) == ("photo", "Image")
    assert attachment.media_type == "image/png"
    assert attachment.blob_id == photo.blob_id


def test_tools_and_subagents_of_the_agent_are_listed(shop: CompiledProject) -> None:
    tools = {item.name: item.kind for item in preview_of(shop, "intake", "reply").tools}
    assert tools == {"stamp": "tool", "lookup": "subagent"}


def test_system_message_goes_to_instructions_and_examples_come_first(triage: CompiledProject) -> None:
    preview = preview_of(triage, "triage", "classify")
    assert "Ты сортируешь обращения покупателей" in (preview.instructions or "")
    assert [(item.role, item.origin) for item in preview.messages] == [
        ("user", "example"),
        ("assistant", "example"),
        ("user", "prompt"),
    ]
    assert "Где посылка" in preview.messages[0].text
    assert "Тема: <subject>" in last_message(preview)


def test_unknown_flow_node_and_kind_are_reported(shop: CompiledProject) -> None:
    with pytest.raises(PreviewNotFound, match="flow missing is not in the project"):
        preview_of(shop, "missing", "reply")
    with pytest.raises(PreviewNotFound, match="is not in the flow"):
        preview_of(shop, "intake", "missing")
    with pytest.raises(PreviewNotFound, match="is a code node"):
        preview_of(shop, "intake", "clean")


def test_unknown_variant_slot_and_case_are_input_errors(shop: CompiledProject) -> None:
    with pytest.raises(PreviewInputInvalid, match="has no variant slot mood"):
        preview_of(shop, "intake", "reply", variants={"mood": "warm"})
    with pytest.raises(PreviewInputInvalid, match="has no case loud: cases are calm, warm"):
        preview_of(shop, "intake", "reply", variants={"tone": "loud"})


def test_prompted_mode_shows_the_schema_block_the_model_layer_adds(tmp_path: Path) -> None:
    root = copy_project(STANDARD_SHOP, tmp_path)
    agent = root / "agents" / "writer" / "writer.yaml"
    agent.write_text(agent.read_text(encoding="utf-8") + PROMPTED_OUTPUT, encoding="utf-8")
    preview = preview_of(compile_root(root), "intake", "reply")
    block = preview.output.schema_instructions or ""
    assert preview.output.delivery == "prompted"
    assert preview.output.tool_name is None
    assert "Always respond with a JSON object" in block
    assert '"title": "final_result"' in block


def test_text_rendering_shows_every_section(shop: CompiledProject) -> None:
    text = render_preview_text(preview_of(shop, "intake", "reply"))
    assert "flow intake node reply" in text
    assert "--- instructions" in text
    assert "--- message 1 user (prompt)" in text
    assert "--- output contract" in text
    assert "the model must call the tool final_result" in text


def test_cli_prints_the_preview_and_accepts_input_and_variants(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    document = tmp_path / "input.json"
    document.write_text(json.dumps({"text": "Помялась коробка", "mood": "calm"}), encoding="utf-8")
    arguments = [
        "prompt",
        "preview",
        "intake.reply",
        "--project",
        str(STANDARD_SHOP),
        "--input",
        str(document),
        "--variant",
        "tone=warm",
    ]
    assert main(arguments) == 0
    printed = capsys.readouterr().out
    assert "Помялась коробка" in printed
    assert "Добавь тепла." in printed
    assert "- tone: warm (from $in.mood, forced)" in printed


def test_cli_json_output_is_the_preview_model(capsys: pytest.CaptureFixture[str]) -> None:
    assert main(["prompt", "preview", "intake.reply", "--project", str(STANDARD_SHOP), "--json"]) == 0
    document = JSON_OBJECT.validate_python(json.loads(capsys.readouterr().out))
    assert document["flow_id"] == "intake"
    assert document["node_id"] == "reply"
    assert PromptPreview.model_validate(document).output.mode == "tool"


def test_cli_reports_bad_target_variant_and_unknown_node(capsys: pytest.CaptureFixture[str]) -> None:
    project = ["--project", str(STANDARD_SHOP)]
    assert main(["prompt", "preview", "intake", *project]) == 2
    assert main(["prompt", "preview", "intake.reply", *project, "--variant", "tone"]) == 2
    assert main(["prompt", "preview", "intake.clean", *project]) == 2
    errors = capsys.readouterr().err
    assert "expected FLOW.NODE" in errors
    assert "expected SLOT=CASE" in errors
    assert "only llm nodes have a prompt" in errors


def test_cli_reports_a_missing_input_file(tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    missing = tmp_path / "nothing.json"
    arguments = ["prompt", "preview", "intake.reply", "--project", str(STANDARD_SHOP), "--input", str(missing)]
    assert main(arguments) == 2
    assert "must hold a JSON object" in capsys.readouterr().err
