from collections.abc import Callable
from typing import Final, Literal, Self

from pydantic import Field, model_validator

from aqven.spec.common import SecretBinding, SpecModel
from aqven.spec.fields import FieldDecl, OutputField
from aqven.spec.names import CodeRef, Effect, McpServerId

MCP_FORBIDDEN_KEYS: Final = frozenset({"wait", "in_", "out"})


class McpToolSource(SpecModel):
    server: McpServerId
    tool: str = Field(min_length=1)


class JobWaitSpec(SpecModel):
    poll: CodeRef
    interval_seconds: int = Field(ge=1)
    timeout_seconds: int = Field(ge=1)


class ToolSpec(SpecModel):
    api_version: Literal["aqven/v1"] = Field(alias="apiVersion")
    kind: Literal["Tool"]
    description: str = Field(min_length=1)
    run: CodeRef | None = None
    mcp: McpToolSource | None = None
    effect: Effect
    idempotency_key: list[str] | None = None
    secrets: list[SecretBinding] | None = None
    wait: JobWaitSpec | None = None
    in_: list[FieldDecl] = Field(default_factory=list[FieldDecl], alias="in")
    out: list[OutputField] = Field(default_factory=list[OutputField])

    @model_validator(mode="after")
    def _check_source(self) -> Self:
        problems = [message for broken, message in TOOL_SOURCE_RULES if broken(self)]
        if problems:
            raise ValueError("; ".join(problems))
        return self


def _not_one_source(spec: ToolSpec) -> bool:
    return (spec.run is None) == (spec.mcp is None)


def _run_without_out(spec: ToolSpec) -> bool:
    return spec.run is not None and not spec.out


def _mcp_with_schema(spec: ToolSpec) -> bool:
    return spec.mcp is not None and bool(MCP_FORBIDDEN_KEYS & spec.model_fields_set)


TOOL_SOURCE_RULES: Final[tuple[tuple[Callable[[ToolSpec], bool], str], ...]] = (
    (_not_one_source, "a tool has exactly one source: run (code) or mcp {server, tool}"),
    (_run_without_out, "a tool with run declares out with at least one field"),
    (_mcp_with_schema, "an MCP tool has no wait, in or out: the MCP server provides the schema"),
)
