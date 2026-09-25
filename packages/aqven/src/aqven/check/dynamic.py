import ast
from collections.abc import Callable, Iterable, Iterator, Mapping
from dataclasses import dataclass
from typing import Final

from aqven.check.context import CheckContext
from aqven.check.graph import NodeEntry
from aqven.check.nodes import FieldRole, field_sites, typed_entries
from aqven.check.scopes import InferenceScope, Resolution, Resolved
from aqven.check.shapes import Missing, NotList, Opaque, is_dynamic, max_items, step_element, unwrap
from aqven.diagnostics import Diagnostic, DiagnosticCode, diagnostic
from aqven.loader import YamlPath, spec_files
from aqven.spec import (
    BUILTIN_TYPE_IDS,
    DYNAMIC,
    RECORD_LABEL,
    BoundField,
    CodeNodeSpec,
    FieldSpec,
    FieldSpecTypeIssue,
    NarrowNodeSpec,
    OutputField,
    RecordType,
    TypeId,
    TypeRef,
    TypeRefSyntaxError,
    TypeSpec,
    UnionType,
    field_spec_type_problem,
    parse_type_ref,
)

type SchemaSource = Callable[[str], Resolution]

PYTHON_SUFFIX: Final = ".py"
FIELD_SPEC_MODULES: Final = frozenset({"aqven.spec", "aqven.spec.builtins"})
TYPE_KEYWORD: Final = "type"
REGISTRY_COPIED_KEYWORDS: Final = frozenset({"maxLength", "pattern", "enum", "minimum", "maximum"})
FIELD_SPEC_ISSUE_CODES: Final[Mapping[FieldSpecTypeIssue, DiagnosticCode]] = {
    FieldSpecTypeIssue.UNKNOWN: DiagnosticCode.E_TYPE_UNKNOWN,
    FieldSpecTypeIssue.FORBIDDEN: DiagnosticCode.E_SPEC_INVALID,
}


@dataclass(frozen=True, slots=True)
class OutputSite:
    file: str
    index: int
    field: OutputField
    source: SchemaSource | None
    requires_source: bool


@dataclass(frozen=True, slots=True)
class FieldSpecCall:
    file: str
    keywords: Mapping[str, ast.expr]

    def at(self, code: DiagnosticCode, node: ast.expr, message: str) -> Diagnostic:
        return diagnostic(code, self.file, (), message, line=node.lineno, column=node.col_offset + 1)


def check_dynamic(context: CheckContext) -> Iterable[Diagnostic]:
    outputs = (item for site in _output_sites(context) for item in _output(site))
    return (*outputs, *_value_type_hints(context), *_narrows(context), *_field_spec_calls(context))


def _value_type_hints(context: CheckContext) -> Iterator[Diagnostic]:
    for site in field_sites(context.graph):
        field = site.decl
        if site.role is not FieldRole.OUTPUT or not isinstance(field, OutputField | BoundField):
            continue
        hint = field.value_type
        if hint is None:
            continue
        path: YamlPath = (*site.path, "value_type")
        if field.type.removesuffix("?") != DYNAMIC:
            yield diagnostic(
                DiagnosticCode.E_DYNAMIC_VALUE_TYPE,
                site.file,
                path,
                f"value_type is allowed only on a Dynamic output, but {field.name} is {field.type}",
            )
            continue
        try:
            ref = parse_type_ref(hint)
        except TypeRefSyntaxError:
            continue  # check_types reports the invalid reference syntax.
        if ref.is_optional or ref.is_list:
            yield diagnostic(
                DiagnosticCode.E_DYNAMIC_VALUE_TYPE,
                site.file,
                path,
                f"value_type must name one record or union type, but {hint} is optional or a list",
            )
            continue
        target = context.project.types.get(ref.type_id)
        if target is not None and not isinstance(target.spec, RecordType | UnionType):
            yield diagnostic(
                DiagnosticCode.E_DYNAMIC_VALUE_TYPE,
                site.file,
                path,
                f"value_type must name a record or union type, but {hint} is {target.spec.type}",
            )


def _output_sites(context: CheckContext) -> Iterator[OutputSite]:
    for loaded in context.project.inferences.values():
        source = loaded.source
        if source is None:
            continue
        resolve = _inference_source(context, loaded.inference_id)
        yield from (OutputSite(source.path, index, field, resolve, True) for index, field in enumerate(source.spec.out))
    for source in context.project.tools.values():
        yield from (OutputSite(source.path, index, field, None, False) for index, field in enumerate(source.spec.out))
    for entry, spec in typed_entries(context.graph, CodeNodeSpec):
        resolve = _node_source(context, entry)
        yield from (OutputSite(entry.file, index, field, resolve, False) for index, field in enumerate(spec.out))


def _inference_source(context: CheckContext, inference_id: str) -> SchemaSource:
    scope = InferenceScope(inference_id)
    return lambda text: context.refs.resolve_inference(scope, text)


def _node_source(context: CheckContext, entry: NodeEntry) -> SchemaSource:
    scope = context.graph.scope_of(entry)
    return lambda text: context.refs.resolve(scope, text)


