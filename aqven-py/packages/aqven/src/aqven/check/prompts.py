import posixpath
import re
from collections.abc import Iterable, Iterator, Mapping, Sequence
from dataclasses import dataclass
from typing import Final

from liquid.ast import BlockNode, ConditionalBlockNode, Node
from liquid.builtin.expressions import FilteredExpression, Path, StringLiteral
from liquid.builtin.output import OutputNode
from liquid.builtin.tags.case_tag import CaseNode, MultiExpressionBlockNode
from liquid.builtin.tags.for_tag import ForNode
from liquid.builtin.tags.if_tag import IfNode
from liquid.context import RenderContext
from liquid.exceptions import LiquidError, TemplateNotFoundError
from liquid.expression import Expression
from liquid.span import Span
from liquid.static_analysis import TemplateAnalysis, Variable
from liquid.template import BoundTemplate
from liquid.token import Token

from aqven.check.conditions import condition_problems, follow, path_annotation, resolved
from aqven.check.context import CheckContext
from aqven.check.inferences import variant_file, variant_refs
from aqven.check.shapes import Missing, NotList, Opaque, enum_values, is_list, is_media, max_items, step_element
from aqven.check.templates import (
    ALLOWED_FILTERS,
    ALLOWED_TAGS,
    OUTPUT_FORMAT,
    SERVICE_TAGS,
    IncludeLoader,
    MessageNode,
    prompt_environment,
    walk,
)
from aqven.diagnostics import Diagnostic, DiagnosticCode, diagnostic
from aqven.loader import LoadedInference, SourceSpec, include_candidates, text_file, text_key, within
from aqven.spec import InferenceSpec, VariantSlot, annotated_record

CONDITION_RULE: Final = "R-T3"
LOOP_RULE: Final = "R-T5"
PROMPT_KEY: Final = "prompt"
VARIANTS_VARIABLE: Final = "variants"
IN_PREFIX: Final = "$in."
SELECTOR_ROOT: Final = re.compile(r"[.\[]")


@dataclass(frozen=True, slots=True)
class PromptSource:
    file: str
    text: str


@dataclass(frozen=True, slots=True)
class PromptFiles:
    main: PromptSource
    folder: str
    stem: str
    loader: IncludeLoader

    def by_name(self, name: str) -> PromptSource:
        file = self.loader.served.get(name)
        return PromptSource(file, self.loader.texts[file]) if file is not None else self.main

    def by_text(self, text: str) -> PromptSource:
        included = (PromptSource(file, self.loader.texts[file]) for file in self.loader.served.values())
        return next((source for source in included if source.text == text), self.main)

    def is_fragment(self, name: str) -> bool:
        file = self.loader.served.get(name)
        return file is not None and not within(file, self.folder)

    def local_keys(self) -> frozenset[str]:
        keys = (text_key(self.stem, file) for file in (self.main.file, *self.loader.served.values()))
        return frozenset(key for key in keys if key is not None)


@dataclass(frozen=True, slots=True)
class Template:
    files: PromptFiles
    bound: BoundTemplate
    analysis: TemplateAnalysis


def check_prompts(context: CheckContext) -> Iterable[Diagnostic]:
    return tuple(
        item
        for loaded in context.project.inferences.values()
        if loaded.source is not None
        for item in _inference(context, loaded, loaded.source)
    )


def _main_prompt(context: CheckContext, loaded: LoadedInference, spec: InferenceSpec) -> PromptSource | None:
    texts = context.project.texts
    file = next((path for path in _prompt_candidates(loaded, spec) if path in texts), None)
    return PromptSource(file, texts[file]) if file is not None else None


def _prompt_candidates(loaded: LoadedInference, spec: InferenceSpec) -> tuple[str, ...]:
    if spec.prompt is None:
        return (text_file(loaded.stem, PROMPT_KEY),)
    path = spec.prompt_path
    return include_candidates((loaded.folder,), path) if path is not None else ()


