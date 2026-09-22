import asyncio
import json
import shutil
from collections.abc import Callable
from pathlib import Path
from types import SimpleNamespace
from typing import Never, cast

import pytest
from liquid.exceptions import LiquidError
from pydantic import JsonValue, ValidationError

from aqven.compiler import compile_root
from aqven.engine.addressing import address_key
from aqven.engine.display_template import render_presentation_template
from aqven.engine.facade import DbosEngineFacade, PlanSource, RunRecordView
from aqven.engine.loading import CodeLoader
from aqven.engine.presentation import (
    CurrentFormatterLoader,
    CurrentTemplateLoader,
    FormatterHandle,
    TemplateHandle,
    hydrate_ref,
    present_batch,
    validate_document,
)
from aqven.engine.projection import ExecutionFold, RunFold
from aqven.engine.request import RunCall, RunSpec
from aqven.engine.runtime import EngineRuntime
from aqven.ir import CompiledDisplayFormatter, CompiledInferenceDisplay, CompiledProject, IrHash
from aqven.runtime.address import ExecutionAddress, RunId, node_address
from aqven.runtime.human import HumanWaitDetail
from aqven.runtime.presentation import (
    DisplayBadge,
    DisplayDocument,
    DisplayField,
    DisplayList,
    DisplayMedia,
    DisplaySection,
    DisplaySide,
    DisplayText,
    PresentationContext,
    PresentationRequest,
    PresentationTarget,
)
from aqven.runtime.values import BlobValue, InlineValue
from aqven.spec import BlobId, CodeRef, FlowId, InferenceId, NodeKind


def plan_of(name: str) -> CompiledProject:
    return compile_root(Path(__file__).parents[1] / "fixtures" / name)


def formatter(run: str, variables: dict[str, str] | None = None) -> CompiledDisplayFormatter:
    return CompiledDisplayFormatter(run=CodeRef(run), variables=variables or {})


def with_display(plan: CompiledProject, inference_id: str, display: CompiledInferenceDisplay) -> CompiledProject:
    key = InferenceId(inference_id)
    inference = plan.inference(key).model_copy(update={"display": display})
    return plan.model_copy(update={"inferences": {**plan.inferences, key: inference}})


def request_for(address: ExecutionAddress, *sides: DisplaySide) -> PresentationRequest:
    return PresentationRequest(
        locale="en",
        targets=tuple(PresentationTarget(address=address, side=side) for side in sides),
    )


def document(value: JsonValue, context: PresentationContext) -> DisplayDocument:
    return DisplayDocument(root=DisplaySection(children=(DisplayField(label="Text", path="/text"),)))


def template_context() -> PresentationContext:
    return PresentationContext(
        side="output",
        input={"question": "What?"},
        output={"text": 'A "quoted" answer', "citations": [{"quote": "first"}, {"quote": "second"}]},
        variables={"show_citations": True},
        variants={"tone": "calm"},
        model="provider:model",
        inference_id="reply",
        address=node_address("reply"),
        locale="en",
    )


def test_typed_liquid_template_builds_nested_document_with_conditions_loops_and_partials() -> None:
    source = """{% section title: "Result" %}
{% field label: "Answer", path: "/text" %}
{% if variables.show_citations %}{% list title: "Citations" %}
{% for citation in value.citations %}
{% assign citation_path = "/citations/" | append: forloop.index0 | append: "/quote" %}
{% text path: citation_path %}
{% endfor %}{% endlist %}{% endif %}
{% render "badge", value: variants.tone %}
{% endsection %}"""
    result = render_presentation_template(
        source,
        template_context(),
        {"badge": '{% badge value: value, tone: "positive" %}'},
    )
    assert result.root.title == "Result"
    assert [child.kind for child in result.root.children] == ["field", "list", "badge"]
    citations = result.root.children[1]
    assert isinstance(citations, DisplayList)
    first_citation, second_citation = citations.children
    assert isinstance(first_citation, DisplayText)
    assert isinstance(second_citation, DisplayText)
    assert (first_citation.path, second_citation.path) == ("/citations/0/quote", "/citations/1/quote")
    badge = result.root.children[2]
    assert isinstance(badge, DisplayBadge)
    assert badge.value == "calm"


