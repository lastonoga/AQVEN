"""Render a node's output display template with example values for Studio."""

from typing import Literal

from pydantic import JsonValue

from aqven.engine.presentation import CurrentTemplateLoader, resolve_variables
from aqven.preview.samples import sample_document
from aqven.runtime.address import JsonObject, ResourceModel, node_address
from aqven.runtime.presentation import DisplayDocument, PresentationContext
from aqven.server.errors import ApiFailure, not_found
from aqven.server.views.nodes import node_detail
from aqven.server.workspace import WorkspaceState


class NodeDisplayPreview(ResourceModel):
    source: Literal["example", "schema"]
    example_name: str | None = None
    sample_output: JsonObject
    document: DisplayDocument


def _sample(schema: JsonValue) -> JsonObject:
    return sample_document(schema) if isinstance(schema, dict) else {}


def node_output_display_preview(state: WorkspaceState, flow_id: str, node_id: str) -> NodeDisplayPreview:
    detail = node_detail(state, flow_id, node_id)
    inference = detail.inference_spec
    formatter = None if inference is None or inference.display is None else inference.display.output
    source = detail.display_sources.get("output")
    if formatter is None or formatter.template is None or source is None or detail.inference is None:
        raise not_found(f"node {node_id} has no output display template")
    try:
        template = CurrentTemplateLoader(state.root).load(source.path)
    except Exception as error:
        raise ApiFailure("NOT_RUNNABLE", f"output display template cannot be loaded: {error}") from error

    candidates: list[tuple[JsonObject, JsonObject, Literal["example", "schema"], str | None]] = [
        (example.in_, example.out, "example", example.name) for example in inference.examples or []
    ]
    candidates.append((_sample(detail.in_schema), _sample(detail.out_schema), "schema", None))
    last_error: Exception | None = None
    for input_value, output_value, sample_source, name in candidates:
        try:
            selected_locale = input_value.get("locale")
            context = PresentationContext(
                side="output",
                input=input_value,
                output=output_value,
                variables=resolve_variables(formatter.variables, input_value, output_value, {}),
                variants={},
                model=None,
                inference_id=detail.inference,
                address=node_address(node_id),
                locale=selected_locale if isinstance(selected_locale, str) else "en",
            )
            return NodeDisplayPreview(
                source=sample_source,
                example_name=name,
                sample_output=output_value,
                document=template.program.render(context),
            )
        except Exception as error:
            last_error = error
    raise ApiFailure("NOT_RUNNABLE", f"output display template cannot render an example: {last_error}")
