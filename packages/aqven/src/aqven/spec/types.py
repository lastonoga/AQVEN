from typing import Annotated, Literal

from pydantic import Field

from aqven.spec.common import Constraints, SpecModel
from aqven.spec.fields import FieldDecl
from aqven.spec.names import PiiClass

type ValueBase = Literal["Text", "Int", "Float", "Bool", "Date", "DateTime"]
type AllowedSetMode = Literal["dynamic", "none"]
type CodeFormat = Literal["prefixed_ordinal", "identity"]


class TypeHeader(SpecModel):
    api_version: Literal["aqven/v1"] = Field(alias="apiVersion")
    kind: Literal["Type"]


class EnumValue(SpecModel):
    value: str
    description: str = Field(min_length=1)


class RecordType(TypeHeader):
    type: Literal["record"]
    description: str = Field(min_length=1)
    pii: PiiClass = PiiClass.NONE
    fields: list[FieldDecl] = Field(min_length=1)


class EnumType(TypeHeader):
    type: Literal["enum"]
    description: str = Field(min_length=1)
    pii: PiiClass = PiiClass.NONE
    values: list[EnumValue] = Field(min_length=1)


class UnionVariant(SpecModel):
    name: str
    description: str = Field(min_length=1)
    fields: list[FieldDecl] = Field(default_factory=list[FieldDecl])


class UnionType(TypeHeader):
    type: Literal["union"]
    description: str = Field(min_length=1)
    pii: PiiClass = PiiClass.NONE
    discriminator: str
    variants: list[UnionVariant] = Field(min_length=1)


class IdType(TypeHeader):
    type: Literal["id"]
    description: str = Field(min_length=1)
    pii: PiiClass = PiiClass.NONE
    pattern: str | None = None
    max_length: int | None = Field(default=None, alias="maxLength", ge=1)
    allowed_set: AllowedSetMode = "none"
    code_format: CodeFormat | None = None


class ValueHead(TypeHeader):
    type: Literal["value"]
    description: str = Field(min_length=1)
    pii: PiiClass = PiiClass.NONE
    base: ValueBase


class ValueType(Constraints, ValueHead):
    pass


type TypeSpec = Annotated[RecordType | EnumType | UnionType | IdType | ValueType, Field(discriminator="type")]
