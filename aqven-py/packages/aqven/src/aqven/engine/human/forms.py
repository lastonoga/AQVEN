from collections.abc import Callable, Mapping
from dataclasses import dataclass, field
from typing import Final, Protocol

from pydantic import BaseModel, Field, JsonValue, ValidationError

from aqven.runtime.address import JsonObject, Problem, RequestModel
from aqven.spec import TypeId

type ProblemPath = tuple[str | int, ...]


@dataclass(frozen=True, slots=True)
class FormAccepted:
    value: JsonValue


@dataclass(frozen=True, slots=True)
class FormRejected:
    problems: tuple[Problem, ...]


type FormVerdict = FormAccepted | FormRejected


class FormModel(Protocol):
    @property
    def type_id(self) -> TypeId: ...

    def json_schema(self) -> JsonObject: ...

    def check(self, payload: JsonValue) -> FormVerdict: ...


class FormRegistry(Protocol):
    def form(self, type_id: TypeId) -> FormModel: ...


def validation_problems(error: ValidationError, prefix: ProblemPath = ()) -> tuple[Problem, ...]:
    return tuple(
        Problem(path=(*prefix, *item["loc"]), code=item["type"], message=item["msg"]) for item in error.errors()
    )


def prefixed_problems(problems: tuple[Problem, ...], prefix: ProblemPath) -> tuple[Problem, ...]:
    return tuple(problem.model_copy(update={"path": (*prefix, *problem.path)}) for problem in problems)


@dataclass(frozen=True, slots=True)
class PydanticForm:
    type_id: TypeId
    model: type[BaseModel]

    def json_schema(self) -> JsonObject:
        return self.model.model_json_schema()

    def check(self, payload: JsonValue) -> FormVerdict:
        try:
            value = self.model.model_validate(payload)
        except ValidationError as error:
            return FormRejected(validation_problems(error))
        return FormAccepted(value.model_dump(mode="json", by_alias=True))


class ToolCallDecision(RequestModel):
    approve: bool
    message: str | None = None
    override_args: JsonObject | None = None


class ToolApprovalAnswer(RequestModel):
    approve: bool
    message: str | None = None
    calls: dict[str, ToolCallDecision] = Field(default_factory=dict[str, ToolCallDecision])


TOOL_APPROVAL_TYPE_ID: Final = TypeId("ToolApprovalAnswer")
TOOL_APPROVAL_FORM: Final = PydanticForm(TOOL_APPROVAL_TYPE_ID, ToolApprovalAnswer)
BUILTIN_FORMS: Final[Mapping[TypeId, FormModel]] = {TOOL_APPROVAL_TYPE_ID: TOOL_APPROVAL_FORM}


class UnknownForm(LookupError):
    def __init__(self, type_id: TypeId) -> None:
        super().__init__(f"form model {type_id} not found")
        self.type_id = type_id


@dataclass(frozen=True, slots=True)
class ModelFormRegistry:
    resolve: Callable[[TypeId], type[BaseModel]]
    builtins: Mapping[TypeId, FormModel] = field(default_factory=lambda: BUILTIN_FORMS)

    def form(self, type_id: TypeId) -> FormModel:
        builtin = self.builtins.get(type_id)
        if builtin is not None:
            return builtin
        return PydanticForm(type_id, self.resolve(type_id))


@dataclass(frozen=True, slots=True)
class ModelLookup:
    models: Mapping[TypeId, type[BaseModel]]

    def __call__(self, type_id: TypeId) -> type[BaseModel]:
        model = self.models.get(type_id)
        if model is None:
            raise UnknownForm(type_id)
        return model


def static_forms(models: Mapping[TypeId, type[BaseModel]]) -> ModelFormRegistry:
    return ModelFormRegistry(ModelLookup(models))
