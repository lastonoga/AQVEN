import shutil
from pathlib import Path

import pytest
from pydantic import JsonValue, ValidationError

from aqven.check import check_project
from aqven.compiler import compile_project
from aqven.diagnostics import DiagnosticCode
from aqven.ir import CompiledDisplayFormatter
from aqven.runtime.presentation import (
    DisplayDocument,
    DisplayField,
    DisplaySection,
    DisplayText,
    PresentationRequest,
    pointer_value,
)
from aqven.spec import InferenceId, InferenceSpec


def test_display_document_accepts_pointers_and_literal_leaf_coverage() -> None:
    document = DisplayDocument(
        version=1,
        root=DisplaySection(
            kind="section",
            title="Result",
            children=(
                DisplayField(kind="field", label="Answer", path="/text"),
                DisplayText(kind="text", value="Confidence", represented_paths=("/score",)),
            ),
        ),
    )
    payload = document.model_dump(mode="json")
    assert payload["root"]["children"][0]["path"] == "/text"
    assert "value" not in payload["root"]["children"][0]
    assert "path" not in payload["root"]["children"][1]
    assert DisplayDocument.model_validate(payload) == document


@pytest.mark.parametrize(
    "payload",
    [
        {"kind": "text", "value": "x", "path": "/text"},
        {"kind": "text", "path": "text"},
        {"kind": "text", "value": "x", "html": "<b>x</b>"},
        {"kind": "media", "value": "https://example.com/image.png"},
    ],
)
def test_display_document_rejects_unsafe_or_ambiguous_elements(payload: dict[str, object]) -> None:
    with pytest.raises(ValidationError):
        DisplayDocument.model_validate({"version": 1, "root": {"kind": "section", "children": [payload]}})


def test_display_document_rejects_unknown_version_and_tone() -> None:
    with pytest.raises(ValidationError):
        DisplayDocument.model_validate({"version": 2, "root": {"kind": "section", "children": []}})
    with pytest.raises(ValidationError):
        DisplayDocument.model_validate(
            {
                "version": 1,
                "root": {"kind": "section", "children": [{"kind": "badge", "value": "ok", "tone": "rainbow"}]},
            }
        )


def test_presentation_request_requires_nonempty_targets() -> None:
    with pytest.raises(ValidationError):
        PresentationRequest.model_validate({"locale": "en", "targets": []})


def test_json_pointer_resolves_nested_and_escaped_segments() -> None:
    value: JsonValue = {"reply": {"text": "full answer"}, "x/y": ["first", {"~key": 3}]}
    assert pointer_value(value, "/reply/text") == "full answer"
    assert pointer_value(value, "/x~1y/1/~0key") == 3
    with pytest.raises(KeyError):
        pointer_value(value, "/reply/missing")
    with pytest.raises(KeyError):
        pointer_value({"~2": "do not accept"}, "/~2")


def test_inference_display_declaration_parses_both_sides() -> None:
    source = InferenceSpec.model_validate(
        {
            "apiVersion": "aqven/v1",
            "kind": "Inference",
            "description": "A reply",
            "in": [{"name": "text", "type": "Text", "description": "Input"}],
            "out": [{"name": "text", "type": "Text", "description": "Output"}],
            "display": {
                "input": {"run": "shop.formatters:show", "variables": {"source": "$in.text"}},
                "output": {"run": "shop.formatters:show", "variables": {"locale": "$run.context.locale"}},
            },
        }
    )
    assert source.display is not None
    assert source.display.input is not None
    assert source.display.input.variables == {"source": "$in.text"}


def test_inference_display_template_requires_exactly_one_source() -> None:
    base = {
        "apiVersion": "aqven/v1",
        "kind": "Inference",
        "description": "A reply",
        "out": [{"name": "text", "type": "Text", "description": "Output"}],
    }
    source = InferenceSpec.model_validate(
        {**base, "display": {"output": {"template": "@root/formatters/reply.display.liquid"}}}
    )
    assert source.display is not None and source.display.output is not None
    assert source.display.output.template == "@root/formatters/reply.display.liquid"
    for declaration in ({}, {"run": "shop.formatters:show", "template": "@root/reply.display.liquid"}):
        with pytest.raises(ValidationError):
            InferenceSpec.model_validate({**base, "display": {"output": declaration}})
    with pytest.raises(ValidationError):
        InferenceSpec.model_validate(
            {**base, "display": {"output": {"template": "@flow/reply.display.liquid"}}}
        )
    for declaration in ({}, {"run": "shop.formatters:show", "template": "reply.display.liquid"}):
        with pytest.raises(ValidationError):
            CompiledDisplayFormatter.model_validate(declaration)


def test_inference_display_template_compiles_project_path(tmp_path: Path) -> None:
    root = tmp_path / "standard_shop"
    shutil.copytree(Path(__file__).parent / "fixtures" / "standard_shop", root)
    inference = root / "flows/intake/nodes/reply/reply.inference.yaml"
    inference.write_text(
        inference.read_text(encoding="utf-8")
        + '\ndisplay:\n  output:\n    template: "@root/formatters/reply.display.liquid"\n',
        encoding="utf-8",
    )
    template = root / "formatters/reply.display.liquid"
    template.parent.mkdir()
    template.write_text(
        '{% section title: "Reply" %}{% field label: "Text", path: "/text" %}{% endsection %}',
        encoding="utf-8",
    )
    report = check_project(root)
    assert report.ok, report.diagnostics
    display = compile_project(report).inference(InferenceId("reply")).display
    assert display is not None and display.output is not None
    assert display.output.template == "formatters/reply.display.liquid"


