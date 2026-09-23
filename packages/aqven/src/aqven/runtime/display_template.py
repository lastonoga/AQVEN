"""Typed Liquid tags for inference presentation documents."""

import posixpath
from collections.abc import Iterable, Mapping
from dataclasses import dataclass
from io import StringIO
from typing import TextIO

from liquid import DictLoader, Environment, Node, RenderContext, StrictUndefined, Tag, Token, TokenStream
from liquid.ast import BlockNode
from liquid.builtin.content import ContentNode
from liquid.builtin.expressions import KeywordArgument, StringLiteral
from liquid.builtin.output import OutputNode
from liquid.builtin.tags.include_tag import IncludeNode
from liquid.builtin.tags.render_tag import RenderNode
from liquid.exceptions import TemplateNotFoundError
from liquid.loader import TemplateSource
from liquid.parser import get_parser
from liquid.template import BoundTemplate
from liquid.token import TOKEN_EOF, TOKEN_EXPRESSION, TOKEN_TAG

from aqven.runtime.presentation import (
    DisplayBadge,
    DisplayCard,
    DisplayDocument,
    DisplayElement,
    DisplayField,
    DisplayList,
    DisplayMedia,
    DisplaySection,
    DisplayText,
    PresentationContext,
)

_ALLOWED_TAGS = frozenset(
    {"content", "output", "illegal", "comment", "if", "unless", "for", "assign", "include", "render"}
)
_ELEMENT_TYPES = {
    "section": DisplaySection,
    "list": DisplayList,
    "card": DisplayCard,
    "field": DisplayField,
    "text": DisplayText,
    "badge": DisplayBadge,
    "media": DisplayMedia,
}


class DisplayRenderContext(RenderContext):
    """Keep document construction private from template variables and partial scopes."""

    __slots__ = ("elements", "stack")

    def __init__(
        self,
        template: BoundTemplate,
        *,
        elements: list[DisplayElement] | None = None,
        globals: Mapping[str, object] | None = None,
        disabled_tags: list[str] | None = None,
        copy_depth: int = 0,
        parent_context: RenderContext | None = None,
        loop_iteration_carry: int = 1,
        local_namespace_size_carry: int = 0,
    ) -> None:
        super().__init__(
            template,
            globals=globals,
            disabled_tags=disabled_tags,
            copy_depth=copy_depth,
            parent_context=parent_context,
            loop_iteration_carry=loop_iteration_carry,
            local_namespace_size_carry=local_namespace_size_carry,
        )
        if isinstance(parent_context, DisplayRenderContext):
            self.elements = parent_context.elements
            self.stack = parent_context.stack
        else:
            self.elements = elements if elements is not None else []
            self.stack = [self.elements]


class _ElementNode(Node):
    __slots__ = ("arguments", "element_type", "block")

    def __init__(
        self,
        token: Token,
        arguments: list[KeywordArgument],
        element_type: type[DisplayElement],
        block: BlockNode | None = None,
    ) -> None:
        super().__init__(token)
        self.arguments = arguments
        self.element_type = element_type
        self.block = block

    def render_to_output(self, context: RenderContext, buffer: TextIO) -> int:
        if not isinstance(context, DisplayRenderContext):
            raise TypeError("display tag requires a display render context")
        values = {argument.name: argument.value.evaluate(context) for argument in self.arguments}
        if self.block is not None:
            children: list[DisplayElement] = []
            context.stack.append(children)
            try:
                self.block.render(context, buffer)
            finally:
                context.stack.pop()
            values["children"] = tuple(children)
        element = self.element_type.model_validate(values)
        context.stack[-1].append(element)
        return 0

    def children(self, static_context: RenderContext, *, include_partials: bool = True) -> Iterable[Node]:
        if self.block is not None:
            yield self.block


class _ElementTag(Tag):
    element_type: type[DisplayElement]
    block = False

    def parse(self, stream: TokenStream) -> Node:
        token = stream.eat(TOKEN_TAG)
        arguments = (
            KeywordArgument.parse(self.env, stream.into_inner(tag=token, eat=self.block))
            if stream.current.kind == TOKEN_EXPRESSION
            else []
        )
        block = None
        if self.block:
            block = get_parser(self.env).parse_block(stream, (self.end, TOKEN_EOF))
            stream.expect(TOKEN_TAG, value=self.end)
        return _ElementNode(token, arguments, self.element_type, block)


class SectionTag(_ElementTag):
    name = "section"
    end = "endsection"
    block = True
    element_type = DisplaySection


class ListTag(_ElementTag):
    name = "list"
    end = "endlist"
    block = True
    element_type = DisplayList


class CardTag(_ElementTag):
    name = "card"
    end = "endcard"
    block = True
    element_type = DisplayCard


class FieldTag(_ElementTag):
    name = "field"
    element_type = DisplayField


class TextTag(_ElementTag):
    name = "text"
    element_type = DisplayText


class BadgeTag(_ElementTag):
    name = "badge"
    element_type = DisplayBadge


