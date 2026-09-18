from dataclasses import replace
from pathlib import Path

from pydantic import JsonValue

from aqven.engine.display_template import render_presentation_template
from aqven.runtime.address import ExecutionAddress
from aqven.runtime.presentation import (
    DisplayCard,
    DisplayField,
    DisplayMedia,
    DisplayText,
    PresentationContext,
    pointer_value,
)

TEMPLATES = Path(__file__).resolve().parents[1] / "lumen/flows/support_case/nodes/illustrate"


def test_illustration_formatter_groups_full_brief_and_media_in_cards() -> None:
    image: dict[str, JsonValue] = {
        "$media": "image/png",
        "blob_id": "sha256-" + "0" * 64,
        "size_bytes": 2_048_000,
        "name": "installation.png",
    }
    output: dict[str, JsonValue] = {"image": image}
    context = PresentationContext(
        side="output",
        input=None,
        output=output,
        variables={},
        variants={},
        model="openrouter:example",
        inference_id="illustrate",
        address=ExecutionAddress(node_id="illustrate", branch_key=None, iteration=None, item_index=None),
        locale="en",
    )

    document = render_presentation_template((TEMPLATES / "illustrate.output.display.liquid").read_text(), context)

    assert len(document.root.children) == 1
    image_card = document.root.children[0]
    assert isinstance(image_card, DisplayCard)
    media = image_card.children[0]
    assert isinstance(media, DisplayMedia)
    assert media.path == "/image"
    assert pointer_value(output, media.path) == image

    long_brief = "Show the complete controller connection, power supply, and LED strip in one scene. " * 15
    input_value: dict[str, JsonValue] = {
        "text": long_brief,
        "category": "light_strip",
        "photo": image,
    }
    input_document = render_presentation_template(
        (TEMPLATES / "illustrate.input.display.liquid").read_text(),
        replace(context, side="input", input=input_value),
    )
    assert len(input_document.root.children) == 2
    assert all(isinstance(child, DisplayCard) for child in input_document.root.children)
    brief_card, photo_card = input_document.root.children
    assert isinstance(brief_card, DisplayCard)
    assert isinstance(photo_card, DisplayCard)
    assert any(isinstance(child, DisplayField) and child.path == "/category" for child in brief_card.children)
    assert any(isinstance(child, DisplayText) and child.path == "/text" for child in brief_card.children)
    assert pointer_value(input_value, "/text") == long_brief
    photo = photo_card.children[0]
    assert isinstance(photo, DisplayMedia)
    assert photo.path == "/photo"
    assert pointer_value(input_value, photo.path) == image

    without_photo = render_presentation_template(
        (TEMPLATES / "illustrate.input.display.liquid").read_text(),
        replace(context, side="input", input={**input_value, "photo": None}),
    )
    assert len(without_photo.root.children) == 1
    assert isinstance(without_photo.root.children[0], DisplayCard)
