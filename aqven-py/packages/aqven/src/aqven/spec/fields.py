from typing import Self

from pydantic import Field, JsonValue, model_validator

from aqven.spec.builtins import DynamicLimits
from aqven.spec.common import Constraints, SpecModel

SOURCE_FIELDS = frozenset({"from_", "value"})


class FieldHead(SpecModel):
    name: str
    type: str
    description: str = Field(min_length=1)


class FieldDecl(Constraints, FieldHead):
    pass


class InputField(FieldDecl):
    from_: str | None = Field(default=None, alias="from")
    value: JsonValue = None

    @model_validator(mode="after")
    def _check_source(self) -> Self:
        _require_one_source(self.model_fields_set)
        return self


class OutputField(FieldDecl):
    schema_from: str | None = None
    limits: DynamicLimits | None = None


class BoundField(FieldDecl):
    from_: str = Field(alias="from")


class FieldBinding(SpecModel):
    name: str
    from_: str | None = Field(default=None, alias="from")
    value: JsonValue = None

    @model_validator(mode="after")
    def _check_source(self) -> Self:
        _require_one_source(self.model_fields_set)
        return self


def _require_one_source(fields_set: set[str]) -> None:
    if len(SOURCE_FIELDS & fields_set) != 1:
        raise ValueError("exactly one value source is required: from (reference) or value (literal)")
