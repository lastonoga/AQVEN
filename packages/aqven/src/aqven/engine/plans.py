import os
import re
import tempfile
from collections import OrderedDict
from dataclasses import dataclass, field
from pathlib import Path
from typing import Final

from pydantic import JsonValue, TypeAdapter, ValidationError

from aqven.ir import IR_HASH_PATTERN, CompiledProject, HashDomain, IrHash, hash_of, project_hash

PLAN_SUFFIX: Final = ".json"
PLAN_CACHE_CAPACITY: Final = 32
IR_HASH: Final = re.compile(IR_HASH_PATTERN)
STORED_DOCUMENT: Final[TypeAdapter[JsonValue]] = TypeAdapter(JsonValue)

type PlanStamp = tuple[int, int] | None


class PlanMissing(LookupError):
    def __init__(self, ir_hash: str) -> None:
        super().__init__(f"plan snapshot {ir_hash} is not in the plan store")
        self.ir_hash = ir_hash


@dataclass(frozen=True, slots=True)
class PlanStore:
    directory: Path

    def path_of(self, ir_hash: IrHash) -> Path:
        return self.directory / f"{ir_hash}{PLAN_SUFFIX}"

    def save(self, plan: CompiledProject) -> IrHash:
        ir_hash = project_hash(plan)
        target = self.path_of(ir_hash)
        if target.is_file():
            return ir_hash
        self.directory.mkdir(parents=True, exist_ok=True)
        _write_atomically(target, plan.model_dump_json(by_alias=True).encode())
        return ir_hash

    def stamp(self, ir_hash: IrHash) -> PlanStamp:
        try:
            status = self.path_of(ir_hash).stat()
        except OSError:
            return None
        return status.st_mtime_ns, status.st_size

    def load(self, ir_hash: IrHash) -> CompiledProject | None:
        if not _is_hash(ir_hash):
            return None
        try:
            data = self.path_of(ir_hash).read_bytes()
        except OSError:
            return None
        if saved_hash(data) != ir_hash:
            return None
        try:
            return CompiledProject.model_validate_json(data)
        except ValidationError:
            return None


@dataclass(slots=True)
class PlanRegistry:
    store: PlanStore
    capacity: int = PLAN_CACHE_CAPACITY
    cache: OrderedDict[IrHash, CompiledProject] = field(default_factory=OrderedDict[IrHash, CompiledProject])
    misses: dict[IrHash, PlanStamp] = field(default_factory=dict[IrHash, PlanStamp])

    def register(self, plan: CompiledProject) -> IrHash:
        ir_hash = self.store.save(plan)
        self.misses.pop(ir_hash, None)
        self._remember(ir_hash, plan)
        return ir_hash

    def find(self, ir_hash: IrHash) -> CompiledProject | None:
        cached = self.cache.get(ir_hash)
        if cached is not None:
            self.cache.move_to_end(ir_hash)
            return cached
        stamp = self.store.stamp(ir_hash)
        if ir_hash in self.misses and self.misses[ir_hash] == stamp:
            return None
        loaded = self.store.load(ir_hash)
        if loaded is None:
            self.misses[ir_hash] = stamp
            return None
        self.misses.pop(ir_hash, None)
        self._remember(ir_hash, loaded)
        return loaded

    def plan(self, ir_hash: IrHash) -> CompiledProject:
        found = self.find(ir_hash)
        if found is None:
            raise PlanMissing(ir_hash)
        return found

    def _remember(self, ir_hash: IrHash, plan: CompiledProject) -> None:
        self.cache[ir_hash] = plan
        self.cache.move_to_end(ir_hash)
        while len(self.cache) > self.capacity:
            self.cache.popitem(last=False)


def saved_hash(data: bytes) -> IrHash | None:
    try:
        document = STORED_DOCUMENT.validate_json(data)
    except ValidationError:
        return None
    return hash_of(HashDomain.PROJECT, document)


def _is_hash(text: str) -> bool:
    return IR_HASH.fullmatch(text) is not None


def _write_atomically(target: Path, data: bytes) -> None:
    descriptor, temporary = tempfile.mkstemp(dir=target.parent, prefix=".plan-", suffix=PLAN_SUFFIX)
    try:
        with os.fdopen(descriptor, "wb") as stream:
            stream.write(data)
        os.replace(temporary, target)
    except BaseException:
        Path(temporary).unlink(missing_ok=True)
        raise
