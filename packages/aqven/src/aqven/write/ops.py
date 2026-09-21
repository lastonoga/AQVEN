import copy
import posixpath
from collections.abc import Callable, Iterator
from dataclasses import dataclass, field
from typing import Final, assert_never

from pydantic import JsonValue

from aqven.loader.layout import NODE_ID_SEPARATOR, PROJECT_FILE, entity_id
from aqven.spec import NodeId, SpecKind
from aqven.write.agents import (
    AgentFile,
    agent_file,
    agent_files,
    agent_moves,
    rename_agent_refs,
    require_free_agent,
    require_unused_agent,
)
from aqven.write.canonical import HEADER_KEYS, JsonObject
from aqven.write.errors import WriteError, not_found, request_invalid
from aqven.write.flows import (
    INFERENCE_SUFFIX,
    NODE_SUFFIX,
    NODES_FOLDER,
    PROMPT_SUFFIX,
    FlowFiles,
    NodeFile,
    companion_paths,
    document_kind,
    flow_files,
    inner_ids,
)
from aqven.write.model import (
    AddNodeOp,
    BindOp,
    DeleteAgentOp,
    JournalEntry,
    MoveNodeOp,
    PatchOp,
    RemoveNodeOp,
    RenameAgentOp,
    RenameFlowOp,
    RenameNodeOp,
    SetOp,
    UnbindOp,
    UnsetOp,
)
from aqven.write.rewrite import (
    ORDER_KEY,
    flow_alias_rewrite,
    moved_file_rewrite,
    node_ref_rewrite,
    rename_flow_node,
    rename_inner_node,
    rename_key_value,
    replace_contents,
    rewrite_document,
)
from aqven.write.tree import WorkingTree

API_VERSION: Final = "aqven/v1"
RENAMES_KEY: Final = "renames"
INFERENCE_KEY: Final = "inference"
FLOW_KEY: Final = "flow"
IN_KEY: Final = "in"
NAME_KEY: Final = "name"
FROM_KEY: Final = "from"
VALUE_KEY: Final = "value"
CALL_NODE: Final = "call"
APPEND_SEGMENT: Final = "-"
NAME_SEGMENT: Final = "name"
FLOW_TARGET: Final = "flow"
NODES_TARGET: Final = "nodes"
INFERENCES_TARGET: Final = "inferences"
QUALIFIER: Final = "."
SLOT_SEPARATOR: Final = "."
NAME_CANDIDATE_SUFFIXES: Final = ("_2", "_copy", "_new")

type DocumentTransform = Callable[[JsonObject], None]


@dataclass(slots=True)
class PatchContext:
    tree: WorkingTree
    flow_id: str
    now: str
    renames: list[JournalEntry] = field(default_factory=list[JournalEntry])
    focus: list[NodeId] = field(default_factory=list[NodeId])

    def flow(self) -> FlowFiles:
        return flow_files(self.tree, self.flow_id)

    def journal(self, kind: str, old: str, new: str) -> None:
        entry = JournalEntry.model_validate({"kind": kind, "from": old, "to": new, "at": self.now})
        project = self.tree.edit(PROJECT_FILE)
        renames = project.get(RENAMES_KEY)
        listed = renames if isinstance(renames, list) else []
        project[RENAMES_KEY] = [*listed, entry.model_dump(mode="json", by_alias=True)]
        self.renames.append(entry)


def apply_op(context: PatchContext, op: PatchOp) -> None:
    match op:
        case AddNodeOp():
            add_node(context, op)
        case RemoveNodeOp():
            remove_node(context, op)
        case RenameNodeOp():
            rename_node(context, op)
        case MoveNodeOp():
            move_node(context, op)
        case SetOp():
            set_field(context, op)
        case UnsetOp():
            unset_field(context, op)
        case BindOp():
            bind_slot(context, op)
        case UnbindOp():
            unbind_slot(context, op)
        case RenameFlowOp():
            rename_flow(context, op)
        case RenameAgentOp():
            rename_agent(context, op)
        case DeleteAgentOp():
            delete_agent(context, op)
        case _:
            assert_never(op)


