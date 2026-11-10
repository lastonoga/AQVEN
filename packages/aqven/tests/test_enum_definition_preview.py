from pathlib import Path

import pytest
from enum_projects import STANDARD_SHOP, TRIAGE_ENUM_BLOCK, code_prompt_shop, manual_liquid_shop, plain_shop

from aqven.check import CodeResolver
from aqven.compiler import compile_root
from aqven.preview import PromptPreview, PromptPreviewRequest, preview_prompt
from aqven.spec import FlowId, InferenceId, NodeId

MOOD_BLOCK = "Enum values of Mood (mood):\n- calm: Calm\n- warm: Warm"
TRAILING_MOOD_BLOCK = "Enum values of Mood (mood):\n- calm: Calm\n- warm: Warm  "


def preview_of(root: Path, flow: str, node: str) -> PromptPreview:
    project = compile_root(root)
    request = PromptPreviewRequest(flow_id=FlowId(flow), node_id=NodeId(node))
    with CodeResolver(root).session():
        return preview_prompt(project, request)


def test_plain_preview_shows_auto_enum_block(tmp_path: Path) -> None:
    preview = preview_of(plain_shop(tmp_path), "intake", "reply")
    expected = (
        "Output fields:\n- text: Reply\n- mood: Tone the reply came out in\n"
        f"- score: Confidence in the reply\n\n{MOOD_BLOCK}"
    )

    assert preview.prompt_level == 1
    assert preview.messages[-1].text.endswith(expected)
    assert preview.messages[-1].text.count(MOOD_BLOCK) == 1


def test_liquid_auto_preview_uses_output_format_enum_block() -> None:
    preview = preview_of(STANDARD_SHOP, "intake", "reply")
    expected_schema = compile_root(STANDARD_SHOP).inference(InferenceId("reply")).output_schema

    assert preview.prompt_level == 2
    assert preview.messages[-1].text.count(MOOD_BLOCK) == 1
    assert preview.output.json_schema == expected_schema


def test_liquid_manual_preview_does_not_duplicate_author_definitions(tmp_path: Path) -> None:
    preview = preview_of(manual_liquid_shop(tmp_path), "triage", "classify")
    instructions = preview.instructions or ""

    assert preview.prompt_level == 2
    assert instructions.count(TRIAGE_ENUM_BLOCK) == 1
    assert instructions.index(TRIAGE_ENUM_BLOCK) < instructions.index("Output fields:")


def test_code_preview_matches_engine_added_system_message(tmp_path: Path) -> None:
    preview = preview_of(code_prompt_shop(tmp_path), "intake", "reply")
    instructions = preview.instructions or ""

    assert preview.prompt_level == 3
    assert instructions.startswith(
        f"You reply to customer notes in one short sentence.\n\n\nYou reply to customer notes\n\n{MOOD_BLOCK}"
    )
    assert instructions.count(MOOD_BLOCK) == 1
    assert "Output fields:" not in instructions
    prompt_messages = [message.text for message in preview.messages if message.origin == "prompt"]
    assert prompt_messages == ["<text>\nTone: calm"]


def test_code_manual_preview_has_no_engine_enum_block(tmp_path: Path) -> None:
    preview = preview_of(code_prompt_shop(tmp_path, mode="manual"), "intake", "reply")
    instructions = preview.instructions or ""

    assert preview.prompt_level == 3
    assert MOOD_BLOCK not in instructions
    assert instructions.startswith(
        "You reply to customer notes in one short sentence.\n\n\nYou reply to customer notes"
    )
    assert "Output fields:" not in instructions


def trailing_warm(root: Path) -> None:
    target = root / "types/enums/mood.yaml"
    text = target.read_text(encoding="utf-8")
    assert text.count('description: "Warm"') == 1
    target.write_text(text.replace('description: "Warm"', 'description: "Warm  "'), encoding="utf-8")


@pytest.mark.parametrize("level", [1, 2, 3])
def test_real_preview_preserves_terminal_enum_description_whitespace(tmp_path: Path, level: int) -> None:
    if level == 3:
        root = code_prompt_shop(tmp_path)
    else:
        root = plain_shop(tmp_path)
        if level == 2:
            (root / "flows/intake/nodes/reply/reply.prompt.md").write_text(
                "{{ text }}\n{{ mood }}\n{{ output_format }}\n", encoding="utf-8"
            )
    trailing_warm(root)

    preview = preview_of(root, "intake", "reply")
    text = preview.instructions if level == 3 else preview.messages[-1].text

    assert preview.prompt_level == level
    assert text is not None
    if level == 3:
        assert TRAILING_MOOD_BLOCK in text
    else:
        assert text.endswith(TRAILING_MOOD_BLOCK)
