from typing import Self

from pydantic import Field, JsonValue, model_validator

from aqven.spec.common import SpecModel
from aqven.spec.names import NAME_PATTERN, AgentId, CodeRef, InferenceId


class PolicyRef(SpecModel):
    use: str | None = Field(default=None, pattern=NAME_PATTERN)
    run: CodeRef | None = None
    with_: dict[str, JsonValue] | None = Field(default=None, alias="with")

    @model_validator(mode="after")
    def _check_source(self) -> Self:
        if (self.use is None) == (self.run is None):
            raise ValueError("a policy sets exactly one of use (built-in) or run (module:function)")
        return self


class EvaluatorRef(SpecModel):
    use: str | None = Field(default=None, pattern=NAME_PATTERN)
    run: CodeRef | None = None
    inference: InferenceId | None = None
    agent: AgentId | None = None
    with_: dict[str, JsonValue] | None = Field(default=None, alias="with")

    @model_validator(mode="after")
    def _check_source(self) -> Self:
        sources = [source for source in (self.use, self.run, self.inference) if source is not None]
        if len(sources) != 1 or (self.inference is None) != (self.agent is None):
            raise ValueError("an evaluator sets exactly one of use, run, or a judge inference together with agent")
        if self.inference is not None and self.with_ is not None:
            raise ValueError(
                "a judge has no with: judge inputs bind by name to the in and out of the evaluated inference"
            )
        return self