def add_node(context: PatchContext, op: AddNodeOp) -> None:
    flow = context.flow()
    _require_free_node(flow, op.node_id)
    folder = _new_node_folder(flow, op)
    path = posixpath.join(folder, f"{op.node_id}{NODE_SUFFIX}")
    _require_absent(context.tree, path)
    context.tree.create(path, _with_header(SpecKind.NODE, op.spec))
    if op.inference is not None:
        context.tree.create(
            posixpath.join(folder, f"{op.node_id}{INFERENCE_SUFFIX}"), _with_header(SpecKind.INFERENCE, op.inference)
        )
    if op.prompt is not None:
        context.tree.write(posixpath.join(folder, f"{op.node_id}{PROMPT_SUFFIX}"), op.prompt.encode("utf-8"))
    if op.parent is None:
        _update(context.tree, flow.flow_path, lambda document: _insert_order(document, op.node_id, op.index))
    context.focus.append(NodeId(op.node_id))


def remove_node(context: PatchContext, op: RemoveNodeOp) -> None:
    flow = context.flow()
    node = flow.node(op.node_id)
    for removed in (node, *_descendants(context.tree, flow, node)):
        for path in companion_paths(context.tree, removed):
            context.tree.delete(path)
    if _is_top_level(node):
        _update(context.tree, flow.flow_path, lambda document: _remove_order(document, node.local_id))


def rename_node(context: PatchContext, op: RenameNodeOp) -> None:
    flow = context.flow()
    node = flow.node(op.node_id)
    if op.to == node.local_id:
        return
    _require_free_node(flow, op.to)
    old, new = node.local_id, op.to
    folder = _renamed_folder(node, new)
    moves = {
        path: _renamed_path(path, node.folder, folder, old, new) for path in _moved_paths(context.tree, flow, node)
    }
    inference = posixpath.join(node.folder, f"{old}{INFERENCE_SUFFIX}")
    renames_inference = context.tree.exists(inference)
    _move_all(context.tree, moves)
    _rename_references(context, context.flow(), old, new)
    context.journal(
        SpecKind.NODE.value.lower(),
        _qualified(flow.flow_id, node.node_id),
        _qualified(flow.flow_id, _sibling_id(node, new)),
    )
    if renames_inference:
        _rename_inference(context, old, new)
    context.focus.append(NodeId(new))


def move_node(context: PatchContext, op: MoveNodeOp) -> None:
    flow = context.flow()
    node = flow.node(op.node_id)
    if not _is_top_level(node):
        raise request_invalid(f"{node.node_id} is nested in another node: only a top-level node can be moved")
    context.focus.append(node.local_id)
    if op.to_flow is None or op.to_flow == flow.flow_id:
        _update(context.tree, flow.flow_path, lambda document: _reorder(document, node.local_id, op.index))
        return
    target = flow_files(context.tree, op.to_flow)
    _require_free_node(target, node.local_id)
    folder = posixpath.join(target.folder, NODES_FOLDER, node.local_id)
    moves = {
        path: _renamed_path(path, node.folder, folder, node.local_id, node.local_id)
        for path in _moved_paths(context.tree, flow, node)
    }
    _move_all(context.tree, moves)
    _update(context.tree, flow.flow_path, lambda document: _remove_order(document, node.local_id))
    _update(context.tree, target.flow_path, lambda document: _insert_order(document, node.local_id, op.index))
    context.journal(
        SpecKind.NODE.value.lower(), _qualified(flow.flow_id, node.node_id), _qualified(target.flow_id, node.node_id)
    )


def set_field(context: PatchContext, op: SetOp) -> None:
    target, segments = _spec_target(context, op.path)
    if segments == (NAME_SEGMENT,) and op.path.startswith(f"{NODES_TARGET}/") and isinstance(op.value, str):
        rename_node(
            context,
            RenameNodeOp.model_validate({"op": "rename_node", "node_id": _node_segment(op.path), "to": op.value}),
        )
        return
    document = context.tree.edit(target)
    _assign(document, segments, op.value, op.path)


def unset_field(context: PatchContext, op: UnsetOp) -> None:
    target, segments = _spec_target(context, op.path)
    document = context.tree.edit(target)
    _discard(document, segments, op.path)


def bind_slot(context: PatchContext, op: BindOp) -> None:
    node_ref, slot = op.target.rsplit(SLOT_SEPARATOR, 1)
    node = context.flow().node(node_ref)
    document = context.tree.edit(node.path)
    entries = _slots(document, node)
    entry = next((item for item in entries if item.get(NAME_KEY) == slot), None)
    bound = _bound_slots(entries, entry, slot, op.source)
    document[IN_KEY] = list[JsonValue](bound)
    context.focus.append(node.node_id)


