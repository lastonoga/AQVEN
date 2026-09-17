from collections.abc import Mapping
from typing import Final

from pydantic import TypeAdapter

from aqven.spec.agent import AgentSpec
from aqven.spec.evals import DatasetFile, EvalSpec
from aqven.spec.flow import FlowSpec
from aqven.spec.inference import InferenceSpec
from aqven.spec.mcp import McpServerSpec
from aqven.spec.names import SpecKind
from aqven.spec.nodes import NodeSpec
from aqven.spec.project import ProjectSpec
from aqven.spec.tool import ToolSpec
from aqven.spec.types import TypeSpec

type SpecDocument = (
    ProjectSpec
    | TypeSpec
    | FlowSpec
    | NodeSpec
    | DatasetFile
    | EvalSpec
    | InferenceSpec
    | AgentSpec
    | ToolSpec
    | McpServerSpec
)

SPEC_MODEL_BY_KIND: Final[Mapping[SpecKind, TypeAdapter[SpecDocument]]] = {
    SpecKind.PROJECT: TypeAdapter[SpecDocument](ProjectSpec),
    SpecKind.TYPE: TypeAdapter[SpecDocument](TypeSpec),
    SpecKind.FLOW: TypeAdapter[SpecDocument](FlowSpec),
    SpecKind.NODE: TypeAdapter[SpecDocument](NodeSpec),
    SpecKind.DATASET: TypeAdapter[SpecDocument](DatasetFile),
    SpecKind.EVAL: TypeAdapter[SpecDocument](EvalSpec),
    SpecKind.INFERENCE: TypeAdapter[SpecDocument](InferenceSpec),
    SpecKind.AGENT: TypeAdapter[SpecDocument](AgentSpec),
    SpecKind.TOOL: TypeAdapter[SpecDocument](ToolSpec),
    SpecKind.MCP_SERVER: TypeAdapter[SpecDocument](McpServerSpec),
}
