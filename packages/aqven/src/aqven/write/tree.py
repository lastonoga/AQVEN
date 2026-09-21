import copy
import posixpath
from collections.abc import Iterator
from dataclasses import dataclass, field
from pathlib import Path, PurePosixPath
from typing import Final

from aqven.loader import project_files
from aqven.loader.aliases import AliasScope
from aqven.loader.layout import FLOW_FILES
from aqven.write.canonical import JsonObject, canonical_yaml, parse_document
from aqven.write.errors import request_invalid

YAML_SUFFIXES: Final = frozenset({".yaml", ".yml"})

type FileState = bytes | None


@dataclass(slots=True)
class WorkingTree:
    root: Path
    listing: frozenset[str]
    contents: dict[str, FileState] = field(default_factory=dict[str, FileState])
    documents: dict[str, JsonObject] = field(default_factory=dict[str, JsonObject])
    dirty_documents: set[str] = field(default_factory=set[str])

    @classmethod
    def open(cls, root: Path) -> WorkingTree:
        return cls(root=root, listing=frozenset(project_files(root)))

    def exists(self, path: str) -> bool:
        if path in self.contents:
            return self.contents[path] is not None
        return path in self.listing

    def paths(self) -> tuple[str, ...]:
        added = (path for path, state in self.contents.items() if state is not None)
        kept = (path for path in self.listing if self.contents.get(path, b"") is not None)
        return tuple(sorted({*kept, *added}))

    def read(self, path: str) -> FileState:
        if path in self.dirty_documents:
            self._flush(path)
        if path in self.contents:
            return self.contents[path]
        if path not in self.listing:
            return None
        return (self.root / path).read_bytes()

    def write(self, path: str, data: bytes) -> None:
        self.documents.pop(path, None)
        self.dirty_documents.discard(path)
        self.contents[path] = data

    def delete(self, path: str) -> None:
        self.documents.pop(path, None)
        self.dirty_documents.discard(path)
        self.contents[path] = None

    def move(self, source: str, target: str) -> None:
        data = self.read(source)
        if data is None:
            raise request_invalid(f"file {source} not found: nothing to move")
        document = self.documents.get(source)
        self.delete(source)
        self.write(target, data)
        if document is None:
            return
        self.documents[target] = document
        self.dirty_documents.add(target)

    def document(self, path: str) -> JsonObject | None:
        cached = self.documents.get(path)
        if cached is not None:
            return cached
        data = self.read(path)
        parsed = parse_document(path, data) if data is not None else None
        if parsed is None:
            return None
        self.documents[path] = copy.deepcopy(parsed)
        return self.documents[path]

    def edit(self, path: str) -> JsonObject:
        document = self.document(path)
        if document is None:
            raise request_invalid(f"{path} does not parse as a YAML definition: fix the file first")
        self.dirty_documents.add(path)
        return document

    def create(self, path: str, document: JsonObject) -> None:
        self.contents[path] = b""
        self.documents[path] = document
        self.dirty_documents.add(path)

    def yaml_paths(self) -> Iterator[str]:
        return (path for path in self.paths() if PurePosixPath(path).suffix in YAML_SUFFIXES)

    def flow_folders(self) -> tuple[str, ...]:
        return tuple(
            sorted({posixpath.dirname(path) for path in self.paths() if posixpath.basename(path) in FLOW_FILES})
        )

    def alias_scope(self) -> AliasScope:
        return AliasScope(self.root.name, self.flow_folders())

    def changes(self) -> dict[str, FileState]:
        for path in tuple(self.dirty_documents):
            self._flush(path)
        return {path: state for path, state in sorted(self.contents.items()) if self._differs(path, state)}

    def _flush(self, path: str) -> None:
        document = self.documents[path]
        self.contents[path] = canonical_yaml(path, document, self.alias_scope())
        self.dirty_documents.discard(path)

    def _differs(self, path: str, state: FileState) -> bool:
        target = self.root / path
        if state is None:
            return path in self.listing or target.is_file()
        return not target.is_file() or target.read_bytes() != state
