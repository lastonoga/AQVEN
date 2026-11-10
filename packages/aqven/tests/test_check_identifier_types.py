from pathlib import Path
from typing import Final

import pytest
from risk_warnings import (
    diagnostics,
    field,
    id_type,
    inference,
    install,
    only,
    record_type,
    shop,
    union_type,
    value_type,
)

from aqven.check import check_project
from aqven.diagnostics import Severity

CODE: Final = "W_TEXT_IDENTIFIER_TYPE"
HINT: Final = (
    "use an IdType for an entity ID, or an enum for a genuinely closed codebook; "
    "selecting existing entities also requires an appropriate allowed set after the type correction"
)
ENUM_TYPE: Final = '''apiVersion: "aqven/v1"
kind: "Type"
type: "enum"
description: "Closed category"
values:
- value: "a"
  description: "A"
'''


@pytest.mark.parametrize(
    ("name", "type_ref", "description", "extra", "types"),
    [
        ("id", "Text", "Value", "  maxLength: 20\n", {}),
        ("cluster_id", "Text?", "Value", "  maxLength: 20\n", {}),
        ("cluster_ids", "Text[]", "Value", "  maxItems: 2\n  maxLength: 20\n", {}),
        ("patterned_id", "Text", "Value", '  maxLength: 20\n  pattern: "^[a-z]+$"\n', {}),
        ("legacy_id", "LegacyCode", "Value", "", {"legacy_code.yaml": value_type(extra="maxLength: 20\n")}),
        ("note", "Text", "Stable ID for grouping.", "  maxLength: 20\n", {}),
    ],
    ids=["id", "optional", "list", "pattern", "value_type", "description"],
)
def test_text_identifier_warns_at_the_output_declaration(
    tmp_path: Path,
    name: str,
    type_ref: str,
    description: str,
    extra: str,
    types: dict[str, str],
) -> None:
    root = shop(tmp_path)
    install(root, types, inference("", field(name, type_ref, description, extra=extra)))

    report = check_project(root)
    warning = only(report, CODE)

    assert warning.severity is Severity.WARNING
    assert (warning.file, warning.path) == ("risk/work.inference.yaml", ("out", 0, "type"))
    assert warning.message == (
        f"Field `{name}` self-declares an identifier but uses `Text`; "
        "use an `IdType` for an entity ID, or an enum for a genuinely closed codebook."
    )
    assert warning.hint == HINT
    assert report.ok


def test_registry_and_union_findings_are_emitted_once_per_declaration(tmp_path: Path) -> None:
    root = shop(tmp_path)
    types = {
        "legacy_code.yaml": value_type(extra="maxLength: 20\n"),
        "result.yaml": record_type(field("review_id", "Text", extra="  maxLength: 30\n")),
        "result_union.yaml": union_type(
            ("first", field("external_id", "Text", extra="  maxLength: 30\n")),
            ("second", field("legacy_id", "LegacyCode")),
        ),
    }
    source = inference(
        field("first", "Result") + field("union", "ResultUnion"),
        field("second", "Result") + field("answer", "Text", extra="  maxLength: 20\n"),
    )
    install(root, types, source)

    report = check_project(root)
    found = [item for item in report.diagnostics if item.code.value == CODE]

    assert [(item.file, item.path) for item in found] == [
        ("risk/types/result.yaml", ("fields", 0, "type")),
        ("risk/types/result_union.yaml", ("variants", 0, "fields", 0, "type")),
        ("risk/types/result_union.yaml", ("variants", 1, "fields", 0, "type")),
    ]


@pytest.mark.parametrize(
    ("name", "type_ref", "description", "extra", "types"),
    [
        ("valid", "Text", "Value", "  maxLength: 20\n", {}),
        ("grid", "Text", "Value", "  maxLength: 20\n", {}),
        ("identity", "Text", "Value", "  maxLength: 20\n", {}),
        ("note", "Text", "lowercase id", "  maxLength: 20\n", {}),
        ("note", "Text", "mixed Id", "  maxLength: 20\n", {}),
        ("note", "Text", "plural IDs", "  maxLength: 20\n", {}),
        ("note", "Text", "identifier", "  maxLength: 20\n", {}),
        ("external_id", "Text", "Value", '  maxLength: 20\n  enum:\n  - "a"\n', {}),
        ("external_id", "LegacyCode", "Value", "", {"legacy_code.yaml": value_type(extra='enum:\n- "a"\n')}),
        ("entity_id", "EntityId", "Value", "", {"entity_id.yaml": id_type()}),
        ("category_id", "Category", "Value", "", {"category.yaml": ENUM_TYPE}),
        ("state_id", "Dynamic", "Value", "", {}),
        ("unknown_id", "MissingType", "Value", "", {}),
        ("count_id", "Int", "Value", "", {}),
    ],
    ids=[
        "valid",
        "grid",
        "identity",
        "lowercase",
        "mixed_case",
        "plural",
        "identifier_word",
        "field_enum",
        "value_enum",
        "id_type",
        "enum_type",
        "dynamic",
        "unresolved",
        "non_text",
    ],
)
def test_text_identifier_negative_controls(
    tmp_path: Path,
    name: str,
    type_ref: str,
    description: str,
    extra: str,
    types: dict[str, str],
) -> None:
    root = shop(tmp_path)
    install(root, types, inference("", field(name, type_ref, description, extra=extra)))

    assert diagnostics(check_project(root), CODE) == []
