from typing import Annotated, Literal

from pydantic import Field, JsonValue

from aqven.spec.common import SpecModel
from aqven.spec.fields import FieldDecl, OutputField
from aqven.spec.names import PROMPT_REF_PATTERN, TEXT_SUFFIX, VARIANT_REF_PATTERN, CodeRef, OnFail, TypeId
from aqven.spec.policy import EvaluatorRef

type VariantRef = Annotated[str, Field(pattern=VARIANT_REF_PATTERN)]


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

    @property
    def prompt_code(self) -> CodeRef | None:
        return CodeRef(self.prompt) if self.prompt is not None and not self.prompt.endswith(TEXT_SUFFIX) else None

    @property
    def prompt_path(self) -> str | None:
        return self.prompt if self.prompt is not None and self.prompt.endswith(TEXT_SUFFIX) else None
