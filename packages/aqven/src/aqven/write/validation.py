import shutil
import tempfile
import threading
from collections.abc import Mapping
from dataclasses import dataclass, field
from pathlib import Path
from typing import Final, Protocol

from aqven.check import check_project
from aqven.codegen import GENERATED_TYPES, generate_types
from aqven.diagnostics import Diagnostic, DiagnosticCode, Severity
from aqven.loader import file_hash, project_files
from aqven.write.paths import disk_tree, tree_hash

SHADOW_PREFIX: Final = "aqven-write-"

ADVISORY_CODES: Final = frozenset(
    {
        DiagnosticCode.E_PROMPT_SYNTAX,
        DiagnosticCode.E_PROMPT_TAG_FORBIDDEN,
        DiagnosticCode.E_PROMPT_FILTER_FORBIDDEN,
        DiagnosticCode.E_PROMPT_MESSAGE_NESTED,
        DiagnosticCode.E_PROMPT_VARIABLE_UNDECLARED,
        DiagnosticCode.E_PROMPT_INPUT_UNUSED,
        DiagnosticCode.E_PROMPT_OUTPUT_FORMAT,
        DiagnosticCode.E_PROMPT_CASE_NOT_EXHAUSTIVE,
        DiagnosticCode.E_PROMPT_MEDIA_RENDERED,
        DiagnosticCode.E_VARIANT_NOT_EXHAUSTIVE,
        DiagnosticCode.E_INPUT_UNBOUND,
    }
)

type DiagnosticKey = tuple[str, str, tuple[str | int, ...], str]


@dataclass(frozen=True, slots=True)
class Validation:
    problems: tuple[Diagnostic, ...]
    blocking: tuple[Diagnostic, ...]
    derived: Mapping[str, bytes]


class TreeValidator(Protocol):
    def validate(self, root: Path, changes: Mapping[str, bytes | None]) -> Validation: ...


def is_blocking(item: Diagnostic) -> bool:
    return item.severity is Severity.ERROR and item.code not in ADVISORY_CODES


def diagnostic_key(item: Diagnostic) -> DiagnosticKey:
    return (item.code.value, item.file, item.path, item.message)


@dataclass(frozen=True, slots=True)
class _Checked:
    diagnostics: tuple[Diagnostic, ...]
    generated: bytes | None


@dataclass(slots=True)
class ShadowCheckValidator:
    baseline: dict[str, frozenset[DiagnosticKey]] = field(default_factory=dict[str, frozenset[DiagnosticKey]])
    guard: threading.Lock = field(default_factory=threading.Lock)

    def validate(self, root: Path, changes: Mapping[str, bytes | None]) -> Validation:
        disk = disk_tree(root)
        state = tree_hash(disk)
        before = self._baseline(root, state)
        checked = _shadow_check(root, changes)
        derived = _derived(root, checked.generated)
        after = frozenset(diagnostic_key(item) for item in checked.diagnostics)
        with self.guard:
            self.baseline = {state: before, tree_hash(_planned_tree(disk, {**changes, **derived})): after}
        fresh = tuple(item for item in checked.diagnostics if diagnostic_key(item) not in before)
        return Validation(problems=fresh, blocking=tuple(item for item in fresh if is_blocking(item)), derived=derived)

    def _baseline(self, root: Path, state: str) -> frozenset[DiagnosticKey]:
        with self.guard:
            cached = self.baseline.get(state)
        if cached is not None:
            return cached
        return frozenset(diagnostic_key(item) for item in _shadow_check(root, {}).diagnostics)


def _planned_tree(disk: Mapping[str, str], planned: Mapping[str, bytes | None]) -> dict[str, str]:
    removed = {path for path, data in planned.items() if data is None}
    written = {path: file_hash(data) for path, data in planned.items() if data is not None}
    return {**{path: digest for path, digest in disk.items() if path not in removed}, **written}


def _shadow_check(root: Path, changes: Mapping[str, bytes | None]) -> _Checked:
    with tempfile.TemporaryDirectory(prefix=SHADOW_PREFIX) as folder:
        shadow = Path(folder) / root.name
        _copy_tree(root, shadow)
        _apply(shadow, changes)
        generate_types(shadow)
        report = check_project(shadow)
        generated = shadow / GENERATED_TYPES
        return _Checked(report.diagnostics, generated.read_bytes() if generated.is_file() else None)


def _copy_tree(root: Path, shadow: Path) -> None:
    for relative in project_files(root):
        target = shadow / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(root / relative, target)
    shadow.mkdir(parents=True, exist_ok=True)


def _apply(shadow: Path, changes: Mapping[str, bytes | None]) -> None:
    for relative, data in changes.items():
        target = shadow / relative
        if data is None:
            target.unlink(missing_ok=True)
            continue
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)


def _derived(root: Path, generated: bytes | None) -> Mapping[str, bytes]:
    if generated is None:
        return {}
    current = root / GENERATED_TYPES
    if current.is_file() and current.read_bytes() == generated:
        return {}
    return {GENERATED_TYPES: generated}