@pytest.mark.parametrize(
    "source",
    [
        '{% field label: "Only", path: "/text" %}',
        "{% section %}{% endsection %}{% section %}{% endsection %}",
        '{% section %}{% render "missing.display.liquid" %}{% endsection %}',
    ],
)
def test_display_check_rejects_invalid_root_and_missing_literal_partial(tmp_path: Path, source: str) -> None:
    root = tmp_path / "standard_shop"
    shutil.copytree(Path(__file__).parent / "fixtures" / "standard_shop", root)
    inference = root / "flows/intake/nodes/reply/reply.inference.yaml"
    inference.write_text(
        inference.read_text(encoding="utf-8")
        + '\ndisplay:\n  output:\n    template: "@root/reply.display.liquid"\n',
        encoding="utf-8",
    )
    (root / "reply.display.liquid").write_text(source, encoding="utf-8")
    report = check_project(root)
    assert (DiagnosticCode.E_PROMPT_SYNTAX, ("display", "output", "template")) in {
        (item.code, item.path) for item in report.diagnostics
    }


def test_inference_display_declaration_compiles_both_sides(tmp_path: Path) -> None:
    root = tmp_path / "standard_shop"
    fixture = Path(__file__).parent / "fixtures" / "standard_shop"
    shutil.copytree(fixture, root)
    inference = root / "flows/intake/nodes/reply/reply.inference.yaml"
    inference.write_text(
        inference.read_text(encoding="utf-8")
        + '\ndisplay:\n  input:\n    run: "standard_shop.formatters:show"\n'
        + '    variables:\n      original: "$in.text"\n'
        + '  output:\n    run: "standard_shop.formatters:show"\n'
        + '    variables:\n      locale: "$run.context.locale"\n',
        encoding="utf-8",
    )
    (root / "formatters.py").write_text(
        "from aqven.runtime.presentation import DisplayDocument, DisplaySection\n"
        "def show(value, context):\n"
        "    return DisplayDocument(root=DisplaySection(children=()))\n",
        encoding="utf-8",
    )
    report = check_project(root)
    assert report.ok, report.diagnostics
    compiled = compile_project(report).inference(InferenceId("reply"))
    assert compiled.display is not None
    assert compiled.display.input is not None
    assert compiled.display.input.run == "standard_shop.formatters:show"
    assert compiled.display.output is not None
    assert compiled.display.output.variables == {"locale": "$run.context.locale"}


def test_display_bare_code_ref_resolves_from_inference_folder(tmp_path: Path) -> None:
    root = tmp_path / "standard_shop"
    shutil.copytree(Path(__file__).parent / "fixtures" / "standard_shop", root)
    folder = root / "flows/intake/nodes/reply"
    inference = folder / "reply.inference.yaml"
    inference.write_text(
        inference.read_text(encoding="utf-8") + '\ndisplay:\n  output:\n    run: "format_value"\n',
        encoding="utf-8",
    )
    code = folder / "reply.py"
    code.write_text(
        code.read_text(encoding="utf-8")
        + '\ndef format_value(value, context):\n'
        + '    from aqven.runtime.presentation import DisplayDocument, DisplaySection\n'
        + '    return DisplayDocument(root=DisplaySection(children=()))\n',
        encoding="utf-8",
    )
    report = check_project(root)
    assert report.ok, report.diagnostics
    display = compile_project(report).inference(InferenceId("reply")).display
    assert display is not None and display.output is not None
    assert display.output.run == "standard_shop.flows.intake.nodes.reply.reply:format_value"


def test_display_declaration_rejects_unknown_fields_and_bad_references() -> None:
    base = {
        "apiVersion": "aqven/v1",
        "kind": "Inference",
        "description": "A reply",
        "out": [{"name": "text", "type": "Text", "description": "Output"}],
    }
    with pytest.raises(ValidationError):
        InferenceSpec.model_validate({**base, "display": {"output": {"run": "https://example.com/x"}}})
    with pytest.raises(ValidationError):
        InferenceSpec.model_validate({**base, "display": {"output": {"run": "shop.formatters:show", "html": True}}})


def test_display_check_rejects_unresolvable_variable_and_async_formatter(tmp_path: Path) -> None:
    root = tmp_path / "standard_shop"
    shutil.copytree(Path(__file__).parent / "fixtures" / "standard_shop", root)
    inference = root / "flows/intake/nodes/reply/reply.inference.yaml"
    inference.write_text(
        inference.read_text(encoding="utf-8")
        + '\ndisplay:\n  output:\n    run: "standard_shop.formatters:show"\n'
        + '    variables:\n      missing: "$out.no_such_field"\n',
        encoding="utf-8",
    )
    (root / "formatters.py").write_text("async def show(value, context):\n    return {}\n", encoding="utf-8")
    report = check_project(root)
    found = {(item.code, item.path) for item in report.diagnostics}
    assert (DiagnosticCode.E_REF_MISSING, ("display", "output", "variables", "missing")) in found
    assert (DiagnosticCode.E_CODE_SIGNATURE_MISMATCH, ("display", "output", "run")) in found