def test_typed_liquid_card_contains_nested_elements() -> None:
    source = """{% section title: "Review" %}
{% card title: "Customer", description: "Details", tone: "warning" %}
{% field label: "Answer", path: "/text" %}
{% list title: "Evidence" %}{% text path: "/citations/0/quote" %}{% endlist %}
{% endcard %}
{% endsection %}"""
    result = render_presentation_template(source, template_context())
    card = result.root.children[0]
    assert card.kind == "card"
    assert card.title == "Customer"
    assert card.description == "Details"
    assert card.tone == "warning"
    assert [child.kind for child in card.children] == ["field", "list"]
    evidence = card.children[1]
    assert isinstance(evidence, DisplayList)
    citation = evidence.children[0]
    assert isinstance(citation, DisplayText)
    assert citation.path == "/citations/0/quote"


def test_typed_liquid_card_validates_nested_pointers() -> None:
    source = """{% section %}
{% card title: "Customer" %}{% list %}{% field label: "Missing", path: "/missing" %}{% endlist %}{% endcard %}
{% endsection %}"""
    with pytest.raises(KeyError, match="/missing"):
        render_presentation_template(source, template_context())


@pytest.mark.parametrize(
    "attributes",
    ['title: ""', 'title: "   "', 'title: "Customer", tone: "urgent"', ""],
)
def test_typed_liquid_card_rejects_invalid_title_or_tone(attributes: str) -> None:
    source = "{% section %}{% card " + attributes + " %}{% endcard %}{% endsection %}"
    with pytest.raises(ValidationError):
        render_presentation_template(source, template_context())


def test_unrelated_liquid_source_does_not_break_selected_template() -> None:
    result = render_presentation_template(
        '{% section %}{% text path: "/text" %}{% endsection %}',
        template_context(),
        {"other.display.liquid": "{{ unsafe }}"},
    )
    assert result.root.children[0].kind == "text"


@pytest.mark.parametrize(
    "source",
    [
        "{% section %}raw text{% endsection %}",
        "{% section %}{{ value.text }}{% endsection %}",
        "{% section %}{% capture hidden %}raw text{% endcapture %}{% endsection %}",
        '{% field label: "X", path: "/text" %}',
        "{% section %}{% endsection %}{% section %}{% endsection %}",
        '{% section %}{% media path: "/text" %}{% endsection %}',
    ],
)
def test_typed_liquid_template_rejects_text_unsupported_tags_invalid_root_and_media(source: str) -> None:
    with pytest.raises((ValueError, LiquidError, ValidationError)):
        render_presentation_template(source, template_context())


def test_batch_formats_current_template_and_tracks_partial_changes(tmp_path: Path) -> None:
    display = CompiledInferenceDisplay(output=CompiledDisplayFormatter(template="formatters/reply.display.liquid"))
    plan = with_display(plan_of("standard_shop"), "reply", display)
    address = node_address("reply")
    execution = ExecutionFold(address=address, kind=NodeKind.LLM)
    execution.output_ref = InlineValue(value={"text": "complete"})
    fold = RunFold(executions={address_key(address): execution})
    folder = tmp_path / "formatters"
    folder.mkdir()
    (folder / "reply.display.liquid").write_text(
        '{% section %}{% render "field.display.liquid" %}{% endsection %}', encoding="utf-8"
    )
    partial = folder / "field.display.liquid"
    partial.write_text('{% field label: "First", path: "/text" %}', encoding="utf-8")
    loader = CurrentTemplateLoader(tmp_path)
    first = present_batch(
        plan, FlowId("intake"), {}, fold, request_for(address, "output"), load_document, empty_blob, loader.load
    )
    partial.write_text('{% field label: "Second", path: "/text" %}', encoding="utf-8")
    second = present_batch(
        plan, FlowId("intake"), {}, fold, request_for(address, "output"), load_document, empty_blob, loader.load
    )
    assert first.results[0].status == second.results[0].status == "formatted"
    first_document = first.results[0].document
    second_document = second.results[0].document
    assert first_document is not None
    assert second_document is not None
    first_label = first_document.root.children[0]
    second_label = second_document.root.children[0]
    assert isinstance(first_label, DisplayField)
    assert isinstance(second_label, DisplayField)
    assert (first_label.label, second_label.label) == ("First", "Second")
    assert first.results[0].formatter_version != second.results[0].formatter_version


