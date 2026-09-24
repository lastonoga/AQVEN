import importlib
import inspect
import sys
from collections.abc import Callable, Mapping
from dataclasses import dataclass
from pathlib import Path
from types import ModuleType
from typing import Final, get_type_hints

from pydantic import BaseModel, JsonValue, TypeAdapter
from pydantic_core import to_jsonable_python

from aqven.codegen import GENERATED_MODULE
from aqven.engine.code_freshness import PROJECT_CODE
from aqven.engine.errors import CodeLoadError, CodeSignatureError
from aqven.runtime.address import JsonObject
from aqven.spec import BUILTIN_ANNOTATIONS, parse_type_ref
from aqven.spec.modelgen import shaped_annotation

REF_SEPARATOR: Final = ":"
MODULE_SEPARATOR: Final = "."
PACKAGE_INIT: Final = "__init__.py"
PYTHON_SUFFIX: Final = ".py"
RETURN_HINT: Final = "return"

type CodeFunction = Callable[..., object]


@dataclass(frozen=True, slots=True)
class CodeLoader:
    root: Path

    @property
    def search_path(self) -> Path:
        return self.root.parent.resolve()

    def function(self, ref: str) -> CodeFunction:
        module_name, _, attribute = ref.partition(REF_SEPARATOR)
        if not module_name or not attribute:
            raise CodeLoadError(ref, "expected a module:function reference")
        value = getattr(self.module(module_name, ref), attribute, None)
        if value is None or not callable(value):
            raise CodeLoadError(ref, f"module {module_name} has no function {attribute}")
        return value

    def module(self, module_name: str, ref: str) -> ModuleType:
        expected = self.module_file(module_name)
        if expected is None:
            raise CodeLoadError(ref, f"module {module_name} is not in the project directory {self.root}")
        PROJECT_CODE.refresh(self.root)
        self._ensure_search_path()
        try:
            module = importlib.import_module(module_name)
        except Exception as error:
            raise CodeLoadError(ref, f"{type(error).__name__}: {error}") from error
        loaded = getattr(module, "__file__", None)
        if loaded is None or Path(loaded).resolve() != expected.resolve():
            raise CodeLoadError(ref, f"module {module_name} was not loaded from {expected}")
        return module

    def module_file(self, module_name: str) -> Path | None:
        base = self.search_path.joinpath(*module_name.split(MODULE_SEPARATOR))
        candidates = (base.with_suffix(PYTHON_SUFFIX), base / PACKAGE_INIT)
        return next((candidate for candidate in candidates if candidate.is_file()), None)

    def type_annotation(self, package: str, type_ref: str) -> object:
        ref = parse_type_ref(type_ref)
        builtin = BUILTIN_ANNOTATIONS.get(ref.type_id)
        item = builtin if builtin is not None else self._generated_type(package, ref.type_id)
        return shaped_annotation(item, ref, None)

    def _generated_type(self, package: str, type_id: str) -> object:
        module_name = f"{package}{MODULE_SEPARATOR}{GENERATED_MODULE}"
        value: object = getattr(self.module(module_name, f"{module_name}:{type_id}"), type_id, None)
        if value is None:
            raise CodeLoadError(f"{module_name}:{type_id}", "type is not generated: run aqven generate")
        return value

    def _ensure_search_path(self) -> None:
        location = str(self.search_path)
        if sys.path[:1] == [location]:
            return
        if location in sys.path:
            sys.path.remove(location)
        sys.path.insert(0, location)
        importlib.invalidate_caches()


def type_hints(function: CodeFunction, ref: str) -> Mapping[str, object]:
    try:
        return get_type_hints(function, include_extras=True)
    except Exception as error:
        raise CodeSignatureError(ref, f"cannot evaluate annotations: {error}") from error


def parameter_names(function: CodeFunction, skip: int) -> tuple[str, ...]:
    return tuple(inspect.signature(function).parameters)[skip:]


def typed_arguments(function: CodeFunction, ref: str, inputs: JsonObject, *, skip: int) -> dict[str, object]:
    hints = type_hints(function, ref)
    names = parameter_names(function, skip)
    unknown = sorted(set(inputs) - set(names))
    if unknown:
        raise CodeSignatureError(ref, f"inputs {', '.join(unknown)} do not match parameters {', '.join(names)}")
    return {name: _validated(hints.get(name), inputs.get(name)) for name in names}


def json_result(function: CodeFunction, ref: str, value: object) -> JsonValue:
    hint = type_hints(function, ref).get(RETURN_HINT)
    if hint is None:
        return plain_json(value)
    adapter: TypeAdapter[object] = TypeAdapter(hint)
    validated = adapter.validate_python(value)
    payload: JsonValue = adapter.dump_python(validated, mode="json", by_alias=True)
    return payload


def plain_json(value: object) -> JsonValue:
    if isinstance(value, BaseModel):
        return value.model_dump(mode="json", by_alias=True)
    converted: JsonValue = to_jsonable_python(value, by_alias=True)
    return converted


def _validated(hint: object | None, value: JsonValue) -> object:
    if hint is None:
        return value
    adapter: TypeAdapter[object] = TypeAdapter(hint)
    return adapter.validate_python(value)