def _inference(
    context: CheckContext, loaded: LoadedInference, source: SourceSpec[InferenceSpec]
) -> Iterator[Diagnostic]:
    spec = source.spec
    main = _main_prompt(context, loaded, spec)
    adjacent = text_file(loaded.stem, PROMPT_KEY)
    shadowed = spec.prompt is not None and PROMPT_KEY in loaded.texts and (main is None or main.file != adjacent)
    if shadowed:
        message = f"{spec.prompt} shadows {adjacent}: the file next to the inference is not used"
        yield diagnostic(DiagnosticCode.W_PROMPT_SHADOWED, source.path, (PROMPT_KEY,), message)
    ignored = frozenset({PROMPT_KEY}) if shadowed else frozenset[str]()
    if spec.prompt_code is not None:
        yield from _code_prompt(loaded, source.path, spec, ignored)
        return
    if main is None:
        yield _missing(loaded, source.path, spec)
        yield from _orphans(loaded, ignored)
        return
    yield from _template_prompt(context, loaded, spec, main, ignored)


def _missing(loaded: LoadedInference, file: str, spec: InferenceSpec) -> Diagnostic:
    if spec.prompt_path is None:
        message = (
            f"prompt not found: expected {text_file(loaded.stem, PROMPT_KEY)}, or prompt: a path to .md or a function"
        )
        return diagnostic(DiagnosticCode.E_PROMPT_MISSING, file, (), message)
    message = (
        f"file {spec.prompt_path} not found relative to the inference folder {loaded.folder or '.'} or the project root"
    )
    return diagnostic(DiagnosticCode.E_PROMPT_MISSING, file, (PROMPT_KEY,), message)


def _code_prompt(
    loaded: LoadedInference, file: str, spec: InferenceSpec, ignored: frozenset[str]
) -> Iterator[Diagnostic]:
    yield from _orphans(loaded, ignored)
    if spec.variants is None:
        return
    message = (
        "variants slots belong to a template prompt; a choice more complex than one input equality needs a code prompt"
    )
    yield diagnostic(DiagnosticCode.E_SPEC_INVALID, file, ("variants",), message)


def _template_prompt(
    context: CheckContext, loaded: LoadedInference, spec: InferenceSpec, main: PromptSource, ignored: frozenset[str]
) -> Iterator[Diagnostic]:
    slots = spec.variants or {}
    texts = context.project.texts
    files = sorted(
        {
            found
            for name, slot in slots.items()
            for _, variant in variant_refs(name, slot)
            if (found := variant_file(context, loaded, name, variant)) is not None
        }
    )
    sources = [PromptSource(path, texts[path]) for path in files]
    parsed = [_parse(_files(context, loaded, source)) for source in (main, *sources)]
    failures = [item for item in parsed if isinstance(item, Diagnostic)]
    templates = [item for item in parsed if isinstance(item, Template)]
    if failures:
        yield from failures
        return
    reachable = {key for template in templates for key in template.files.local_keys()}
    yield from _orphans(loaded, frozenset({*reachable, *ignored}))
    for template in templates:
        yield from _structure(template)
        yield from _fragment_variables(template)
    inputs = {decl.name: context.refs.field_annotation(decl) for decl in spec.in_}
    variables = {VARIANTS_VARIABLE: annotated_record(VARIANTS_VARIABLE, dict.fromkeys(slots, str))} if slots else {}
    yield from _usage(templates[0], templates[1:], inputs, slots)
    yield from _checked(templates[0], {**inputs, **variables}, frozenset({OUTPUT_FORMAT}))
    for template in templates[1:]:
        yield from _checked(template, inputs, frozenset())


def _files(context: CheckContext, loaded: LoadedInference, main: PromptSource) -> PromptFiles:
    folders = (posixpath.dirname(main.file), loaded.folder)
    return PromptFiles(main, loaded.folder, loaded.stem, IncludeLoader(context.project.texts, folders))


def _orphans(loaded: LoadedInference, reachable: frozenset[str]) -> Iterator[Diagnostic]:
    for key in sorted(set(loaded.texts) - reachable):
        message = (
            f"file {key}.md is unreachable from the prompt of inference {loaded.inference_id}: no template includes it"
        )
        yield diagnostic(DiagnosticCode.E_ORPHAN_FILE, text_file(loaded.stem, key), (), message)


