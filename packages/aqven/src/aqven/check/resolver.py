import importlib
import importlib.util
import pkgutil
import re
import sys
from collections.abc import Generator
from contextlib import contextmanager
from dataclasses import dataclass, field
from pathlib import Path
from types import ModuleType
from typing import Final

from aqven.loader import code_file_parts
from aqven.spec import CODE_FILE_PATTERN

BUILDER_MODULE_PREFIX: Final = "aqven_builder_"
FILE_MODULE_SEPARATOR: Final = ":"
CODE_FILE: Final = re.compile(CODE_FILE_PATTERN)


@dataclass(frozen=True, slots=True)
class CodeTarget:
    ref: str
    value: object


@dataclass(frozen=True, slots=True)
class CodeFailure:
    ref: str
    message: str
    missing: bool = False


type CodeResolution = CodeTarget | CodeFailure


@dataclass(slots=True)
class CodeResolver:
    root: Path
    cache: dict[str, CodeResolution] = field(default_factory=dict[str, CodeResolution])

    @property
    def package(self) -> str:
        return self.root.name

    @contextmanager
    def session(self) -> Generator[None]:
        saved = {name: module for name, module in sys.modules.items() if self._owned(name)}
        for name in saved:
            del sys.modules[name]
        search_path = str(self.root.parent)
        sys.path.insert(0, search_path)
        importlib.invalidate_caches()
        try:
            yield
        finally:
            self._restore(saved, search_path)

    def resolve(self, ref: str) -> CodeResolution:
        if ref not in self.cache:
            self.cache[ref] = self._resolve(ref)
        return self.cache[ref]

    def load_builder(self, relative: str) -> ModuleType | CodeFailure:
        path = self.root / relative
        name = f"{BUILDER_MODULE_PREFIX}{path.parent.name}"
        spec = importlib.util.spec_from_file_location(name, path)
        if spec is None or spec.loader is None:
            return CodeFailure(relative, "builder file does not load as a Python module")
        module = importlib.util.module_from_spec(spec)
        sys.modules[name] = module
        try:
            spec.loader.exec_module(module)
        except Exception as error:
            return CodeFailure(relative, f"{type(error).__name__}: {error}")
        finally:
            sys.modules.pop(name, None)
        return module

    def _resolve(self, ref: str) -> CodeResolution:
        try:
            return CodeTarget(ref, self._value(ref))
        except Exception as error:
            return CodeFailure(ref, f"{type(error).__name__}: {error}", _missing(ref, error))

    def _value(self, ref: str) -> object:
        if CODE_FILE.fullmatch(ref) is None:
            return pkgutil.resolve_name(ref)
        path, function = code_file_parts(ref)
        return getattr(self._file_module(path), function)

    def _file_module(self, relative: str) -> ModuleType:
        name = f"{self.package}{FILE_MODULE_SEPARATOR}{relative}"
        loaded = sys.modules.get(name)
        if loaded is not None:
            return loaded
        location = self.root / relative
        if not location.is_file():
            raise FileNotFoundError(f"file {relative} does not exist in the project")
        spec = importlib.util.spec_from_file_location(name, location)
        if spec is None or spec.loader is None:
            raise ImportError(f"file {relative} does not load as a Python module")
        module = importlib.util.module_from_spec(spec)
        sys.modules[name] = module
        try:
            spec.loader.exec_module(module)
        except Exception:
            sys.modules.pop(name, None)
            raise
        return module

    def _owned(self, name: str) -> bool:
        return name == self.package or name.startswith((f"{self.package}.", f"{self.package}{FILE_MODULE_SEPARATOR}"))

    def _restore(self, saved: dict[str, ModuleType], search_path: str) -> None:
        for name in [name for name in sys.modules if self._owned(name)]:
            del sys.modules[name]
        sys.modules.update(saved)
        if search_path in sys.path:
            sys.path.remove(search_path)
        importlib.invalidate_caches()


def _missing(ref: str, error: Exception) -> bool:
    if isinstance(error, AttributeError | FileNotFoundError):
        return True
    module = ref.partition(":")[0]
    return isinstance(error, ModuleNotFoundError) and f"{module}.".startswith(f"{error.name}.")
