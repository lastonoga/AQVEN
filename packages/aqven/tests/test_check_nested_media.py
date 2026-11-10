from pathlib import Path
from typing import Final

import pytest
from risk_warnings import INFERENCE_FILE, diagnostics, field, inference, install, record_type, shop, union_type, write

from aqven.check import CheckReport, check_project
from aqven.diagnostics import Diagnostic

CODE: Final = "W_NESTED_MEDIA_NOT_ATTACHED"
CASE_TYPE: Final = record_type(
    field("title", "Text", extra="  maxLength: 40\n")
    + field("photo", "Image")
    + field("attachments", "Document[]?", extra="  maxItems: 2\n")
)
CODE_PROMPT: Final = '''from aqven.spec import RenderedPrompt, user
from fixture_shop.types import Case


def render(case: Case) -> RenderedPrompt:
    return RenderedPrompt(messages=(user("Inspect the case."),))
'''


def work_diagnostics(report: CheckReport) -> list[Diagnostic]:
    return [item for item in diagnostics(report, CODE) if item.file == INFERENCE_FILE]


def only_work(report: CheckReport) -> Diagnostic:
    found = work_diagnostics(report)
    assert len(found) == 1, found
    return found[0]


@pytest.mark.parametrize("prompt_kind", ["template", "code"])
def test_record_media_warns_once_with_sorted_paths_for_any_prompt_kind(tmp_path: Path, prompt_kind: str) -> None:
    root = shop(tmp_path)
    prompt = "fixture_shop.risk_prompts:render" if prompt_kind == "code" else None
    source = inference(field("case", "Case"), field("answer", "Text", extra="  maxLength: 20\n"), prompt=prompt)
    install(root, {"case.yaml": CASE_TYPE}, source)
    if prompt_kind == "code":
        write(root, "risk_prompts.py", CODE_PROMPT)

    report = check_project(root)
    warning = only_work(report)

    assert (warning.file, warning.path) == ("risk/work.inference.yaml", ("in", 0, "type"))
    assert warning.message == (
        "Input `case` contains nested media at `case.attachments[*]: Document`, `case.photo: Image`; "
        "nested media is never attached to the model. Hoist it to a top-level inference input "
        "if the model must read it."
    )
    assert warning.hint == (
        "hoist the media to a top-level input, or retain it only as metadata when model access is not intended"
    )
    assert report.ok


def test_union_media_paths_are_combined(tmp_path: Path) -> None:
    root = shop(tmp_path)
    case_union = union_type(
        ("photo", field("photo", "Image")),
        ("audio", field("audio", "Audio?")),
    )
    source = inference(field("case", "CaseUnion"), field("answer", "Text", extra="  maxLength: 20\n"))
    install(root, {"case_union.yaml": case_union}, source)

    warning = only_work(check_project(root))

    assert "`case.audio: Audio`, `case.photo: Image`" in warning.message


def test_direct_media_and_media_only_in_output_do_not_warn(tmp_path: Path) -> None:
    root = shop(tmp_path)
    source = inference(
        field("photo", "Image")
        + field("photos", "Image[]", extra="  maxItems: 2\n")
        + field("document", "Document?"),
        field("result", "Result"),
    )
    install(
        root,
        {"result.yaml": record_type(field("photo", "Image"))},
        source,
    )

    assert work_diagnostics(check_project(root)) == []


def test_dynamic_and_unresolved_branches_do_not_warn(tmp_path: Path) -> None:
    root = shop(tmp_path)
    source = inference(
        field("dynamic", "Dynamic") + field("unknown", "MissingType"),
        field("answer", "Text", extra="  maxLength: 20\n"),
    )
    install(root, {}, source)

    assert work_diagnostics(check_project(root)) == []
