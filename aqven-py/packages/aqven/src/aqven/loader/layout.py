import posixpath
import re
from collections.abc import Iterator, Mapping, Sequence
from pathlib import PurePosixPath
from typing import Final

from aqven.spec import TEXT_SUFFIX, NodeId, SpecKind, TypeId

PROJECT_FILE: Final = "aqven.yaml"
LOCK_FILE: Final = "aqven.lock.yaml"
NODE_ID_SEPARATOR: Final = "__"
ID_SEPARATOR: Final = "."
PYTHON_SUFFIX: Final = ".py"
VARIANTS_FOLDER: Final = "variants"
SKIPPED_DIRECTORIES: Final = frozenset({"__pycache__", "node_modules"})
SOURCE_SUFFIXES: Final = frozenset({".yaml", ".yml", PYTHON_SUFFIX})
AQVEN_HEADER: Final = re.compile(rb"""^apiVersion:[ \t]*["']?aqven/""", re.MULTILINE)

ROLE_KINDS: Final[Mapping[str, SpecKind]] = {"node": SpecKind.NODE, "inference": SpecKind.INFERENCE}
BUILDER_ROLES: Final[Mapping[str, SpecKind]] = {"inference": SpecKind.INFERENCE}
FLOW_BUILDER: Final = "flow.py"
FLOW_FILES: Final = frozenset({"flow.yaml", "flow.yml", FLOW_BUILDER})
FLOW_PATH_PREFIX: Final = "@flow/"
ROOT_PATH_PREFIX: Final = "@root/"
CODE_FUNCTION_SEPARATOR: Final = ":"
INFERENCE_TEXT_KEY: Final = re.compile(
    r"^(prompt|partials/[a-z][a-z0-9_]{0,62}|variants/[a-z][a-z0-9_]{0,62}/[a-z][a-z0-9_]{0,62})$"
)


def expected_kind(path: str) -> SpecKind | None:
    if path == PROJECT_FILE:
        return SpecKind.PROJECT
    if PurePosixPath(path).name in FLOW_FILES:
        return SpecKind.FLOW
    return ROLE_KINDS.get(entity_role(path))


def builder_kind(path: str) -> SpecKind | None:
    if PurePosixPath(path).name == FLOW_BUILDER:
        return SpecKind.FLOW
    return BUILDER_ROLES.get(entity_role(path))


def entity_id(path: str) -> str:
    pure = PurePosixPath(path)
    return pure.parent.name if pure.name in FLOW_FILES else pure.name.partition(ID_SEPARATOR)[0]


def entity_role(path: str) -> str:
    parts = PurePosixPath(path).name.split(ID_SEPARATOR)
    return parts[1] if len(parts) == 3 else ""


def entity_stem(path: str) -> str:
    return posixpath.join(posixpath.dirname(path), entity_id(path))


def declares(path: str, kind: SpecKind) -> bool:
    return expected_kind(path) is kind and PurePosixPath(path).suffix in SOURCE_SUFFIXES


def code_file_ref(path: str, function: str) -> str:
    return f"{ROOT_PATH_PREFIX}{entity_stem(path)}{PYTHON_SUFFIX}{CODE_FUNCTION_SEPARATOR}{function}"


def code_file_parts(ref: str) -> tuple[str, str]:
    path, _, function = ref.removeprefix(ROOT_PATH_PREFIX).rpartition(CODE_FUNCTION_SEPARATOR)
    return path, function


def ancestors(folder: str) -> Iterator[str]:
    current = folder
    while current:
        yield current
        current = posixpath.dirname(current)
    yield ""


def within(path: str, folder: str) -> bool:
    return not folder or path.startswith(f"{folder}/")


def inference_texts(stem: str, texts: Mapping[str, str]) -> dict[str, str]:
    keyed = ((text_key(stem, path), text) for path, text in texts.items())
    return {key: text for key, text in keyed if key is not None and INFERENCE_TEXT_KEY.fullmatch(key) is not None}


def text_file(stem: str, key: str) -> str:
    return f"{stem}{ID_SEPARATOR}{key}{TEXT_SUFFIX}"


def text_key(stem: str, file: str) -> str | None:
    prefix = f"{stem}{ID_SEPARATOR}"
    if not file.startswith(prefix) or not file.endswith(TEXT_SUFFIX):
        return None
    return file.removeprefix(prefix).removesuffix(TEXT_SUFFIX)


def include_candidates(folders: Sequence[str], name: str) -> tuple[str, ...]:
    file = name if name.endswith(TEXT_SUFFIX) else f"{name}{TEXT_SUFFIX}"
    bases = ("",) if file.startswith(ROOT_PATH_PREFIX) else (*folders, "")
    paths = (posixpath.normpath(posixpath.join(folder, file.removeprefix(ROOT_PATH_PREFIX))) for folder in bases)
    return tuple(dict.fromkeys(path for path in paths if not path.startswith(("..", "/"))))


def variant_candidates(stem: str, slot: str, variant: str) -> tuple[str, ...]:
    if variant.endswith(TEXT_SUFFIX):
        return include_candidates((posixpath.dirname(stem),), variant)
    return (text_file(stem, posixpath.join(VARIANTS_FOLDER, slot, variant)),)


def type_id_for(name: str) -> TypeId:
    return TypeId("".join(part.capitalize() for part in name.split("_")))


def local_node_id(node_id: str) -> NodeId:
    return NodeId(node_id.rsplit(NODE_ID_SEPARATOR, 1)[-1])


def parent_node_id(node_id: str) -> NodeId | None:
    if NODE_ID_SEPARATOR not in node_id:
        return None
    return NodeId(node_id.rsplit(NODE_ID_SEPARATOR, 1)[0])


def inner_node_id(parent: str, local: str) -> NodeId:
    return NodeId(f"{parent}{NODE_ID_SEPARATOR}{local}")


def expanded_node_id(local: NodeId, parents: Mapping[NodeId, NodeId]) -> NodeId:
    chain = [local]
    parent = parents.get(local)
    while parent is not None and parent not in chain:
        chain.append(parent)
        parent = parents.get(parent)
    return NodeId(NODE_ID_SEPARATOR.join(reversed(chain)))