def _fragment_variables(template: Template) -> Iterator[Diagnostic]:
    files = template.files
    found = ((name, item.span) for name, variables in template.analysis.globals.items() for item in variables)
    for name, span in ((name, span) for name, span in found if files.is_fragment(span.template_name)):
        message = (
            f"a shared fragment is static: variable {name} is not allowed in it, the inference prompt reads the inputs"
        )
        yield _span_at(DiagnosticCode.E_PROMPT_VARIABLE_UNDECLARED, files, span, message)


def _parse(files: PromptFiles) -> Template | Diagnostic:
    main = files.main
    environment = prompt_environment(files.loader)
    try:
        bound = environment.from_string(main.text, name=main.file)
        analysis = bound.analyze(include_partials=True)
    except TemplateNotFoundError as error:
        return _liquid_problem(DiagnosticCode.E_FRAGMENT_MISSING, files, error, "fragment or partial not found")
    except LiquidError as error:
        return _liquid_problem(DiagnosticCode.E_PROMPT_SYNTAX, files, error, "template parse error")
    return Template(files, bound, analysis)


def _liquid_problem(code: DiagnosticCode, files: PromptFiles, error: LiquidError, prefix: str) -> Diagnostic:
    token = error.token
    source = files.by_text(token.source) if token is not None else files.main
    index = token.start_index if token is not None else -1
    detail = str(error).splitlines()[0] if str(error) else type(error).__name__
    return _at(code, source, index, f"{prefix}: {detail}")


def _structure(template: Template) -> Iterator[Diagnostic]:
    files = template.files
    analysis = template.analysis
    for tag in sorted(set(analysis.tags) - ALLOWED_TAGS - SERVICE_TAGS):
        yield _span_at(DiagnosticCode.E_PROMPT_TAG_FORBIDDEN, files, analysis.tags[tag][0], f"tag {tag} is not allowed")
    for name in sorted(set(analysis.filters) - ALLOWED_FILTERS):
        message = f"filter {name} is not allowed: formatting belongs in code, not in the template"
        yield _span_at(DiagnosticCode.E_PROMPT_FILTER_FORBIDDEN, files, analysis.filters[name][0], message)
    for walked in walk(template.bound):
        if isinstance(walked.node, MessageNode) and walked.depth > 0:
            message = "{% message %} is allowed only at the top level of the template"
            yield _token_at(DiagnosticCode.E_PROMPT_MESSAGE_NESTED, files, walked.node.token, message)


def _usage(
    main: Template, variants: Sequence[Template], inputs: Mapping[str, object | None], slots: Mapping[str, VariantSlot]
) -> Iterator[Diagnostic]:
    globals_ = _dynamic_globals(main)
    if not globals_ and not main.analysis.tags and not slots:
        return
    count = len(globals_.get(OUTPUT_FORMAT, []))
    if count != 1:
        message = f"{{{{ {OUTPUT_FORMAT} }}}} occurs {count} times, but must occur exactly once"
        yield diagnostic(DiagnosticCode.E_PROMPT_OUTPUT_FORMAT, main.files.main.file, (), message)
    selectors = {SELECTOR_ROOT.split(slot.on.removeprefix(IN_PREFIX))[0] for slot in slots.values()}
    used = {name for template in (main, *variants) for name in _dynamic_globals(template)} | selectors
    for name in (name for name in inputs if name not in used):
        message = f"input {name} is declared, but the template does not use it"
        yield diagnostic(DiagnosticCode.E_PROMPT_INPUT_UNUSED, main.files.main.file, (), message)
    rendered = {str(item.segments[1]) for item in globals_.get(VARIANTS_VARIABLE, []) if len(item.segments) > 1}
    for slot in (slot for slot in slots if slot not in rendered):
        message = (
            f"variants slot {slot} is declared, but the prompt does not render {{{{ {VARIANTS_VARIABLE}.{slot} }}}}"
        )
        yield diagnostic(DiagnosticCode.E_PROMPT_INPUT_UNUSED, main.files.main.file, (), message)


