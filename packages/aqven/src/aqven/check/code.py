import ast
import inspect
from collections.abc import Callable, Iterable, Iterator, Mapping, Sequence
from dataclasses import dataclass
from enum import StrEnum
from typing import Any, Final, get_type_hints

from pydantic import JsonValue

from aqven.check.context import CheckContext
from aqven.check.nodes import typed_entries
from aqven.check.resolver import CodeFailure
from aqven.check.typeinfo import decl_type_id
from aqven.diagnostics import Diagnostic, DiagnosticCode, diagnostic
from aqven.loader import SourceSpec, YamlPath, is_bare, spec_files
from aqven.runtime.steps import JobHandle, JobPoll
from aqven.spec import MEDIA_TYPES, CodeNodeSpec, FieldDecl, InferenceSpec, RenderedPrompt, ToolSpec

CONTEXT_PARAMETER: Final = "ctx"
RETURN_HINT: Final = "return"
PYTHON_SUFFIX: Final = ".py"
DOCSTRING_NODES: Final = (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)
JOB_POLL_FORM: Final[Any] = JobPoll


class CodeKind(StrEnum):
    STEP = "step"
    TOOL = "tool"
    JOB_START = "job_start"
    JOB_POLL = "job_poll"
    PROMPT = "prompt"


@dataclass(frozen=True, slots=True)
class CodeUse:
    file: str
    path: YamlPath
    ref: str
    kind: CodeKind
    inputs: Sequence[FieldDecl]
    output: object | None


type SignatureCheck = Callable[[CheckContext, CodeUse, object], Iterator[str]]


def check_code(context: CheckContext) -> Iterable[Diagnostic]:
    listed = (*_node_uses(context), *_tool_uses(context), *_prompt_uses(context))
    uses = (use for use in listed if not context.alias_failed(use.file, use.path))
    return (*(item for use in uses for item in _use(context, use)), *_docstrings(context))


def _node_uses(context: CheckContext) -> Iterator[CodeUse]:
    for entry, code in typed_entries(context.graph, CodeNodeSpec):
        yield CodeUse(entry.file, ("run",), code.run, CodeKind.STEP, code.in_, context.refs.node_output(entry))


def _tool_uses(context: CheckContext) -> Iterator[CodeUse]:
    for tool_id, source in context.project.tools.items():
        yield from _tool_use(source, context.refs.tool_record(tool_id, "out"))


def _tool_use(source: SourceSpec[ToolSpec], output: object | None) -> Iterator[CodeUse]:
    tool = source.spec
    if tool.run is None:
        return
    if tool.wait is None:
        yield CodeUse(source.path, ("run",), tool.run, CodeKind.TOOL, tool.in_, output)
        return
    yield CodeUse(source.path, ("run",), tool.run, CodeKind.JOB_START, tool.in_, output)
    yield CodeUse(source.path, ("wait", "poll"), tool.wait.poll, CodeKind.JOB_POLL, (), output)


def _prompt_uses(context: CheckContext) -> Iterator[CodeUse]:
    for loaded in context.project.inferences.values():
        source = loaded.source
        if source is not None:
            yield from _prompt_use(source.path, source.spec)


def _prompt_use(file: str, spec: InferenceSpec) -> Iterator[CodeUse]:
    if spec.prompt_code is None:
        return
    inputs = [decl for decl in spec.in_ if decl_type_id(decl) not in MEDIA_TYPES]
    yield CodeUse(file, ("prompt",), spec.prompt_code, CodeKind.PROMPT, inputs, None)


def _use(context: CheckContext, use: CodeUse) -> Iterator[Diagnostic]:
    resolved = context.code.resolve(use.ref)
    if isinstance(resolved, CodeFailure):
        yield unresolved(context, use.file, use.path, resolved)
        return
    for problem in SIGNATURE_CHECKS[use.kind](context, use, resolved.value):
        yield diagnostic(DiagnosticCode.E_CODE_SIGNATURE_MISMATCH, use.file, use.path, f"{use.ref}: {problem}")


def unresolved(context: CheckContext, file: str, path: YamlPath, failure: CodeFailure) -> Diagnostic:
    alias = context.alias(file, path)
    written = f"{alias.written} → " if alias is not None else ""
    bare = alias is not None and is_bare(alias.written) and failure.missing
    code = DiagnosticCode.E_CODE_NOT_FOUND if bare else DiagnosticCode.E_CODE_REF_UNRESOLVED
    return diagnostic(code, file, path, f"reference {written}{failure.ref} does not resolve: {failure.message}")


def _step(context: CheckContext, use: CodeUse, value: object) -> Iterator[str]:
    function = _function(value)
    if function is None:
        yield "expected a step function"
        return
    if inspect.iscoroutinefunction(function):
        yield "a code step is a synchronous function; effects and network calls belong in a tool node"
    yield from _parameters(context, function, use.inputs, skip=0)
    yield from _returns_output(context, function, use.output)


def _tool(context: CheckContext, use: CodeUse, value: object) -> Iterator[str]:
    function = _async_function(value)
    if function is None:
        yield "expected async def fn(ctx: ToolContext, ...)"
        return
    yield from _context_parameter(function)
    yield from _parameters(context, function, use.inputs, skip=1)
    yield from _returns_output(context, function, use.output)


