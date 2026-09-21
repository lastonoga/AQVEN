from collections.abc import Iterator
from dataclasses import replace
from pathlib import Path

from pydantic import JsonValue

from aqven.engine.display_template import render_presentation_template
from aqven.runtime.address import ExecutionAddress
from aqven.runtime.presentation import (
    DisplayBadge,
    DisplayCard,
    DisplayDocument,
    DisplayElement,
    DisplayField,
    DisplayList,
    DisplayMedia,
    DisplaySection,
    DisplayText,
    PresentationContext,
    pointer_value,
)

TEMPLATES = Path(__file__).resolve().parents[1] / "lumen/flows/support_case/nodes/polish"


def elements(container: DisplaySection | DisplayCard | DisplayList) -> Iterator[DisplayElement]:
    for child in container.children:
        yield child
        if isinstance(child, (DisplaySection, DisplayCard, DisplayList)):
            yield from elements(child)


def paths(document: DisplayDocument) -> set[str]:
    return {
        node.path
        for node in elements(document.root)
        if isinstance(node, (DisplayText, DisplayField, DisplayBadge, DisplayMedia)) and node.path is not None
    }


def test_revise_formatter_groups_complete_input_and_output_in_cards() -> None:
    long_summary = "The Flow light strip flickers after installation. " * 12
    long_reply = "Disconnect the power, inspect the controller connector, and request a warranty replacement. " * 12
    long_rationale = "The previous answer omitted the safety step and claimed an unsupported refund. " * 10
    input_value: dict[str, JsonValue] = {
        "summary": long_summary,
        "customer": {
            "customer_id": "cust-1042",
            "display_name": "Alex Morgan",
            "email": "alex@example.test",
            "locale": "en-US",
            "tier": "plus",
        },
        "locale": "en",
        "channel": "amazon",
        "product": {
            "name": "Lumen Flow 5 m",
            "sku": "FLOW-5M",
            "category": "light_strip",
            "lamp_kind": "LED",
        },
        "resolution": {
            "action": "replace_controller",
            "summary": "Replace the controller under warranty after the safety check.",
            "policy": "controller_warranty",
            "credit": {"amount_minor": 500, "currency": "USD"},
        },
        "chunks": [
            {
                "chunk_id": f"kb_{index:04d}",
                "title": f"Policy passage {index + 1}",
                "text": f"Full source passage {index + 1}. " * 30,
            }
            for index in range(3)
        ],
        "previous": {
            "text": long_reply,
            "citations": [
                {"chunk_id": f"kb_{index:04d}", "quote": f"Full quotation {index + 1}. " * 10} for index in range(2)
            ],
        },
        "critique": {
            "score": 3,
            "rationale": long_rationale,
            "blocking": [
                "Mention the power safety step.",
                "Remove the unsupported refund promise.",
                "Preserve the warranty source citation.",
            ],
        },
    }
    output_value: dict[str, JsonValue] = {
        "reply": {
            "text": long_reply,
            "citations": [
                {"chunk_id": f"kb_{index:04d}", "quote": f"Complete source quotation {index + 1}. " * 12}
                for index in range(3)
            ],
        }
    }
    context = PresentationContext(
        side="input",
        input=input_value,
        output=output_value,
        variables={"locale": "en"},
        variants={},
        model=None,
        inference_id="revise",
        address=ExecutionAddress(node_id="polish", branch_key=None, iteration=None, item_index=None),
        locale="en",
    )

    input_document = render_presentation_template((TEMPLATES / "revise.input.display.liquid").read_text(), context)
    assert input_document.version == 1
    assert input_document.root.kind == "section"
    assert len(input_document.root.children) >= 5
    assert all(isinstance(child, DisplayCard) for child in input_document.root.children)
    input_paths = paths(input_document)
    assert len(input_paths) >= 25
    assert {
        "/summary",
        "/customer/email",
        "/product/sku",
        "/resolution/credit/amount_minor",
        "/chunks/2/text",
        "/previous/text",
        "/previous/citations/1/quote",
        "/critique/rationale",
        "/critique/blocking/2",
    } <= input_paths
    assert all(pointer_value(input_value, path) is not None for path in input_paths)
    assert pointer_value(input_value, "/summary") == long_summary
    assert pointer_value(input_value, "/critique/rationale") == long_rationale

    output_document = render_presentation_template(
        (TEMPLATES / "revise.output.display.liquid").read_text(), replace(context, side="output")
    )
    assert output_document.version == 1
    assert all(isinstance(child, DisplayCard) for child in output_document.root.children)
    output_paths = paths(output_document)
    assert len(output_paths) == 7
    assert "/reply/text" in output_paths
    assert "/reply/citations/2/quote" in output_paths
    assert all(pointer_value(output_value, path) is not None for path in output_paths)
    assert pointer_value(output_value, "/reply/text") == long_reply


def test_revise_input_formatter_omits_absent_optional_cards() -> None:
    input_value: dict[str, JsonValue] = {
        "summary": "The controller flickers.",
        "customer": {
            "customer_id": "cust-1",
            "display_name": "Alex",
            "email": "alex@example.test",
            "locale": "en",
            "tier": "standard",
        },
        "locale": "en",
        "channel": "web",
        "product": None,
        "resolution": {"action": "replace", "summary": "Replace controller.", "policy": "warranty", "credit": None},
        "chunks": [],
        "previous": None,
        "critique": None,
    }
    context = PresentationContext(
        side="input",
        input=input_value,
        output=None,
        variables={},
        variants={},
        model=None,
        inference_id="revise",
        address=ExecutionAddress(node_id="polish", branch_key=None, iteration=None, item_index=None),
        locale="en",
    )
    document = render_presentation_template((TEMPLATES / "revise.input.display.liquid").read_text(), context)

    card_titles = {child.title for child in document.root.children if isinstance(child, DisplayCard)}
    assert "Customer and case" in card_titles
    assert "Decision" in card_titles
    assert "Previous draft" not in card_titles
    assert "Review notes" not in card_titles
    assert all(pointer_value(input_value, path) is not None for path in paths(document))