def _output(site: OutputSite) -> Iterator[Diagnostic]:
    field = site.field
    path: YamlPath = ("out", site.index)
    dynamic = field.type.removesuffix("?") == DYNAMIC
    if dynamic and field.limits is None:
        message = f"Dynamic output {field.name} requires limits{{max_fields, max_depth, max_text_length, max_items}}"
        yield diagnostic(DiagnosticCode.E_DYNAMIC_LIMITS, site.file, (*path, "type"), message)
    if not dynamic and field.limits is not None:
        message = f"limits is allowed only on a Dynamic output, but {field.name} is {field.type}"
        yield diagnostic(DiagnosticCode.E_DYNAMIC_LIMITS, site.file, (*path, "limits"), message)
    if not dynamic and field.schema_from is not None:
        message = f"schema_from is allowed only on a Dynamic output, but {field.name} is {field.type}"
        yield diagnostic(DiagnosticCode.E_DYNAMIC_SOURCE, site.file, (*path, "schema_from"), message)
    if dynamic and site.requires_source and field.schema_from is None:
        message = f"inference Dynamic output {field.name} requires schema_from: a $in path to FieldSpec[] with maxItems"
        yield diagnostic(DiagnosticCode.E_DYNAMIC_SOURCE, site.file, (*path, "type"), message)
    if dynamic and field.schema_from is not None and site.source is not None:
        yield from _schema_source(site.file, (*path, "schema_from"), field.schema_from, site.source(field.schema_from))


def _schema_source(file: str, path: YamlPath, text: str, resolution: Resolution) -> Iterator[Diagnostic]:
    if isinstance(resolution, Resolved) and resolution.annotation is None:
        return
    if isinstance(resolution, Resolved) and _field_specs(resolution.annotation):
        return
    message = f"schema_from {text} must point to FieldSpec[] with maxItems"
    yield diagnostic(DiagnosticCode.E_DYNAMIC_SOURCE, file, path, message)


def _field_specs(annotation: object) -> bool:
    element = step_element(annotation)
    fits = not isinstance(element, Missing | Opaque | NotList) and unwrap(element).core is FieldSpec
    return fits and max_items(annotation) is not None


def _narrows(context: CheckContext) -> Iterator[Diagnostic]:
    for entry, spec in typed_entries(context.graph, NarrowNodeSpec):
        yield from _narrow(context, entry, spec)


def _narrow(context: CheckContext, entry: NodeEntry, spec: NarrowNodeSpec) -> Iterator[Diagnostic]:
    target = context.project.types.get(TypeId(spec.to))
    if target is None or not isinstance(target.spec, RecordType | UnionType):
        message = f"narrow targets only a registry record or union, but {spec.to} is not such a type"
        yield diagnostic(DiagnosticCode.E_NARROW_TARGET, entry.file, ("to",), message)
    resolution = context.refs.resolve(context.graph.scope_of(entry), spec.from_)
    if not isinstance(resolution, Resolved) or resolution.annotation is None or is_dynamic(resolution.annotation):
        return
    message = f"narrow accepts only a Dynamic value, but {spec.from_} is already typed"
    yield diagnostic(DiagnosticCode.E_NARROW_TARGET, entry.file, ("from",), message)


def _field_spec_calls(context: CheckContext) -> Iterator[Diagnostic]:
    root = context.project.root
    types = context.type_models.specs
    for path in (path for path in spec_files(root) if path.endswith(PYTHON_SUFFIX)):
        calls = _file_field_spec_calls(path, (root / path).read_text(encoding="utf-8"))
        yield from (item for call in calls for item in _field_spec_call(call, types))


def _file_field_spec_calls(path: str, text: str) -> Iterator[FieldSpecCall]:
    try:
        tree = ast.parse(text, filename=path)
    except SyntaxError:
        return
    names = _field_spec_names(tree)
    calls = (node for node in ast.walk(tree) if isinstance(node, ast.Call) and _called_name(node) in names)
    for node in calls:
        yield FieldSpecCall(path, {keyword.arg: keyword.value for keyword in node.keywords if keyword.arg is not None})


def _called_name(call: ast.Call) -> str | None:
    return call.func.id if isinstance(call.func, ast.Name) else None


def _field_spec_names(tree: ast.Module) -> frozenset[str]:
    return frozenset(
        alias.asname or alias.name
        for node in ast.walk(tree)
        if isinstance(node, ast.ImportFrom) and node.module in FIELD_SPEC_MODULES
        for alias in node.names
        if alias.name == FieldSpec.__name__
    )


def _field_spec_call(call: FieldSpecCall, types: Mapping[TypeId, TypeSpec]) -> Iterator[Diagnostic]:
    written = call.keywords.get(TYPE_KEYWORD)
    if not isinstance(written, ast.Constant) or not isinstance(written.value, str):
        return
    ref = _type_ref(written.value)
    if isinstance(ref, str):
        yield call.at(DiagnosticCode.E_TYPE_REF_SYNTAX, written, f"FieldSpec: type reference {ref}")
        return
    problem = field_spec_type_problem(ref.type_id, types)
    if problem is not None:
        yield call.at(FIELD_SPEC_ISSUE_CODES[problem.issue], written, f"FieldSpec: {problem.message}")
        return
    copied = sorted(REGISTRY_COPIED_KEYWORDS & call.keywords.keys())
    if not copied or ref.type_id in BUILTIN_TYPE_IDS or ref.type_id == RECORD_LABEL:
        return
    message = (
        f"FieldSpec of registry type {ref.type_id}: constraints and enum values come from the type, "
        f"copies of {', '.join(copied)} in code are not allowed"
    )
    yield call.at(DiagnosticCode.E_TYPE_CONSTRAINT_MISMATCH, call.keywords[copied[0]], message)


def _type_ref(text: str) -> TypeRef | str:
    try:
        return parse_type_ref(text)
    except TypeRefSyntaxError as error:
        return f"{text!r}: {error.reason}"
