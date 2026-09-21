from pydantic import BaseModel, ConfigDict, Field

from aqven.spec.names import SecretRef


class SpecModel(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
        frozen=True,
        validate_by_alias=True,
        validate_by_name=False,
        serialize_by_alias=True,
        use_enum_values=False,
    )


class Limits(SpecModel):
    requests: int | None = Field(default=None, ge=1)
    tool_calls: int | None = Field(default=None, ge=0)
    tokens: int | None = Field(default=None, ge=1)
    usd_micros: int | None = Field(default=None, ge=0)
    seconds: int | None = Field(default=None, ge=1)


class SecretBinding(SpecModel):
    name: str
    ref: SecretRef


class Constraints(SpecModel):
    max_length: int | None = Field(default=None, alias="maxLength", ge=0)
    max_items: int | None = Field(default=None, alias="maxItems", ge=0)
    minimum: int | float | None = None
    maximum: int | float | None = None
    pattern: str | None = None
    enum: list[str] | None = Field(default=None, min_length=1)