def test_batch_loads_shared_template_once_for_multiple_targets(tmp_path: Path) -> None:
    display = CompiledInferenceDisplay(output=CompiledDisplayFormatter(template="reply.display.liquid"))
    plan = with_display(plan_of("standard_shop"), "reply", display)
    address = node_address("reply")
    execution = ExecutionFold(address=address, kind=NodeKind.LLM)
    execution.output_ref = InlineValue(value={"text": "complete"})
    fold = RunFold(executions={address_key(address): execution})
    (tmp_path / "reply.display.liquid").write_text(
        '{% section %}{% text path: "/text" %}{% endsection %}', encoding="utf-8"
    )
    loader = CurrentTemplateLoader(tmp_path)
    loads = 0

    def load(ref: str) -> TemplateHandle:
        nonlocal loads
        loads += 1
        return loader.load(ref)

    response = present_batch(
        plan, FlowId("intake"), {}, fold, request_for(address, "output", "output"), load_document, empty_blob, load
    )
    assert [result.status for result in response.results] == ["formatted", "formatted"]
    assert loads == 1


def load_document(ref: str) -> Callable[..., object]:
    return document


def empty_blob(blob_id: str) -> bytes:
    return b""


def test_batch_uses_complete_recorded_values_and_isolates_formatter_failure() -> None:
    display = CompiledInferenceDisplay(
        input=formatter("standard_shop.formatters:good", {"source": "$in.text"}),
        output=formatter("standard_shop.formatters:bad", {"locale": "$run.context.locale"}),
    )
    plan = with_display(plan_of("standard_shop"), "reply", display)
    address = node_address("reply")
    full_text = "complete " * 3000
    encoded = json.dumps({"text": full_text}).encode()
    output_ref = BlobValue(
        blob_id=BlobId("sha256-" + "a" * 64),
        sha256="a" * 64,
        size_bytes=len(encoded),
        media_type="application/json",
        preview="truncated",
        truncated=True,
    )
    execution = ExecutionFold(address=address, kind=NodeKind.LLM)
    execution.inference = "reply"
    execution.input_ref = InlineValue(value={"text": "recorded input"})
    execution.output_ref = output_ref
    execution.model = "provider:actual-model"
    execution.variants = {"tone": "calm"}
    fold = RunFold(executions={address_key(address): execution})
    seen: list[tuple[JsonValue, PresentationContext]] = []

    def good(value: JsonValue, context: PresentationContext) -> DisplayDocument:
        seen.append((value, context))
        return document(value, context)

    def bad(value: JsonValue, context: PresentationContext) -> Never:
        assert isinstance(value, dict) and value["text"] == full_text
        assert context.variables == {"locale": "en"}
        raise RuntimeError("formatter changed")

    def load_formatter(ref: str) -> FormatterHandle:
        return FormatterHandle(good if ref.endswith(":good") else bad, "sha256-tested")

    response = present_batch(
        plan,
        FlowId("intake"),
        {"locale": "en"},
        fold,
        request_for(address, "input", "output"),
        load_formatter,
        lambda blob_id: encoded,
    )
    assert [result.status for result in response.results] == ["formatted", "error"]
    assert response.results[0].document is not None
    assert response.results[0].formatter_version == "sha256-tested"
    assert response.results[1].formatter == "standard_shop.formatters:bad"
    assert response.results[1].error == "formatter changed"
    assert seen[0][0] == {"text": "recorded input"}
    assert seen[0][1].variables == {"source": "recorded input"}
    assert seen[0][1].variants == {"tone": "calm"}
    assert seen[0][1].model == "provider:actual-model"


def test_missing_historical_input_is_unavailable_without_reconstruction() -> None:
    display = CompiledInferenceDisplay(input=formatter("standard_shop.formatters:good"))
    plan = with_display(plan_of("standard_shop"), "reply", display)
    address = node_address("reply")
    fold = RunFold(executions={address_key(address): ExecutionFold(address=address, kind=NodeKind.LLM)})
    response = present_batch(plan, FlowId("intake"), {}, fold, request_for(address, "input"), load_document, empty_blob)
    assert response.results[0].status == "unavailable"