def _bound_slots(entries: list[JsonObject], entry: JsonObject | None, slot: str, source: str) -> list[JsonObject]:
    if entry is None:
        return [*entries, {NAME_KEY: slot, FROM_KEY: source}]
    entry.pop(VALUE_KEY, None)
    entry[FROM_KEY] = source
    return entries


def unbind_slot(context: PatchContext, op: UnbindOp) -> None:
    node_ref, slot = op.target.rsplit(SLOT_SEPARATOR, 1)
    node = context.flow().node(node_ref)
    document = context.tree.edit(node.path)
    entries = _slots(document, node)
    entry = next((item for item in entries if item.get(NAME_KEY) == slot), None)
    if entry is None:
        raise not_found(f"node {node.node_id} has no input {slot}")
    entry.pop(FROM_KEY, None)
    entry.pop(VALUE_KEY, None)
    kept = [item for item in entries if item is not entry or set(item) != {NAME_KEY}]
    document[IN_KEY] = list[JsonValue](kept)
    context.focus.append(node.node_id)


def rename_flow(context: PatchContext, op: RenameFlowOp) -> None:
    flow = context.flow()
    if op.to == flow.flow_id:
        return
    if any(posixpath.basename(folder) == op.to for folder in context.tree.flow_folders()):
        raise WriteError("FILE_EXISTS", f"flow {op.to} already exists")
    folder = posixpath.join(posixpath.dirname(flow.folder), op.to)
    moves = {
        path: posixpath.join(folder, path.removeprefix(f"{flow.folder}/")) for path in _under(context.tree, flow.folder)
    }
    _move_all(context.tree, moves)
    old, new = flow.flow_id, op.to
    for path in tuple(context.tree.yaml_paths()):
        _update(context.tree, path, lambda document: _rename_flow_references(document, old, new))
    context.journal(FLOW_KEY, old, new)
    context.flow_id = new


def rename_agent(context: PatchContext, op: RenameAgentOp) -> None:
    agent = agent_file(context.tree, op.agent_id)
    if op.to == agent.agent_id:
        return
    require_free_agent(context.tree, op.to)
    moves = agent_moves(context.tree, agent, op.to)
    _move_all(context.tree, moves)
    old, new = agent.agent_id, op.to
    files = moved_file_rewrite(moves)

    def rename(document: JsonObject) -> None:
        replace_contents(document, rename_agent_refs(document, old, new))
        rewrite_document(document, files)

    for path in tuple(context.tree.yaml_paths()):
        _update(context.tree, path, rename)
    context.journal(SpecKind.AGENT.value.lower(), old, new)


def delete_agent(context: PatchContext, op: DeleteAgentOp) -> None:
    agent = agent_file(context.tree, op.agent_id)
    require_unused_agent(context.tree, agent)
    _delete_agent_files(context.tree, agent)


def _delete_agent_files(tree: WorkingTree, agent: AgentFile) -> None:
    for path in agent_files(tree, agent):
        tree.delete(path)


def _rename_flow_references(document: JsonObject, old: str, new: str) -> None:
    rewrite_document(document, flow_alias_rewrite(old, new))
    if document.get("node") == CALL_NODE and document.get(FLOW_KEY) == old:
        document[FLOW_KEY] = new


def _rename_references(context: PatchContext, flow: FlowFiles, old: str, new: str) -> None:
    rewrite = node_ref_rewrite(old, new)

    def flow_document(document: JsonObject) -> None:
        rename_flow_node(document, old, new)
        rewrite_document(document, rewrite)

    def node_document(document: JsonObject) -> None:
        rename_inner_node(document, old, new)
        rewrite_document(document, rewrite)

    _update(context.tree, flow.flow_path, flow_document)
    for node in flow.nodes.values():
        _update(context.tree, node.path, node_document)


def _rename_inference(context: PatchContext, old: str, new: str) -> None:
    def rename(document: JsonObject) -> None:
        renamed = rename_key_value(document, INFERENCE_KEY, old, new)
        replace_contents(document, renamed if isinstance(renamed, dict) else document)

    for path in tuple(context.tree.yaml_paths()):
        if path != PROJECT_FILE:
            _update(context.tree, path, rename)
    context.journal(SpecKind.INFERENCE.value.lower(), old, new)