def _checked(template: Template, scope: Mapping[str, object | None], reserved: frozenset[str]) -> Iterator[Diagnostic]:
    if not template.analysis.globals and not template.analysis.tags:
        return
    for name, variables in _dynamic_globals(template).items():
        yield from () if name in reserved else _variables(template.files, name, variables, scope)
    yield from _nodes(template, scope)


def _dynamic_globals(template: Template) -> Mapping[str, Sequence[Variable]]:
    return {
        name: dynamic
        for name, variables in template.analysis.globals.items()
        if (dynamic := [item for item in variables if not template.files.is_fragment(item.span.template_name)])
    }


def _variables(
    files: PromptFiles,
    name: str,
    variables: Sequence[Variable],
    inputs: Mapping[str, object | None],
) -> Iterator[Diagnostic]:
    if name not in inputs:
        message = f"variable {name} is not declared in the inference inputs"
        yield _span_at(DiagnosticCode.E_PROMPT_VARIABLE_UNDECLARED, files, variables[0].span, message)
        return
    annotation = inputs[name]
    if annotation is None:
        return
    for variable in variables:
        outcome = follow(annotation, variable.segments[1:])
        yield from _path_problem(files, variable, outcome)


def _nodes(template: Template, inputs: Mapping[str, object | None]) -> Iterator[Diagnostic]:
    context = RenderContext(template.bound)
    return _visit(template, template.bound.nodes, dict(inputs), context, 0)


def _visit(
    template: Template,
    nodes: Iterable[Node],
    scope: Mapping[str, object | None],
    context: RenderContext,
    loops: int,
) -> Iterator[Diagnostic]:
    for node in nodes:
        yield from _node_rules(template, node, scope, loops)
        inner_scope = _for_scope(node, scope)
        inner_loops = loops + 1 if isinstance(node, ForNode) else loops
        children = node.children(context, include_partials=True)
        yield from _visit(template, children, inner_scope, context, inner_loops)


def _node_rules(template: Template, node: Node, scope: Mapping[str, object | None], loops: int) -> Iterator[Diagnostic]:
    match node:
        case OutputNode():
            yield from _output(template, node, scope)
        case CaseNode():
            yield from _case(template, node, scope)
        case IfNode():
            yield from _condition(template, node.condition, scope, node.token)
        case ConditionalBlockNode():
            yield from _condition(template, node.expression, scope, node.token)
        case ForNode():
            yield from _for(template, node, scope, loops)
        case _:
            return


def _condition(
    template: Template, expression: Expression, scope: Mapping[str, object | None], token: Token
) -> Iterator[Diagnostic]:
    for problem in condition_problems(expression, scope):
        yield _token_at(DiagnosticCode.E_PROMPT_TAG_FORBIDDEN, template.files, token, problem, rule=CONDITION_RULE)


def _for(template: Template, node: ForNode, scope: Mapping[str, object | None], loops: int) -> Iterator[Diagnostic]:
    files = template.files
    if loops > 0:
        message = "nested {% for %} is not allowed: loop depth in a template is at most 1"
        yield _token_at(DiagnosticCode.E_PROMPT_TAG_FORBIDDEN, files, node.token, message, rule=LOOP_RULE)
    iterable = node.expression.iterable
    if not isinstance(iterable, Path):
        message = f"{{% for %}} over '{iterable}': only an input array field can be iterated"
        yield _token_at(DiagnosticCode.E_PROMPT_TAG_FORBIDDEN, files, node.token, message, rule=LOOP_RULE)
        return
    annotation = resolved(path_annotation(iterable, scope))
    problem = _iterable_problem(iterable, annotation) if annotation is not None else None
    if problem is None:
        return
    yield _token_at(DiagnosticCode.E_PROMPT_TAG_FORBIDDEN, files, node.token, problem, rule=LOOP_RULE)


