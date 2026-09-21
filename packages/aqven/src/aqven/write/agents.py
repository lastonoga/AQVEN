import posixpath
from collections.abc import Iterator
from dataclasses import dataclass
from typing import Final

from pydantic import JsonValue

from aqven.loader.layout import entity_id
from aqven.spec import SpecKind
from aqven.write.canonical import JsonObject
from aqven.write.errors import WriteError, not_found, request_invalid
from aqven.write.flows import COMPANION_SEPARATOR, document_kind
from aqven.write.rewrite import rename_key_value
from aqven.write.tree import WorkingTree

AGENT_REF_KEYS: Final = ("agent", "reflection_agent")
NAME_CANDIDATE_SUFFIXES: Final = ("_2", "_copy", "_new")


@dataclass(frozen=True, slots=True)
class AgentFile:
    agent_id: str
    path: str

    @property
    def folder(self) -> str:
        return posixpath.dirname(self.path)

    @property
    def owns_folder(self) -> bool:
        return posixpath.basename(self.folder) == self.agent_id


def agent_ids(tree: WorkingTree) -> tuple[str, ...]:
    return tuple(entity_id(path) for path in _agent_paths(tree))


def agent_file(tree: WorkingTree, agent_id: str) -> AgentFile:
    found = next((path for path in _agent_paths(tree) if entity_id(path) == agent_id), None)
    if found is None:
        raise not_found(f"agent {agent_id} not found: no file with kind Agent and name {agent_id}")
    return AgentFile(agent_id, found)


def agent_moves(tree: WorkingTree, agent: AgentFile, new: str) -> dict[str, str]:
    if agent.owns_folder:
        folder = posixpath.join(posixpath.dirname(agent.folder), new)
        return {path: _renamed(path, agent.folder, folder, agent.agent_id, new) for path in _under(tree, agent.folder)}
    return {path: _renamed(path, agent.folder, agent.folder, agent.agent_id, new) for path in _companions(tree, agent)}


def agent_files(tree: WorkingTree, agent: AgentFile) -> tuple[str, ...]:
    if agent.owns_folder:
        return _under(tree, agent.folder)
    return _companions(tree, agent)


def references(tree: WorkingTree, agent: AgentFile) -> tuple[str, ...]:
    owned = frozenset(agent_files(tree, agent))
    paths = (path for path in tree.yaml_paths() if path not in owned)
    return tuple(path for path in paths if _mentions(tree.document(path), agent.agent_id))


def rename_agent_refs(document: JsonObject, old: str, new: str) -> JsonObject:
    renamed: JsonValue = document
    for key in AGENT_REF_KEYS:
        renamed = rename_key_value(renamed, key, old, new)
    return renamed if isinstance(renamed, dict) else document


def require_free_agent(tree: WorkingTree, name: str) -> None:
    taken = frozenset(agent_ids(tree))
    if name not in taken:
        return
    free = tuple(
        candidate for candidate in (f"{name}{suffix}" for suffix in NAME_CANDIDATE_SUFFIXES) if candidate not in taken
    )
    raise WriteError(
        "FILE_EXISTS",
        f"agent {name} already exists",
        candidates=tuple({"agent_id": candidate} for candidate in free),
    )


def require_unused_agent(tree: WorkingTree, agent: AgentFile) -> None:
    used = references(tree, agent)
    if not used:
        return
    raise request_invalid(
        f"agent {agent.agent_id} is used by {', '.join(used)}: point them at another agent first",
        candidates=tuple({"path": path} for path in used),
    )


def _agent_paths(tree: WorkingTree) -> Iterator[str]:
    return (path for path in tree.yaml_paths() if document_kind(tree.document(path)) == SpecKind.AGENT.value)


def _under(tree: WorkingTree, folder: str) -> tuple[str, ...]:
    return tuple(path for path in tree.paths() if path.startswith(f"{folder}/"))


def _companions(tree: WorkingTree, agent: AgentFile) -> tuple[str, ...]:
    prefix = posixpath.join(agent.folder, f"{agent.agent_id}{COMPANION_SEPARATOR}")
    return tuple(path for path in tree.paths() if path.startswith(prefix))


def _renamed(path: str, folder: str, target: str, old: str, new: str) -> str:
    head, separator, tail = path.removeprefix(f"{folder}/").partition("/")
    prefix = f"{old}{COMPANION_SEPARATOR}"
    renamed = f"{new}{COMPANION_SEPARATOR}{head.removeprefix(prefix)}" if head.startswith(prefix) else head
    return posixpath.join(target, f"{renamed}{separator}{tail}")


def _mentions(document: JsonObject | None, agent_id: str) -> bool:
    if document is None:
        return False
    return any(_named(document, key, agent_id) for key in AGENT_REF_KEYS)


def _named(value: JsonValue, key: str, agent_id: str) -> bool:
    if isinstance(value, list):
        return any(_named(item, key, agent_id) for item in value)
    if not isinstance(value, dict):
        return False
    if value.get(key) == agent_id:
        return True
    return any(_named(item, key, agent_id) for item in value.values())