def _update(tree: WorkingTree, path: str, transform: DocumentTransform) -> None:
    current = tree.document(path)
    if current is None:
        return
    changed = copy.deepcopy(current)
    transform(changed)
    if changed == current:
        return
    replace_contents(tree.edit(path), changed)


def _with_header(kind: SpecKind, body: JsonObject) -> JsonObject:
    return {
        "apiVersion": API_VERSION,
        "kind": kind.value,
        **{key: value for key, value in body.items() if key not in HEADER_KEYS},
    }


def _require_free_node(flow: FlowFiles, name: str) -> None:
    taken = {node.local_id for node in flow.nodes.values()}
    if name not in taken:
        return
    free = tuple(
        candidate for candidate in (f"{name}{suffix}" for suffix in NAME_CANDIDATE_SUFFIXES) if candidate not in taken
    )
    raise WriteError(
        "FILE_EXISTS",
        f"flow {flow.flow_id} already has node {name}",
        candidates=tuple({"node_id": candidate} for candidate in free),
    )


def _require_absent(tree: WorkingTree, path: str) -> None:
    if tree.exists(path):
        raise WriteError("FILE_EXISTS", f"{path} already exists", candidates=({"path": path},))


def _new_node_folder(flow: FlowFiles, op: AddNodeOp) -> str:
    if op.parent is None:
        return posixpath.join(flow.folder, NODES_FOLDER, op.node_id)
    return flow.top_level(flow.node(op.parent)).folder


def _is_top_level(node: NodeFile) -> bool:
    return node.node_id == node.local_id


def _descendants(tree: WorkingTree, flow: FlowFiles, node: NodeFile) -> Iterator[NodeFile]:
    document = tree.document(node.path)
    inner = inner_ids(document) if document is not None else ()
    for local in inner:
        child = flow.nodes.get(NodeId(f"{node.node_id}{NODE_ID_SEPARATOR}{local}"))
        if child is None:
            continue
        yield child
        yield from _descendants(tree, flow, child)


def _owns_folder(node: NodeFile) -> bool:
    return _is_top_level(node) and posixpath.basename(node.folder) == node.local_id


def _renamed_folder(node: NodeFile, new: str) -> str:
    return posixpath.join(posixpath.dirname(node.folder), new) if _owns_folder(node) else node.folder


def _moved_paths(tree: WorkingTree, flow: FlowFiles, node: NodeFile) -> tuple[str, ...]:
    if _owns_folder(node):
        return _under(tree, node.folder)
    nodes = (node, *_descendants(tree, flow, node))
    return tuple(path for item in nodes for path in companion_paths(tree, item))


def _under(tree: WorkingTree, folder: str) -> tuple[str, ...]:
    return tuple(path for path in tree.paths() if path.startswith(f"{folder}/"))


def _renamed_path(path: str, folder: str, target: str, old: str, new: str) -> str:
    head, separator, tail = path.removeprefix(f"{folder}/").partition("/")
    prefix = f"{old}{QUALIFIER}"
    renamed = f"{new}{QUALIFIER}{head.removeprefix(prefix)}" if head.startswith(prefix) else head
    return posixpath.join(target, f"{renamed}{separator}{tail}")


def _move_all(tree: WorkingTree, moves: dict[str, str]) -> None:
    sources = frozenset(moves)
    clashes = tuple(target for target in moves.values() if target not in sources and tree.exists(target))
    if clashes:
        raise WriteError(
            "FILE_EXISTS", f"{clashes[0]} already exists", candidates=tuple({"path": path} for path in clashes)
        )
    for source, target in moves.items():
        if source != target:
            tree.move(source, target)


def _sibling_id(node: NodeFile, new: str) -> str:
    head, _, _ = node.node_id.rpartition(NODE_ID_SEPARATOR)
    return f"{head}{NODE_ID_SEPARATOR}{new}" if head else new


def _qualified(flow_id: str, node_id: str) -> str:
    return f"{flow_id}{QUALIFIER}{node_id}"


def _order(document: JsonObject) -> list[JsonValue]:
    order = document.get(ORDER_KEY)
    return list(order) if isinstance(order, list) else []


