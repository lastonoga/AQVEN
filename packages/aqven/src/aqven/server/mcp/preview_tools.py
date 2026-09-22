import asyncio
from collections.abc import Mapping
from dataclasses import dataclass
from typing import Final

from aqven.compiler import CompileError, compile_project
from aqven.ir import CompiledProject
from aqven.loader import LoadedProject
from aqven.preview import (
    PreviewError,
    PreviewInputInvalid,
    PreviewNotFound,
    PromptPreview,
    PromptPreviewRequest,
    preview_prompt,
)
from aqven.server.errors import ApiErrorCode, ApiFailure, diagnostic_problem
from aqven.server.mcp.catalog import Operation, ToolHints, ToolRegistration
from aqven.server.mcp.project_source import ProjectSource

COMPILE_FAILED: Final = "the project does not compile: the prompt of a node cannot be built, run aqven_check"
FALLBACK_CODE: Final[ApiErrorCode] = "NOT_RUNNABLE"
PREVIEW_CODES: Final[Mapping[type[PreviewError], ApiErrorCode]] = {
    PreviewNotFound: "NOT_FOUND",
    PreviewInputInvalid: "INPUT_INVALID",
}
DESCRIPTION: Final = (
    "Exactly what an llm node sends to the model: instructions with the output limits, every message with "
    "fragments and the chosen prompt variants, the attachments, the tools and the resolved output.mode. "
    "Without input it fills sample values from the input schema; variants forces a prompt variant slot. "
    "Call it after editing a prompt, a fragment, a variant or the inference contract."
)


@dataclass(frozen=True, slots=True)
class PreviewTools:
    source: ProjectSource

    async def preview(self, request: PromptPreviewRequest) -> PromptPreview:
        loaded = await self.source.load()
        project = await asyncio.to_thread(_compiled, loaded)
        try:
            return preview_prompt(project, request)
        except PreviewError as error:
            raise _failure(error) from error

    def operations(self) -> tuple[ToolRegistration, ...]:
        return (
            Operation(
                name="prompt_preview",
                description=DESCRIPTION,
                input_model=PromptPreviewRequest,
                output_model=PromptPreview,
                surface="rest_and_mcp",
                hints=ToolHints(title="prompt preview", read_only=True, idempotent=True),
                use_case=self.preview,
            ),
        )


def _compiled(loaded: LoadedProject) -> CompiledProject:
    try:
        return compile_project(loaded)
    except CompileError as error:
        problems = tuple(diagnostic_problem(item) for item in error.diagnostics)
        raise ApiFailure("NOT_RUNNABLE", COMPILE_FAILED, problems=problems) from error


def _failure(error: PreviewError) -> ApiFailure:
    return ApiFailure(PREVIEW_CODES.get(type(error), FALLBACK_CODE), error.message)
