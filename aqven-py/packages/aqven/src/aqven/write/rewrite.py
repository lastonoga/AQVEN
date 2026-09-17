import re
from collections.abc import Callable, Mapping
from typing import Final

from pydantic import JsonValue

from aqven.write.canonical import JsonObject

type StringRewrite = Callable[[str], str]

NODE_REF_HEAD: Final = r"^\$(?P<scope>iter\.)?"
NODE_REF_TAIL: Final = r"(?=\.out(?:$|[.\[]))"
BODY_KEY: Final = "body"
CASES_KEY: Final = "cases"
INIT_KEY: Final = "init"
ORDER_KEY: Final = "order"
REQUIRES_KEY: Final = "requires"
NODES_KEY: Final = "nodes"
NODE_KEY: Final = "node"


def node_ref_rewrite(old: str, new: str) -> StringRewrite:
    pattern = re.compile(f"{NODE_REF_HEAD}{re.escape(old)}{NODE_REF_TAIL}")
    return lambda text: pattern.sub(lambda match: f"${match.group('scope') or ''}{new}", text)


def flow_alias_rewrite(old: str, new: str) -> StringRewrite:
    prefix = f"@{old}."
    return lambda text: f"@{new}.{text.removeprefix(prefix)}" if text.startswith(prefix) else text


def rewrite_strings(value: JsonValue, rewrite: StringRewrite) -> JsonValue:
    if isinstance(value, str):
        return rewrite(value)
    if isinstance(value, list):
        return [rewrite_strings(item, rewrite) for item in value]
    if isinstance(value, dict):
        return {key: rewrite_strings(item, rewrite) for key, item in value.items()}
    return value


def rewrite_document(document: JsonObject, rewrite: StringRewrite) -> None:
    replaced = rewrite_strings(document, rewrite)
    replace_contents(document, replaced if isinstance(replaced, dict) else {})


def rename_key_value(value: JsonValue, key: str, old: str, new: str) -> JsonValue:
    if isinstance(value, list):
        return [rename_key_value(item, key, old, new) for item in value]
    if not isinstance(value, dict):
        return value
    return {
        name: new if name == key and item == old else rename_key_value(item, key, old, new)
        for name, item in value.items()
    }


def rename_flow_node(document: JsonObject, old: str, new: str) -> None:
    exact = _exact(old, new)
    order = document.get(ORDER_KEY)
    if isinstance(order, list):
        document[ORDER_KEY] = [exact(item) for item in order]
    requires = document.get(REQUIRES_KEY)
    if isinstance(requires, list):
        document[REQUIRES_KEY] = [_predicate(item, exact) for item in requires]


def rename_inner_node(document: JsonObject, old: str, new: str) -> None:
    exact = _exact(old, new)
    for key, rename in INNER_SITES.items():
        if key in document:
            document[key] = rename(document[key], exact)


def replace_contents(document: JsonObject, replaced: JsonObject) -> None:
    document.clear()
    document.update(replaced)


def _exact(old: str, new: str) -> Callable[[JsonValue], JsonValue]:
    return lambda item: new if item == old else item


def _predicate(item: JsonValue, exact: Callable[[JsonValue], JsonValue]) -> JsonValue:
    if not isinstance(item, dict):
        return item
    nodes = item.get(NODES_KEY)
    if not isinstance(nodes, list):
        return item
    return {**item, NODES_KEY: [exact(node) for node in nodes]}


def _body(value: JsonValue, exact: Callable[[JsonValue], JsonValue]) -> JsonValue:
    if isinstance(value, list):
        return [exact(item) for item in value]
    if isinstance(value, dict):
        return {key: exact(item) for key, item in value.items()}
    return exact(value)


def _cases(value: JsonValue, exact: Callable[[JsonValue], JsonValue]) -> JsonValue:
    if not isinstance(value, dict):
        return value
    return {key: _case(case, exact) for key, case in value.items()}


def _case(case: JsonValue, exact: Callable[[JsonValue], JsonValue]) -> JsonValue:
    if not isinstance(case, dict) or NODE_KEY not in case:
        return case
    return {**case, NODE_KEY: exact(case[NODE_KEY])}


def _init(value: JsonValue, exact: Callable[[JsonValue], JsonValue]) -> JsonValue:
    if not isinstance(value, dict):
        return value
    return {_key(key, exact): item for key, item in value.items()}


def _key(key: str, exact: Callable[[JsonValue], JsonValue]) -> str:
    renamed = exact(key)
    return renamed if isinstance(renamed, str) else key


INNER_SITES: Final[Mapping[str, Callable[[JsonValue, Callable[[JsonValue], JsonValue]], JsonValue]]] = {
    BODY_KEY: _body,
    CASES_KEY: _cases,
    INIT_KEY: _init,
}
