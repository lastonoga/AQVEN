import ast
import importlib
import importlib.util
from collections.abc import Callable, Mapping
from dataclasses import dataclass
from enum import StrEnum
from functools import cache
from pathlib import Path
from typing import Final

from pydantic_ai.models import Model

from aqven_llm.catalog import PROVIDERS, ClassRef, ProviderEntry
from aqven_llm.errors import ProviderNoStreaming, ProviderUnavailable, install_hint

type ModuleFinder = Callable[[str], bool]
type StreamProbe = Callable[[ClassRef], bool]

STREAM_METHOD: Final = "request_stream"
BASE_MODEL: Final = Model.__name__


class Readiness(StrEnum):
    READY = "ready"
    NO_STREAMING = "no_streaming"
    EXTRA_MISSING = "extra_missing"


@dataclass(frozen=True, slots=True)
class ProviderSupport:
    provider: str
    readiness: Readiness
    model_class: ClassRef
    extra: str | None = None

    @property
    def hint(self) -> str | None:
        return None if self.extra is None else install_hint(self.extra)


class NotAModelClass(TypeError):
    def __init__(self, ref: ClassRef) -> None:
        super().__init__(f"{ref.qualified} is not a pydantic_ai Model class")
        self.ref = ref


def module_available(module: str) -> bool:
    try:
        return importlib.util.find_spec(module) is not None
    except ModuleNotFoundError:
        return False


def imported_streams(ref: ClassRef) -> bool:
    loaded: object = getattr(importlib.import_module(ref.module), ref.name)
    if not isinstance(loaded, type) or Model not in loaded.__mro__:
        raise NotAModelClass(ref)
    method: object = getattr(loaded, STREAM_METHOD)
    return method is not Model.request_stream


def is_base_model(base: ast.expr) -> bool:
    match base:
        case ast.Subscript(value=ast.Name(id=name)) | ast.Name(id=name):
            return name == BASE_MODEL
        case _:
            return False


def defines_stream(node: ast.ClassDef) -> bool:
    return any(
        isinstance(item, ast.FunctionDef | ast.AsyncFunctionDef) and item.name == STREAM_METHOD for item in node.body
    )


def source_streams(ref: ClassRef) -> bool:
    spec = importlib.util.find_spec(ref.module)
    origin = None if spec is None else spec.origin
    if origin is None:
        return True
    tree = ast.parse(Path(origin).read_text(encoding="utf-8"))
    found = next((node for node in tree.body if isinstance(node, ast.ClassDef) and node.name == ref.name), None)
    if found is None or defines_stream(found):
        return True
    return not all(is_base_model(base) for base in found.bases)


@cache
def model_streams(ref: ClassRef) -> bool:
    try:
        return imported_streams(ref)
    except ImportError:
        return source_streams(ref)


def entry_support(
    entry: ProviderEntry, *, finder: ModuleFinder = module_available, streams: StreamProbe = model_streams
) -> ProviderSupport:
    if not streams(entry.model_class):
        return ProviderSupport(entry.name, Readiness.NO_STREAMING, entry.model_class)
    if entry.extra is not None and not finder(entry.extra.module):
        return ProviderSupport(entry.name, Readiness.EXTRA_MISSING, entry.model_class, entry.extra.name)
    return ProviderSupport(entry.name, Readiness.READY, entry.model_class)


def provider_support(
    provider: str,
    *,
    catalog: Mapping[str, ProviderEntry] = PROVIDERS,
    finder: ModuleFinder = module_available,
    streams: StreamProbe = model_streams,
) -> ProviderSupport | None:
    entry = catalog.get(provider)
    if entry is None:
        return None
    return entry_support(entry, finder=finder, streams=streams)


def raise_no_streaming(support: ProviderSupport) -> None:
    raise ProviderNoStreaming(support.provider, support.model_class.qualified)


def raise_extra_missing(support: ProviderSupport) -> None:
    raise ProviderUnavailable(support.provider, support.extra or support.provider)


def accept(_: ProviderSupport) -> None:
    return None


READINESS_GUARDS: Final[Mapping[Readiness, Callable[[ProviderSupport], None]]] = {
    Readiness.READY: accept,
    Readiness.NO_STREAMING: raise_no_streaming,
    Readiness.EXTRA_MISSING: raise_extra_missing,
}


def ensure_ready(
    entry: ProviderEntry, *, finder: ModuleFinder = module_available, streams: StreamProbe = model_streams
) -> ProviderEntry:
    support = entry_support(entry, finder=finder, streams=streams)
    READINESS_GUARDS[support.readiness](support)
    return entry