def _insert_order(document: JsonObject, name: str, index: int | None) -> None:
    order = [item for item in _order(document) if item != name]
    position = len(order) if index is None else min(index, len(order))
    order.insert(position, name)
    document[ORDER_KEY] = order


def _remove_order(document: JsonObject, name: str) -> None:
    document[ORDER_KEY] = [item for item in _order(document) if item != name]


def _reorder(document: JsonObject, name: str, index: int | None) -> None:
    if name not in _order(document):
        raise not_found(f"node {name} is not in the flow order")
    _insert_order(document, name, index)


def _node_segment(path: str) -> str:
    return path.split("/")[1]


def _spec_target(context: PatchContext, path: str) -> tuple[str, tuple[str, ...]]:
    head, *rest = path.split("/")
    resolver = TARGET_RESOLVERS[head]
    target, segments = resolver(context, rest)
    if segments and segments[0] in HEADER_KEYS:
        raise request_invalid(f"{path}: apiVersion and kind cannot be changed with set")
    return target, segments


def _flow_target(context: PatchContext, rest: list[str]) -> tuple[str, tuple[str, ...]]:
    return context.flow().flow_path, tuple(rest)


def _node_target(context: PatchContext, rest: list[str]) -> tuple[str, tuple[str, ...]]:
    node = context.flow().node(rest[0])
    context.focus.append(node.node_id)
    return node.path, tuple(rest[1:])


def _inference_target(context: PatchContext, rest: list[str]) -> tuple[str, tuple[str, ...]]:
    name = rest[0]
    tree = context.tree
    found = next(
        (
            path
            for path in tree.yaml_paths()
            if entity_id(path) == name and document_kind(tree.document(path)) == SpecKind.INFERENCE.value
        ),
        None,
    )
    if found is None:
        raise not_found(f"inference {name} is not in the project")
    return found, tuple(rest[1:])


TARGET_RESOLVERS: Final[dict[str, Callable[[PatchContext, list[str]], tuple[str, tuple[str, ...]]]]] = {
    FLOW_TARGET: _flow_target,
    NODES_TARGET: _node_target,
    INFERENCES_TARGET: _inference_target,
}


def _assign(document: JsonObject, segments: tuple[str, ...], value: JsonValue, path: str) -> None:
    parent = _container(document, segments[:-1], path, create=True)
    last = segments[-1]
    if isinstance(parent, dict):
        parent[last] = value
        return
    index = _list_index(parent, last, path, appendable=True)
    if index == len(parent):
        parent.append(value)
        return
    parent[index] = value


def _discard(document: JsonObject, segments: tuple[str, ...], path: str) -> None:
    parent = _container(document, segments[:-1], path, create=False)
    last = segments[-1]
    if isinstance(parent, dict):
        if last not in parent:
            raise not_found(f"{path}: key {last} not found")
        del parent[last]
        return
    del parent[_list_index(parent, last, path, appendable=False)]


def _container(
    document: JsonObject, segments: tuple[str, ...], path: str, *, create: bool
) -> JsonObject | list[JsonValue]:
    current: JsonObject | list[JsonValue] = document
    for segment in segments:
        current = _child(current, segment, path, create=create)
    return current


def _child(
    current: JsonObject | list[JsonValue], segment: str, path: str, *, create: bool
) -> JsonObject | list[JsonValue]:
    if isinstance(current, list):
        found = current[_list_index(current, segment, path, appendable=False)]
    else:
        found = current.setdefault(segment, {}) if create else current.get(segment)
    if isinstance(found, dict | list):
        return found
    raise request_invalid(f"{path}: segment {segment} does not lead to a mapping or list")


def _list_index(items: list[JsonValue], segment: str, path: str, *, appendable: bool) -> int:
    if appendable and segment == APPEND_SEGMENT:
        return len(items)
    limit = len(items) + 1 if appendable else len(items)
    if not segment.isdigit() or int(segment) >= limit:
        raise request_invalid(f"{path}: index {segment} is outside a list of length {len(items)}")
    return int(segment)


def _slots(document: JsonObject, node: NodeFile) -> list[JsonObject]:
    listed = document.get(IN_KEY)
    items = listed if isinstance(listed, list) else []
    entries = [item for item in items if isinstance(item, dict)]
    if len(entries) != len(items):
        raise request_invalid(f"node {node.node_id}: key in is not a list of mappings")
    return entries
