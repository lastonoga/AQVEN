"""Public rendering helper for typed inference display templates."""

from collections.abc import Mapping

from aqven.engine.presentation import validate_document
from aqven.runtime.display_template import render_presentation_template as _render
from aqven.runtime.presentation import DisplayDocument, PresentationContext


def render_presentation_template(
    source: str,
    context: PresentationContext,
    templates: Mapping[str, str] | None = None,
    template_name: str | None = None,
) -> DisplayDocument:
    document = _render(source, context, templates, template_name)
    validate_document(document, context.input if context.side == "input" else context.output)
    return document