def _iterable_problem(iterable: Path, annotation: object) -> str | None:
    if not is_list(annotation):
        return f"{{% for %}} over {iterable}: the field type is not an array"
    if max_items(annotation) is None:
        return f"{{% for %}} over {iterable}: the array has no maxItems"
    return None


def _output(template: Template, node: OutputNode, scope: Mapping[str, object | None]) -> Iterator[Diagnostic]:
    expression = node.expression
    left = expression.left if isinstance(expression, FilteredExpression) else expression
    annotation = resolved(path_annotation(left, scope))
    if annotation is None or not is_media(annotation):
        return
    message = (
        f"media slot {left} cannot be rendered as text: media is sent as a message part, use it only in conditions"
    )
    yield _token_at(DiagnosticCode.E_PROMPT_MEDIA_RENDERED, template.files, node.token, message)


def _case(template: Template, node: CaseNode, scope: Mapping[str, object | None]) -> Iterator[Diagnostic]:
    annotation = resolved(path_annotation(node.expression, scope))
    values = enum_values(annotation) if annotation is not None else None
    files = template.files
    if any(isinstance(block, BlockNode) for block in node.blocks):
        message = "{% else %} in {% case %} is not allowed: when branches list every enum value"
        yield _token_at(DiagnosticCode.E_PROMPT_CASE_NOT_EXHAUSTIVE, files, node.token, message)
    if values is None:
        return
    covered = {
        value for block in node.blocks if isinstance(block, MultiExpressionBlockNode) for value in _when_values(block)
    }
    missing = [value for value in values if value not in covered]
    if missing:
        message = f"{{% case {node.expression} %}} does not cover values {', '.join(missing)}"
        yield _token_at(DiagnosticCode.E_PROMPT_CASE_NOT_EXHAUSTIVE, files, node.token, message)


def _when_values(block: MultiExpressionBlockNode) -> tuple[str, ...]:
    return tuple(item.value for item in block.expression.children() if isinstance(item, StringLiteral))


def _for_scope(node: Node, scope: Mapping[str, object | None]) -> Mapping[str, object | None]:
    if not isinstance(node, ForNode):
        return scope
    loop = node.expression
    iterable = resolved(path_annotation(loop.iterable, scope))
    element = resolved(step_element(iterable)) if iterable is not None else None
    return {**scope, loop.identifier: element}


def _path_problem(files: PromptFiles, variable: Variable, outcome: object) -> Iterator[Diagnostic]:
    match outcome:
        case Missing():
            message = f"variable {variable}: the value has no field {outcome.name}"
            yield _span_at(DiagnosticCode.E_PROMPT_VARIABLE_UNDECLARED, files, variable.span, message)
        case Opaque():
            message = f"variable {variable}: a Dynamic value can be rendered only as a whole"
            yield _span_at(DiagnosticCode.E_OPAQUE_ACCESS, files, variable.span, message)
        case NotList():
            message = f"variable {variable}: an index applies only to a list"
            yield _span_at(DiagnosticCode.E_PROMPT_VARIABLE_UNDECLARED, files, variable.span, message)
        case _:
            return


def _span_at(code: DiagnosticCode, files: PromptFiles, span: Span, message: str) -> Diagnostic:
    return _at(code, files.by_name(span.template_name), span.index, message)


def _token_at(
    code: DiagnosticCode, files: PromptFiles, token: Token, message: str, *, rule: str | None = None
) -> Diagnostic:
    return _at(code, files.by_text(token.source), token.start_index, message, rule=rule)


def _at(code: DiagnosticCode, source: PromptSource, index: int, message: str, *, rule: str | None = None) -> Diagnostic:
    line, column = _line_col(source.text, index)
    return diagnostic(code, source.file, (), message, line=line, column=column, rule=rule)


def _line_col(text: str, index: int) -> tuple[int | None, int | None]:
    if index < 0 or index > len(text):
        return None, None
    line = text.count("\n", 0, index) + 1
    column = index - (text.rfind("\n", 0, index) + 1) + 1
    return line, column
