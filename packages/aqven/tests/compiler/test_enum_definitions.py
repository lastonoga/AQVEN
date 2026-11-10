import json
from pathlib import Path

from enum_projects import STANDARD_SHOP, input_only_inline_shop, nested_shop

from aqven.compiler import compile_root
from aqven.engine.llm.prompts import output_format
from aqven.ir import CompiledProject
from aqven.spec import InferenceId

STANDARD_SCHEMA = (
    '{"additionalProperties": false, "properties": {"text": {"description": "Reply", "maxLength": 200, '
    '"type": "string"}, "mood": {"description": "Tone the reply came out in", "enum": ["calm", "warm"], '
    '"type": "string"}, "score": {"description": "Confidence in the reply", "maximum": 1, "minimum": 0, '
    '"type": "number"}}, "required": ["text", "mood", "score"], "type": "object"}'
)


def definition_summary(project: CompiledProject, inference_id: str) -> tuple[object, ...]:
    inference = project.inference(InferenceId(inference_id))
    return tuple(
        (
            item.type_id,
            item.description,
            item.paths,
            tuple((value.value, value.description) for value in item.values),
        )
        for item in inference.output_enums
    )


def test_default_auto_compiles_direct_enum_and_preserves_schema_bytes() -> None:
    fixture = compile_root(STANDARD_SHOP)
    reply = fixture.inference(InferenceId("reply"))

    assert reply.enum_definitions == "auto"
    assert definition_summary(fixture, "reply") == (
        ("Mood", "Reply tone", ("mood",), (("calm", "Calm"), ("warm", "Warm"))),
    )
    assert json.dumps(reply.output_schema, ensure_ascii=False) == STANDARD_SCHEMA


def test_nested_output_enum_paths_and_value_order_are_deterministic(tmp_path: Path) -> None:
    root = nested_shop(tmp_path)

    first = compile_root(root)
    second = compile_root(root)
    lookup = first.inference(InferenceId("lookup"))

    assert lookup.enum_definitions == "auto"
    assert definition_summary(first, "lookup") == (
        (
            "Mood",
            "Reply tone",
            ("assessment.score.criterion", "assessment.tie_break", "direct", "scores[*].criterion"),
            (("calm", "Calm"), ("warm", "Warm")),
        ),
        (
            "Priority",
            "Urgency",
            ("assessment.priority", "assessment.score.priorities[*]", "scores[*].priorities[*]"),
            (("high", "Handle today"), ("low", "Handle later")),
        ),
    )
    assert all(not path.startswith(("dynamic", "inline")) for enum in lookup.output_enums for path in enum.paths)
    assert first.model_dump_json() == second.model_dump_json()
    assert CompiledProject.model_validate_json(first.model_dump_json()) == first


def test_input_only_and_inline_enums_create_no_definitions(tmp_path: Path) -> None:
    project = compile_root(input_only_inline_shop(tmp_path))
    redo = project.inference(InferenceId("redo"))

    assert redo.enum_definitions == "manual"
    assert redo.output_enums == ()
    assert "Enum values of" not in output_format(redo, ())


def test_explicit_auto_matches_the_default_mode(tmp_path: Path) -> None:
    explicit = compile_root(nested_shop(tmp_path, mode="auto"))
    default_destination = tmp_path / "default"
    default_destination.mkdir()
    default = compile_root(nested_shop(default_destination))

    assert explicit.inference(InferenceId("lookup")).enum_definitions == "auto"
    assert definition_summary(explicit, "lookup") == definition_summary(default, "lookup")
