import posixpath
from collections.abc import Callable, Iterator, Mapping
from dataclasses import dataclass
from typing import Final

from pydantic import JsonValue

from aqven.loader.layout import FLOW_BUILDER, FLOW_FILES, NODE_ID_SEPARATOR, ancestors, entity_id, expanded_node_id
from aqven.spec import NodeId, SpecKind
from aqven.write.canonical import JsonObject
from aqven.write.errors import not_found, request_invalid
from aqven.write.tree import WorkingTree

KIND_KEY: Final = "kind"
NODE_KIND_KEY: Final = "node"
NODES_FOLDER: Final = "nodes"
NODE_SUFFIX: Final = ".node.yaml"
INFERENCE_SUFFIX: Final = ".inference.yaml"
PROMPT_SUFFIX: Final = ".prompt.md"
COMPANION_SEPARATOR: Final = "."


@dataclass(frozen=True, slots=True)
class NodeFile:
    local_id: NodeId
    node_id: NodeId
    path: str

    @property
    def folder(self) -> str:
        return posixpath.dirname(self.path)


@dataclass(frozen=True, slots=True)
class FlowFiles:
    flow_id: str
    folder: str
    flow_path: str
    nodes: Mapping[NodeId, NodeFile]

    def node(self, node_ref: str) -> NodeFile:
        exact = self.nodes.get(NodeId(node_ref))
        if exact is not None:
            return exact
        local = tuple(node for node in self.nodes.values() if node.local_id == node_ref)
        if len(local) == 1:
            return local[0]
        raise not_found(f"flow {self.flow_id} has no node {node_ref}")

    def top_level(self, node: NodeFile) -> NodeFile:
        head = node.node_id.split(NODE_ID_SEPARATOR, 1)[0]
        return self.nodes.get(NodeId(head), node)


def flow_files(tree: WorkingTree, flow_id: str) -> FlowFiles:
    folders = tuple(folder for folder in tree.flow_folders() if posixpath.basename(folder) == flow_id)
    if not folders:
        raise not_found(f"flow {flow_id} not found: no {flow_id} folder with flow.yaml")
    folder = folders[0]
    flow_path = next((path for path in _flow_paths(folder) if tree.exists(path)), None)
    if flow_path is None:
        raise request_invalid(f"flow {flow_id} is built by {FLOW_BUILDER}: structural edits apply only to YAML")
    return FlowFiles(flow_id, folder, flow_path, _nodes(tree, folder, tree.flow_folders()))


def companion_paths(tree: WorkingTree, node: NodeFile) -> tuple[str, ...]:
    prefix = posixpath.join(node.folder, f"{node.local_id}{COMPANION_SEPARATOR}")
    return tuple(path for path in tree.paths() if path.startswith(prefix))


def inner_ids(document: JsonObject) -> tuple[str, ...]:
    kind = document.get(NODE_KIND_KEY)
    reader = INNER_READERS.get(kind) if isinstance(kind, str) else None
    return tuple(reader(document)) if reader is not None else ()


def document_kind(document: JsonObject | None) -> str | None:
    kind = document.get(KIND_KEY) if document is not None else None
    return kind if isinstance(kind, str) else None


def _flow_paths(folder: str) -> tuple[str, ...]:
    return tuple(posixpath.join(folder, name) for name in sorted(FLOW_FILES) if name != FLOW_BUILDER)


def _nodes(tree: WorkingTree, folder: str, flow_folders: tuple[str, ...]) -> dict[NodeId, NodeFile]:
    owned = (path for path in tree.yaml_paths() if _owner(path, flow_folders) == folder)
    documents = ((path, tree.document(path)) for path in owned)
    local_nodes = {
        NodeId(entity_id(path)): (path, document)
        for path, document in documents
        if document is not None and document_kind(document) == SpecKind.NODE.value
    }
    parents = {NodeId(inner): local for local, (_, document) in local_nodes.items() for inner in inner_ids(document)}
    files = (NodeFile(local, expanded_node_id(local, parents), path) for local, (path, _) in local_nodes.items())
    return {node.node_id: node for node in files}


def _owner(path: str, flow_folders: tuple[str, ...]) -> str | None:
    return next((folder for folder in ancestors(posixpath.dirname(path)) if folder in flow_folders), None)


def _strings(value: JsonValue) -> Iterator[str]:
    if isinstance(value, str):
        yield value
        return
    if isinstance(value, list):
        yield from (item for item in value if isinstance(item, str))
        return
    if isinstance(value, dict):
        yield from (item for item in value.values() if isinstance(item, str))


def _body(document: JsonObject) -> Iterator[str]:
    return _strings(document.get("body"))


def _cases(document: JsonObject) -> Iterator[str]:
    cases = document.get("cases")
    if not isinstance(cases, dict):
        return
    for case in cases.values():
        node = case.get("node") if isinstance(case, dict) else None
        if isinstance(node, str):
            yield node


INNER_READERS: Final[Mapping[str, Callable[[JsonObject], Iterator[str]]]] = {
    "parallel": _body,
    "map": _body,
    "loop": _body,
    "switch": _cases,
}