def _job_start(context: CheckContext, use: CodeUse, value: object) -> Iterator[str]:
    function = _async_function(value)
    if function is None:
        yield "expected async def fn(ctx: ToolContext, ...) -> JobHandle"
        return
    yield from _context_parameter(function)
    yield from _parameters(context, function, use.inputs, skip=1)
    hints = hints_of(function)
    if hints is None or hints.get(RETURN_HINT) is not JobHandle:
        yield "starting a long job returns JobHandle"


def _job_poll(context: CheckContext, use: CodeUse, value: object) -> Iterator[str]:
    function = _async_function(value)
    if function is None:
        yield "expected async def fn(ctx: ToolContext, job: JobHandle) -> JobPoll[...]"
        return
    names = [parameter.name for parameter in inspect.signature(function).parameters.values()]
    hints = hints_of(function) or {}
    if len(names) != 2 or names[0] != CONTEXT_PARAMETER or hints.get(names[1]) is not JobHandle:
        yield "polling a long job takes (ctx: ToolContext, job: JobHandle)"
    output = use.output
    expected = _job_poll_of(output) if output is not None else None
    if expected is not None and not same_schema(context, hints.get(RETURN_HINT), expected):
        yield "polling returns JobPoll[<tool out model>]"


def _prompt(context: CheckContext, use: CodeUse, value: object) -> Iterator[str]:
    function = _function(value)
    if function is None or inspect.iscoroutinefunction(function):
        yield "a level 3 prompt is a synchronous function that returns RenderedPrompt"
        return
    yield from _parameters(context, function, use.inputs, skip=0)
    hints = hints_of(function)
    if hints is None or hints.get(RETURN_HINT) is not RenderedPrompt:
        yield "a level 3 prompt returns RenderedPrompt"


SIGNATURE_CHECKS: Final[Mapping[CodeKind, SignatureCheck]] = {
    CodeKind.STEP: _step,
    CodeKind.TOOL: _tool,
    CodeKind.JOB_START: _job_start,
    CodeKind.JOB_POLL: _job_poll,
    CodeKind.PROMPT: _prompt,
}


def _function(value: object) -> Callable[..., object] | None:
    return value if inspect.isfunction(value) else None


def _async_function(value: object) -> Callable[..., object] | None:
    function = _function(value)
    return function if function is not None and inspect.iscoroutinefunction(function) else None


def hints_of(function: Callable[..., object]) -> Mapping[str, object] | None:
    try:
        return get_type_hints(function, include_extras=True)
    except Exception:
        return None


def _context_parameter(function: Callable[..., object]) -> Iterator[str]:
    names = list(inspect.signature(function).parameters)
    if names and names[0] == CONTEXT_PARAMETER:
        return
    yield f"the first parameter is {CONTEXT_PARAMETER}: ToolContext"


def _parameters(
    context: CheckContext,
    function: Callable[..., object],
    inputs: Sequence[FieldDecl],
    *,
    skip: int,
) -> Iterator[str]:
    names = list(inspect.signature(function).parameters)[skip:]
    declared = [decl.name for decl in inputs]
    if names != declared:
        listed = ", ".join(names) or "—"
        yield f"parameters {listed} do not match in by name and order: {', '.join(declared) or '—'}"
        return
    hints = hints_of(function)
    if hints is None:
        yield "type annotations cannot be evaluated"
        return
    for decl in inputs:
        expected = context.refs.field_annotation(decl)
        if expected is None or same_schema(context, hints.get(decl.name), expected):
            continue
        yield f"parameter {decl.name}: the annotation schema does not match type {decl.type} and its constraints"


def _returns_output(context: CheckContext, function: Callable[..., object], output: object | None) -> Iterator[str]:
    hints = hints_of(function)
    if hints is None or output is None:
        return
    if same_schema(context, hints.get(RETURN_HINT), output):
        return
    yield "the return model schema does not match out (field names, order, types and constraints)"


def same_schema(context: CheckContext, annotation: object, expected: object) -> bool:
    if annotation is None:
        return False
    actual: JsonValue | None = context.refs.schema(annotation)
    wanted: JsonValue | None = context.refs.schema(expected)
    return actual is not None and actual == wanted


def _job_poll_of(output: object) -> object:
    alias: object = JOB_POLL_FORM[output]
    return alias


def _docstrings(context: CheckContext) -> Iterator[Diagnostic]:
    root = context.project.root
    for path in (path for path in spec_files(root) if path.endswith(PYTHON_SUFFIX)):
        yield from _file_docstrings(path, (root / path).read_text(encoding="utf-8"))


def _file_docstrings(path: str, text: str) -> Iterator[Diagnostic]:
    try:
        tree = ast.parse(text, filename=path)
    except SyntaxError:
        return
    if ast.get_docstring(tree) is not None:
        yield diagnostic(DiagnosticCode.E_DOCSTRING, path, (), "a module docstring is not allowed", line=1, column=1)
    for node in ast.walk(tree):
        if isinstance(node, DOCSTRING_NODES) and ast.get_docstring(node) is not None:
            message = (
                f"a docstring on {node.name} is not allowed: instructions go to the prompt, explanations to the docs"
            )
            yield diagnostic(
                DiagnosticCode.E_DOCSTRING, path, (), message, line=node.lineno, column=node.col_offset + 1
            )
