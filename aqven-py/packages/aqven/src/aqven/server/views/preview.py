from collections.abc import Mapping
from typing import Final

from aqven.compiler import CompileError, compile_project
from aqven.ir import CompiledProject
from aqven.preview import (
    PreviewError,
    PreviewInputInvalid,
    PreviewNotFound,
    PreviewRenderFailed,
    PromptPreview,
    PromptPreviewRequest,
    preview_prompt,
)
from aqven.runtime.address import JsonObject, RequestModel
from aqven.server.errors import ApiErrorCode, ApiFailure, diagnostic_problem
from aqven.server.workspace import WorkspaceState
from aqven.spec import FlowId, NodeId

FALLBACK_CODE: Final[ApiErrorCode] = "NOT_RUNNABLE"
PREVIEW_CODES: Final[Mapping[type[PreviewError], ApiErrorCode]] = {
    PreviewNotFound: "NOT_FOUND",
    PreviewInputInvalid: "INPUT_INVALID",
    PreviewRenderFailed: "NOT_RUNNABLE",
}
BLOCKED_MESSAGE: Final = "working copy has errors: the prompt of a node cannot be built"
COMPILE_FAILED: Final = "the project does not compile: the prompt of a node cannot be built"


class PromptPreviewBody(RequestModel):
    input: JsonObject | None = None
    variants: Mapping[str, str] | None = None


def compiled_project(state: WorkspaceState) -> CompiledProject:
    compiled = state.compiled
    if compiled is not None:
        return compiled
    if not state.report.ok:
        problems = tuple(diagnostic_problem(item) for item in state.report.errors)
        raise ApiFailure("NOT_RUNNABLE", BLOCKED_MESSAGE, problems=problems)
    try:
        return compile_project(state.report)
    except CompileError as error:
        problems = tuple(diagnostic_problem(item) for item in error.diagnostics)
        raise ApiFailure("NOT_RUNNABLE", COMPILE_FAILED, problems=problems) from error


def prompt_preview(state: WorkspaceState, flow_id: str, node_id: str, body: PromptPreviewBody) -> PromptPreview:
    project = compiled_project(state)
    request = PromptPreviewRequest(
        flow_id=FlowId(flow_id),
        node_id=NodeId(node_id),
        input=body.input,
        variants=body.variants,
    )
    try:
        return preview_prompt(project, request)
    except PreviewError as error:
        raise _failure(error) from error


def _failure(error: PreviewError) -> ApiFailure:
    return ApiFailure(PREVIEW_CODES.get(type(error), FALLBACK_CODE), error.message)
