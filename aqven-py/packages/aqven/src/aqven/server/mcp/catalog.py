import inspect
import logging
from collections.abc import Awaitable, Callable, Mapping
from dataclasses import dataclass
from typing import Annotated, Final, Literal, Protocol

from mcp.server import MCPServer
from mcp_types import CallToolResult, TextContent, ToolAnnotations
from pydantic import BaseModel, ValidationError

from aqven.server.errors import ApiError, diagnostic_problem, translate, validation_problems
from aqven.write.errors import WriteError

type Surface = Literal["rest_and_mcp", "mcp_only"]
type ErrorTranslator = Callable[[Exception, str], ApiError]

LOGGER: Final = logging.getLogger("aqven.server.mcp")
REQUEST_INVALID_MESSAGE: Final = "tool arguments failed input validation"


@dataclass(frozen=True, slots=True)
class ToolHints:
    title: str
    read_only: bool
    destructive: bool = False
    idempotent: bool = False
    open_world: bool = False

    def annotations(self) -> ToolAnnotations:
        return ToolAnnotations(
            title=self.title,
            read_only_hint=self.read_only,
            destructive_hint=self.destructive,
            idempotent_hint=self.idempotent,
            open_world_hint=self.open_world,
        )


class ToolRegistration(Protocol):
    @property
    def name(self) -> str: ...

    def register_tool(self, server: MCPServer) -> None: ...


def tool_result(model: BaseModel, *, is_error: bool) -> CallToolResult:
    text = TextContent(type="text", text=model.model_dump_json(by_alias=True))
    structured = model.model_dump(mode="json", by_alias=True)
    return CallToolResult(content=[text], structured_content=structured, is_error=is_error)


def translated_error(error: Exception, op: str) -> ApiError:
    failure = translate(error)
    if failure.code == "INTERNAL":
        LOGGER.error("tool %s failed with %s", op, type(error).__name__, exc_info=error)
    return failure.error(op)


def write_error(error: Exception, op: str) -> ApiError:
    if not isinstance(error, WriteError):
        return translated_error(error, op)
    conflict = error.conflict.model_dump(mode="json", by_alias=True) if error.conflict is not None else None
    return ApiError(
        op=op,
        code=error.code,
        message=error.message,
        problems=tuple(diagnostic_problem(item) for item in error.problems),
        candidates=error.candidates,
        conflict=conflict,
        retry_after_ms=error.retry_after_ms,
    )


def validation_error(error: Exception, op: str) -> ApiError:
    if not isinstance(error, ValidationError):
        return translated_error(error, op)
    problems = validation_problems(error.errors(include_url=False, include_context=False, include_input=False))
    return ApiError(op=op, code="REQUEST_INVALID", message=REQUEST_INVALID_MESSAGE, problems=problems)


TRANSLATORS: Final[Mapping[type[Exception], ErrorTranslator]] = {
    WriteError: write_error,
    ValidationError: validation_error,
}


def tool_error(error: Exception, op: str) -> ApiError:
    translator = next(
        (TRANSLATORS[kind] for kind in type(error).__mro__ if kind in TRANSLATORS),
        translated_error,
    )
    return translator(error, op)


@dataclass(frozen=True, slots=True)
class Operation[I: BaseModel, O: BaseModel]:
    name: str
    description: str
    input_model: type[I]
    output_model: type[O]
    surface: Surface
    hints: ToolHints
    use_case: Callable[[I], Awaitable[O]]

    async def invoke(self, arguments: Mapping[str, object]) -> O:
        return await self.use_case(self.input_model.model_validate(dict(arguments)))

    def register_tool(self, server: MCPServer) -> None:
        server.add_tool(
            ToolCall(self),
            name=self.name,
            title=self.hints.title,
            description=self.description,
            annotations=self.hints.annotations(),
            structured_output=True,
        )


@dataclass(frozen=True, slots=True)
class ToolCall[I: BaseModel, O: BaseModel]:
    operation: Operation[I, O]

    @property
    def __name__(self) -> str:
        return self.operation.name

    @property
    def __signature__(self) -> inspect.Signature:
        returns = Annotated[CallToolResult, self.operation.output_model]
        return inspect.signature(self.operation.input_model).replace(return_annotation=returns)

    async def __call__(self, **arguments: object) -> CallToolResult:
        try:
            output = await self.operation.invoke(arguments)
        except Exception as error:
            return tool_result(tool_error(error, self.operation.name), is_error=True)
        return tool_result(output, is_error=False)