class MediaTag(_ElementTag):
    name = "media"
    element_type = DisplayMedia


class _RelativeDisplayLoader(DictLoader):
    def get_source(
        self,
        env: Environment,
        template_name: str,
        *,
        context: RenderContext | None = None,
        **kwargs: object,
    ) -> TemplateSource:
        name = template_name.removeprefix("@root/")
        if name.startswith("/"):
            raise TemplateNotFoundError(template_name)
        candidates = [name]
        if context is not None and context.template.full_name():
            folder = posixpath.dirname(context.template.full_name())
            candidates.insert(0, posixpath.normpath(posixpath.join(folder, name)))
        for candidate in candidates:
            if candidate.startswith(("../", "/")) or candidate == "..":
                continue
            if candidate in self.templates:
                return TemplateSource(self.templates[candidate], candidate, None)
        raise TemplateNotFoundError(template_name)


def _environment(templates: Mapping[str, str]) -> Environment:
    env = Environment(loader=_RelativeDisplayLoader(dict(templates)), undefined=StrictUndefined)
    for name in tuple(env.tags):
        if name not in _ALLOWED_TAGS:
            del env.tags[name]
    for tag in (SectionTag, ListTag, CardTag, FieldTag, TextTag, BadgeTag, MediaTag):
        env.add_tag(tag)
    return env


def _audit_nodes(
    nodes: Iterable[Node],
    context: RenderContext,
    reached: set[str],
    active: set[str],
) -> None:
    for node in nodes:
        if isinstance(node, OutputNode):
            raise ValueError("display templates cannot use output statements")
        if isinstance(node, ContentNode) and node.text.strip():
            raise ValueError("display templates cannot emit text")
        if isinstance(node, RenderNode | IncludeNode):
            if not isinstance(node.name, StringLiteral):
                raise ValueError("display partial names must be string literals")
            partial = context.env.get_template(node.name.value, context=context)
            _audit_template(partial, reached, active)
        else:
            _audit_nodes(node.children(context, include_partials=False), context, reached, active)


def _audit_template(template: BoundTemplate, reached: set[str], active: set[str]) -> None:
    name = template.full_name()
    if name in active:
        raise ValueError(f"recursive display partial {name}")
    if name in reached:
        return
    active.add(name)
    _audit_nodes(template.nodes, RenderContext(template), reached, active)
    active.remove(name)
    reached.add(name)


def _obvious_root(template: BoundTemplate) -> None:
    nodes = template.nodes
    dynamic = any(
        isinstance(node, RenderNode | IncludeNode) or node.token.value in {"if", "unless", "for"} for node in nodes
    )
    if dynamic:
        return
    elements = [node for node in nodes if isinstance(node, _ElementNode)]
    if len(elements) != 1 or elements[0].element_type is not DisplaySection:
        raise ValueError("display template must declare exactly one root section")


def validate_presentation_template(
    source: str,
    templates: Mapping[str, str] | None = None,
    template_name: str | None = None,
) -> frozenset[str]:
    """Parse and reject text-producing constructs before historical rendering."""
    return compile_presentation_template(source, templates, template_name).dependencies


@dataclass(frozen=True, slots=True)
class CompiledPresentationTemplate:
    template: BoundTemplate
    dependencies: frozenset[str]

    def render(self, context: PresentationContext) -> DisplayDocument:
        value = context.input if context.side == "input" else context.output
        scope = {
            "value": value,
            "input": context.input,
            "output": context.output,
            "variables": context.variables,
            "variants": context.variants,
            "side": context.side,
            "model": context.model,
            "inference_id": context.inference_id,
            "address": context.address.model_dump(mode="json"),
            "locale": context.locale,
        }
        elements: list[DisplayElement] = []
        render_context = DisplayRenderContext(self.template, globals=scope, elements=elements)
        buffer = StringIO()
        self.template.render_with_context(render_context, buffer)
        if buffer.getvalue().strip():
            raise ValueError("display templates cannot emit text")
        if len(elements) != 1 or not isinstance(elements[0], DisplaySection):
            raise ValueError("display template must produce exactly one root section")
        return DisplayDocument(root=elements[0])


def compile_presentation_template(
    source: str,
    templates: Mapping[str, str] | None = None,
    template_name: str | None = None,
) -> CompiledPresentationTemplate:
    sources = dict(templates or {})
    if template_name is not None:
        sources[template_name] = source
    env = _environment(sources)
    template = env.get_template(template_name) if template_name is not None else env.from_string(source)
    _obvious_root(template)
    reached: set[str] = set()
    _audit_template(template, reached, set())
    return CompiledPresentationTemplate(template, frozenset(reached))


def render_presentation_template(
    source: str,
    context: PresentationContext,
    templates: Mapping[str, str] | None = None,
    template_name: str | None = None,
) -> DisplayDocument:
    """Execute typed tags and build a single-section display document."""
    return compile_presentation_template(source, templates, template_name).render(context)
