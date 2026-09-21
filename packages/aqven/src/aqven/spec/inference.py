from typing import Annotated, Literal, Self

from pydantic import Field, JsonValue, model_validator

from aqven.spec.common import SpecModel
from aqven.spec.fields import FieldDecl, OutputField
from aqven.spec.names import (
    CODE_ALIAS_BODY,
    CODE_FILE_BODY,
    CODE_REF_BODY,
    FUNCTION_BODY,
    NAME_PATTERN,
    PROMPT_REF_PATTERN,
    REF_PATTERN,
    TEXT_SUFFIX,
    VARIANT_REF_PATTERN,
    CodeRef,
    OnFail,
    TypeId,
)
from aqven.spec.policy import EvaluatorRef

type VariantRef = Annotated[str, Field(pattern=VARIANT_REF_PATTERN)]
type DisplayVariableName = Annotated[str, Field(pattern=NAME_PATTERN)]
type DisplayVariableRef = Annotated[str, Field(pattern=REF_PATTERN)]
DISPLAY_RUN_PATTERN = f"^({CODE_REF_BODY}|{CODE_ALIAS_BODY}|{CODE_FILE_BODY}|{FUNCTION_BODY})$"
DISPLAY_TEMPLATE_PATTERN = (
    r"^(@root/|(?:\.\.?/)*)?"
    r"(?:[A-Za-z0-9_][A-Za-z0-9_.-]*/)*"
    r"[A-Za-z0-9_][A-Za-z0-9_.-]*\.display\.liquid$"
)


class DisplayFormatterSpec(SpecModel):
    run: str | None = Field(default=None, pattern=DISPLAY_RUN_PATTERN)
    template: str | None = Field(default=None, pattern=DISPLAY_TEMPLATE_PATTERN)
    variables: dict[DisplayVariableName, DisplayVariableRef] = Field(default_factory=dict)

    @model_validator(mode="after")
    def one_source(self) -> Self:
        if (self.run is None) == (self.template is None):
            raise ValueError("exactly one of run and template is required")
        return self


class InferenceDisplaySpec(SpecModel):
    input: DisplayFormatterSpec | None = None
    output: DisplayFormatterSpec | None = None


class AllowedSetSpec(SpecModel):
    type: TypeId
    from_: str = Field(alias="from")
    labels_from: str | None = None


class CheckSpec(EvaluatorRef):
    on_fail: OnFail
    threshold: float | None = None


class ExampleSpec(SpecModel):
    name: str
    in_: dict[str, JsonValue] = Field(alias="in")
    out: dict[str, JsonValue]


class VariantSlot(SpecModel):
    on: str
    cases: dict[str, VariantRef] = Field(min_length=1)
    default: VariantRef | None = None


class InferenceSpec(SpecModel):
    api_version: Literal["aqven/v1"] = Field(alias="apiVersion")
    kind: Literal["Inference"]
    description: str = Field(min_length=1)
    in_: list[FieldDecl] = Field(default_factory=list[FieldDecl], alias="in")
    out: list[OutputField] = Field(min_length=1)
    prompt: str | None = Field(default=None, pattern=PROMPT_REF_PATTERN)
    variants: dict[str, VariantSlot] | None = None
    allowed_sets: list[AllowedSetSpec] | None = None
    examples: list[ExampleSpec] | None = None
    checks: list[CheckSpec] | None = None
    display: InferenceDisplaySpec | None = None

    @property
    def prompt_code(self) -> CodeRef | None:
        return CodeRef(self.prompt) if self.prompt is not None and not self.prompt.endswith(TEXT_SUFFIX) else None

    @property
    def prompt_path(self) -> str | None:
        return self.prompt if self.prompt is not None and self.prompt.endswith(TEXT_SUFFIX) else None
