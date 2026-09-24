from typing import Annotated, Final, Literal

from pydantic import BaseModel, ConfigDict, Field, JsonValue

from aqven.spec import (
    CODE_REF_PATTERN,
    NAME_PATTERN,
    REF_PATTERN,
    TYPE_REF_PATTERN,
    AgentId,
    CodeRef,
    DynamicLimits,
    InferenceId,
    OnFail,
)

IR_VERSION: Final = "aqven/ir/v1"

type JsonSchema = dict[str, JsonValue]
type JsonParams = dict[str, JsonValue]
type AbsoluteCodeRef = Annotated[CodeRef, Field(pattern=CODE_REF_PATTERN)]
type RefText = Annotated[str, Field(pattern=REF_PATTERN)]
type TypeRefText = Annotated[str, Field(pattern=TYPE_REF_PATTERN)]
type PolicyName = Annotated[str, Field(pattern=NAME_PATTERN)]
type FieldName = Annotated[str, Field(pattern=NAME_PATTERN)]


class IrModel(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
        frozen=True,
        validate_by_alias=True,
        validate_by_name=True,
        serialize_by_alias=True,
    )


class RefBinding(IrModel):
    kind: Literal["ref"] = "ref"
    name: FieldName
    ref: RefText


class LiteralBinding(IrModel):
    kind: Literal["literal"] = "literal"
    name: FieldName
    value: JsonValue


type CompiledBinding = Annotated[RefBinding | LiteralBinding, Field(discriminator="kind")]


class BuiltinPolicy(IrModel):
    kind: Literal["builtin"] = "builtin"
    use: PolicyName
    params: JsonParams = Field(default_factory=dict[str, JsonValue])


class CodePolicy(IrModel):
    kind: Literal["code"] = "code"
    run: AbsoluteCodeRef
    params: JsonParams = Field(default_factory=dict[str, JsonValue])


type CompiledPolicy = Annotated[BuiltinPolicy | CodePolicy, Field(discriminator="kind")]


class BuiltinEvaluator(IrModel):
    kind: Literal["builtin"] = "builtin"
    use: PolicyName
    params: JsonParams = Field(default_factory=dict[str, JsonValue])


class CodeEvaluator(IrModel):
    kind: Literal["code"] = "code"
    run: AbsoluteCodeRef
    params: JsonParams = Field(default_factory=dict[str, JsonValue])


class JudgeEvaluator(IrModel):
    kind: Literal["judge"] = "judge"
    inference: InferenceId
    agent: AgentId


type CompiledEvaluator = Annotated[
    BuiltinEvaluator | CodeEvaluator | JudgeEvaluator,
    Field(discriminator="kind"),
]


class CompiledCheck(IrModel):
    name: Annotated[str, Field(min_length=1)]
    evaluator: CompiledEvaluator
    on_fail: OnFail
    threshold: float | None = None


class FieldIr(IrModel):
    name: FieldName
    type: TypeRefText
    description: Annotated[str, Field(min_length=1)]


class DynamicOutput(IrModel):
    name: FieldName
    schema_from: RefText
    limits: DynamicLimits
