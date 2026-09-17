from collections.abc import Iterable, Iterator, Mapping, Sequence
from dataclasses import dataclass
from enum import StrEnum
from typing import Final, TextIO

from liquid import Environment, StrictUndefined
from liquid.ast import BlockNode, Node
from liquid.builtin.expressions import parse_identifier
from liquid.context import RenderContext
from liquid.exceptions import LiquidSyntaxError, TemplateNotFoundError
from liquid.loader import BaseLoader, TemplateSource
from liquid.parser import get_parser
from liquid.stream import TokenStream
from liquid.tag import Tag
from liquid.template import BoundTemplate
from liquid.token import TOKEN_EOF, TOKEN_TAG, Token

from aqven.loader import include_candidates

MESSAGE_TAG: Final = "message"
END_MESSAGE: Final = "endmessage"
END_MESSAGE_BLOCK: Final = frozenset({END_MESSAGE, TOKEN_EOF})
CACHE_WORD: Final = "cache"
OUTPUT_FORMAT: Final = "output_format"

ALLOWED_TAGS: Final = frozenset({"if", "elsif", "else", "case", "when", "for", "include", "comment", "#", MESSAGE_TAG})
SERVICE_TAGS: Final = frozenset({"content", "output", "illegal"})
ALLOWED_FILTERS: Final[frozenset[str]] = frozenset()


class MessageRole(StrEnum):
    SYSTEM = "system"
    USER = "user"
    ASSISTANT = "assistant"


ROLES: Final[Mapping[str, MessageRole]] = {role.value: role for role in MessageRole}


class MessageNode(Node):
    __slots__ = ("block", "cache_requested", "role")

    def __init__(self, token: Token, role: MessageRole, cache_requested: bool, block: BlockNode) -> None:
        super().__init__(token)
        self.role = role
        self.cache_requested = cache_requested
        self.block = block

    def render_to_output(self, context: RenderContext, buffer: TextIO) -> int:
        return self.block.render(context, buffer)

    async def render_to_output_async(self, context: RenderContext, buffer: TextIO) -> int:
        return await self.block.render_async(context, buffer)

    def children(self, static_context: RenderContext, *, include_partials: bool = True) -> Iterable[Node]:
        return (self.block,)


class MessageTag(Tag):
    name = MESSAGE_TAG
    end = END_MESSAGE

    def parse(self, stream: TokenStream) -> Node:
        token = stream.eat(TOKEN_TAG)
        words = _words(self.env, stream.into_inner(tag=token))
        role = ROLES.get(words[0]) if words else None
        if role is None:
            raise LiquidSyntaxError("expected message role system, user or assistant", token=token)
        block = get_parser(self.env).parse_block(stream, END_MESSAGE_BLOCK)
        stream.expect(TOKEN_TAG, value=END_MESSAGE)
        return MessageNode(token, role, CACHE_WORD in words[1:], block)


@dataclass(frozen=True, slots=True)
class WalkedNode:
    node: Node
    depth: int


class IncludeLoader(BaseLoader):
    def __init__(self, texts: Mapping[str, str], folders: Sequence[str]) -> None:
        super().__init__()
        self.texts = texts
        self.folders = tuple(folders)
        self.served: dict[str, str] = {}

    def get_source(
        self,
        env: Environment,
        template_name: str,
        *,
        context: RenderContext | None = None,
        **kwargs: object,
    ) -> TemplateSource:
        file = next((path for path in include_candidates(self.folders, template_name) if path in self.texts), None)
        if file is None:
            raise TemplateNotFoundError(template_name)
        self.served[template_name] = file
        return TemplateSource(self.texts[file], file, None)


def prompt_environment(loader: BaseLoader) -> Environment:
    environment = Environment(undefined=StrictUndefined, loader=loader)
    environment.add_tag(MessageTag)
    return environment


def walk(template: BoundTemplate) -> Iterator[WalkedNode]:
    context = RenderContext(template)
    return _walk(template.nodes, 0, context)


def _walk(nodes: Iterable[Node], depth: int, context: RenderContext) -> Iterator[WalkedNode]:
    for node in nodes:
        yield WalkedNode(node, depth)
        yield from _walk(node.children(context, include_partials=True), depth + 1, context)


def _words(environment: Environment, arguments: TokenStream) -> list[str]:
    words: list[str] = []
    while arguments.current.kind != TOKEN_EOF:
        words.append(str(parse_identifier(environment, arguments)))
    return words