def test_formatter_mutation_cannot_change_recorded_value_or_later_target() -> None:
    display = CompiledInferenceDisplay(output=formatter("standard_shop.formatters:mutate"))
    plan = with_display(plan_of("standard_shop"), "reply", display)
    address = node_address("reply")
    execution = ExecutionFold(address=address, kind=NodeKind.LLM)
    execution.output_ref = InlineValue(value={"text": "original"})
    fold = RunFold(executions={address_key(address): execution})
    seen: list[str] = []

    def mutate(value: JsonValue, context: PresentationContext) -> DisplayDocument:
        assert isinstance(value, dict)
        seen.append(cast(str, value["text"]))
        value["text"] = "changed"
        return document(value, context)

    response = present_batch(
        plan,
        FlowId("intake"),
        {},
        fold,
        request_for(address, "output", "output"),
        lambda ref: mutate,
        empty_blob,
    )
    assert [result.status for result in response.results] == ["formatted", "formatted"]
    assert seen == ["original", "original"]
    assert execution.output_ref.value == {"text": "original"}


def test_binary_blob_is_available_to_formatter_as_recorded_media_reference() -> None:
    blob = BlobValue(
        blob_id=BlobId("sha256-" + "b" * 64),
        sha256="b" * 64,
        size_bytes=42,
        media_type="image/png",
        preview="",
        truncated=False,
    )
    assert hydrate_ref(blob, empty_blob) == {
        "$media": "image/png",
        "blob_id": blob.blob_id,
        "size_bytes": 42,
        "name": None,
    }


def test_json_blob_mime_parameters_are_hydrated_as_complete_json() -> None:
    blob = BlobValue(
        blob_id=BlobId("sha256-" + "c" * 64),
        sha256="c" * 64,
        size_bytes=17,
        media_type="Application/Vnd.Example+Json; charset=utf-8",
        preview="truncated",
        truncated=True,
    )
    assert hydrate_ref(blob, lambda blob_id: b'{"text":"complete"}') == {"text": "complete"}


def test_media_document_rejects_incomplete_recorded_media_value() -> None:
    display = DisplayDocument(root=DisplaySection(children=(DisplayMedia(path="/image"),)))
    with pytest.raises(ValueError):
        validate_document(display, {"image": {"$media": "image/png", "blob_id": "sha256-" + "a" * 64}})


def test_current_formatter_loader_refreshes_changed_project_source(tmp_path: Path) -> None:
    root = tmp_path / "shop"
    root.mkdir()
    (root / "__init__.py").write_text("", encoding="utf-8")
    source = root / "formatters.py"
    source.write_text("def show(value, context):\n    return 'first'\n", encoding="utf-8")
    loader = CurrentFormatterLoader(CodeLoader(root))
    first = loader.load("shop.formatters:show")
    source.write_text("def show(value, context):\n    return 'second'\n", encoding="utf-8")
    second = loader.load("shop.formatters:show")
    assert first.function(None, None) == "first"
    assert second.function(None, None) == "second"
    assert first.version != second.version


def test_nested_llm_address_uses_historical_plan_node_without_capture_identity() -> None:
    display = CompiledInferenceDisplay(output=formatter("standard_shop.formatters:good"))
    plan = with_display(plan_of("standard_shop"), "redo", display)
    address = node_address("review__recheck__redo", iteration=0)
    execution = ExecutionFold(address=address, kind=NodeKind.LLM)
    execution.output_ref = InlineValue(value={"text": "nested reply"})
    fold = RunFold(executions={address_key(address): execution})
    response = present_batch(
        plan, FlowId("intake"), {}, fold, request_for(address, "output"), load_document, empty_blob
    )
    assert response.results[0].status == "formatted"


def test_called_flow_llm_address_resolves_through_call_prefix() -> None:
    display = CompiledInferenceDisplay(output=formatter("layout_shop.formatters:good"))
    plan = with_display(plan_of("layout_shop"), "reply", display)
    address = node_address("accept__reply")
    execution = ExecutionFold(address=address, kind=NodeKind.LLM)
    execution.output_ref = InlineValue(value={"text": "called reply"})
    fold = RunFold(executions={address_key(address): execution})
    response = present_batch(plan, FlowId("audit"), {}, fold, request_for(address, "output"), load_document, empty_blob)
    assert response.results[0].status == "formatted"


