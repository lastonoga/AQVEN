import hashlib
from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass
from typing import Final, Protocol

from pydantic import BaseModel, JsonValue, TypeAdapter, ValidationError
from pydantic.fields import FieldInfo

from aqven.engine.llm.errors import LlmFailureCode, LlmNodeError
from aqven.ir import CompiledInference
from aqven.ir.hashing import canonical_json
from aqven.ports.execution import ExecutionScope
from aqven.runtime.address import JsonObject
from aqven.spec import FieldSpec, TypeId, dynamic_record, overridden_model

SCHEMA_HASH_PREFIX: Final = "sha256-"
FIELD_SPECS: Final[TypeAdapter[tuple[FieldSpec, ...]]] = TypeAdapter(tuple[FieldSpec, ...])

type RefRead = Callable[[str], JsonValue]


class TypeAnnotations(Protocol):
    def annotation(self, scope: ExecutionScope, type_id: TypeId) -> object: ...


def fields_json(fields: Sequence[FieldSpec]) -> JsonValue:
    return [field.model_dump(mode="json", by_alias=True, exclude_none=True) for field in fields]


def schema_hash(fields: Sequence[FieldSpec]) -> str:
    return f"{SCHEMA_HASH_PREFIX}{hashlib.sha256(canonical_json(fields_json(fields))).hexdigest()}"


@dataclass(frozen=True, slots=True)
class DynamicForms:
    forms: Mapping[str, tuple[FieldSpec, ...]]

    def wrap(self, document: JsonObject) -> JsonObject:
        wrapped = {
            name: {"value": document.get(name), "fields": fields_json(fields), "schema_hash": schema_hash(fields)}
            for name, fields in self.forms.items()
        }
        return {**document, **wrapped}


NO_DYNAMIC_FORMS: Final = DynamicForms({})


def dynamic_forms(inference: CompiledInference, read: RefRead) -> DynamicForms:
    try:
        forms = {
            output.name: FIELD_SPECS.validate_python(read(output.schema_from)) for output in inference.dynamic_outputs
        }
    except ValidationError as error:
        raise LlmNodeError(LlmFailureCode.INPUT_INVALID, f"cannot read the dynamic output shape: {error}") from error
    return DynamicForms(forms)


@dataclass(frozen=True, slots=True)
class DynamicShaper:
    annotations: TypeAnnotations | None

    def model(self, scope: ExecutionScope, base: type[BaseModel], forms: DynamicForms) -> type[BaseModel]:
        if not forms.forms:
            return base
        if self.annotations is None:
            raise LlmNodeError(LlmFailureCode.CODE_INVALID, "dynamic outputs need a project type source")
        resolver = ScopedTypes(self.annotations, scope)
        overrides: dict[str, tuple[object, FieldInfo]] = {
            name: (dynamic_record(f"{base.__name__}{_pascal(name)}", fields, resolver), base.model_fields[name])
            for name, fields in forms.forms.items()
        }
        return overridden_model(base, overrides)


@dataclass(frozen=True, slots=True)
class ScopedTypes:
    annotations: TypeAnnotations
    scope: ExecutionScope

    def __call__(self, type_id: TypeId) -> object:
        return self.annotations.annotation(self.scope, type_id)


def _pascal(name: str) -> str:
    return "".join(part.capitalize() for part in name.split("_"))