def test_facade_loads_historical_plan_by_run_hash(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    root = tmp_path / "standard_shop"
    shutil.copytree(Path(__file__).parents[1] / "fixtures" / "standard_shop", root)
    (root / "formatters.py").write_text(
        "from aqven.runtime.presentation import DisplayDocument, DisplayField, DisplaySection\n"
        "def good(value, context):\n"
        "    return DisplayDocument(root=DisplaySection(children=(DisplayField(label='Text', path='/text'),)))\n",
        encoding="utf-8",
    )
    display = CompiledInferenceDisplay(output=formatter("standard_shop.formatters:good"))
    plan = with_display(compile_root(root), "reply", display)
    address = node_address("reply")
    execution = ExecutionFold(address=address, kind=NodeKind.LLM)
    execution.output_ref = InlineValue(value={"text": "historical"})
    fold = RunFold(executions={address_key(address): execution})
    hashes: list[IrHash] = []

    def find(ir_hash: IrHash) -> CompiledProject:
        hashes.append(ir_hash)
        return plan

    async def view(self: DbosEngineFacade, run_id: RunId) -> RunRecordView:
        call = RunCall(ir_hash="historical-hash", flow_input={}, spec=RunSpec(flow_id=FlowId("intake")))
        return cast(RunRecordView, SimpleNamespace(call=call, fold=fold))

    monkeypatch.setattr(DbosEngineFacade, "_view", view)
    services = SimpleNamespace(loader=CodeLoader(root), blobs=SimpleNamespace(read=empty_blob))
    runtime = cast(EngineRuntime, SimpleNamespace(plans=SimpleNamespace(find=find), services=services))
    facade = DbosEngineFacade(runtime=runtime)
    response = asyncio.run(facade.present_run(RunId("run-1"), request_for(address, "output")))
    assert hashes == ["historical-hash"]
    assert response.results[0].status == "formatted"
    assert response.results[0].formatter_version is not None


def test_execution_none_payloads_suppresses_recorded_input(monkeypatch: pytest.MonkeyPatch) -> None:
    address = node_address("reply")
    execution = ExecutionFold(address=address, kind=NodeKind.LLM)
    execution.input_ref = InlineValue(value={"text": "a large private input"})
    execution.output_ref = InlineValue(value={"text": "output"})
    fold = RunFold(executions={address_key(address): execution})

    async def view(self: DbosEngineFacade, run_id: RunId) -> RunRecordView:
        call = RunCall(ir_hash="historical-hash", flow_input={}, spec=RunSpec(flow_id=FlowId("intake")))
        return cast(RunRecordView, SimpleNamespace(call=call, fold=fold))

    async def human_detail(self: DbosEngineFacade, run_id: RunId, selected: ExecutionAddress) -> HumanWaitDetail | None:
        return None

    def find_plan(ir_hash: IrHash) -> CompiledProject | None:
        return None

    monkeypatch.setattr(DbosEngineFacade, "_view", view)
    monkeypatch.setattr(DbosEngineFacade, "_human_detail", human_detail)
    facade = DbosEngineFacade(runtime=cast(EngineRuntime, SimpleNamespace(plans=SimpleNamespace(find=find_plan))))
    detail = asyncio.run(facade.get_execution(RunId("run-1"), address, "none"))
    assert detail.input_ref is None
    assert detail.output_ref is None


def test_execution_uses_current_schema_when_run_plan_is_missing(monkeypatch: pytest.MonkeyPatch) -> None:
    address = node_address("reply")
    plan = plan_of("standard_shop")
    fold = RunFold(executions={address_key(address): ExecutionFold(address=address, kind=NodeKind.LLM)})

    async def view(self: DbosEngineFacade, run_id: RunId) -> RunRecordView:
        call = RunCall(ir_hash="missing-historical-hash", flow_input={}, spec=RunSpec(flow_id=FlowId("intake")))
        return cast(RunRecordView, SimpleNamespace(call=call, fold=fold))

    async def human_detail(self: DbosEngineFacade, run_id: RunId, selected: ExecutionAddress) -> HumanWaitDetail | None:
        return None

    monkeypatch.setattr(DbosEngineFacade, "_view", view)
    monkeypatch.setattr(DbosEngineFacade, "_human_detail", human_detail)

    def missing_plan(ir_hash: IrHash) -> None:
        return None

    runtime = cast(EngineRuntime, SimpleNamespace(plans=SimpleNamespace(find=missing_plan)))
    source = SimpleNamespace(current=lambda: plan)
    facade = DbosEngineFacade(runtime=runtime, plan_source=cast(PlanSource, source))
    detail = asyncio.run(facade.get_execution(RunId("run-1"), address))
    assert detail.schema_source == "current"
    assert detail.input_schema is not None
    assert detail.output_schema is not None
