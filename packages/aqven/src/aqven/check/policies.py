import inspect
import re
from collections.abc import Callable, Iterable, Iterator, Mapping
from dataclasses import dataclass
from enum import StrEnum
from functools import partial
from typing import Final, Protocol, TypeAliasType, TypeVar, get_args, get_origin

from pydantic import BaseModel, JsonValue, TypeAdapter, ValidationError

from aqven.check.bindings import compatible
from aqven.check.code import hints_of, same_schema, unresolved
from aqven.check.context import CheckContext
from aqven.check.graph import NodeEntry
from aqven.check.nodes import typed_entries
from aqven.check.registry import known_agent, known_inference
from aqven.check.resolver import CodeTarget
from aqven.check.scopes import INFERENCE_ROOTS, Resolution, Resolved, Side, Unresolved
from aqven.check.shapes import (
    Missing,
    NotList,
    Opaque,
    is_list,
    is_optional,
    record_fields,
    step_element,
    step_field,
    unwrap,
)
from aqven.check.subjects import UNKNOWN_RECORDS, Evaluated, JudgeScope, inference_evaluated, subject_evaluated
from aqven.diagnostics import Diagnostic, DiagnosticCode, diagnostic, has_errors, templated_diagnostic
from aqven.loader import LoadedExperiment, YamlPath
from aqven.policies import (
    BUILTINS,
    EvalContext,
    ItemDecision,
    JoinDecision,
    JoinState,
    LoopState,
    RefPath,
    Slot,
    StopDecision,
    Verdict,
)
from aqven.policies.control import BestParams, DefaultParams, QuorumParams, StagnationParams, ThresholdParams
from aqven.policies.evaluators import (
    EXPECTED_CHECK,
    CitationsInSourcesParams,
    ExpectedParams,
    FieldParams,
    IdsInAllowedSetParams,
    LanguageParams,
    MaxWordsParams,
    NoPiiParams,
    RegexParams,
    UniqueItemsParams,
)
from aqven.spec import (
    EvaluatorRef,
    FieldStep,
    Locale,
    LoopNodeSpec,
    MapItemError,
    MapNodeSpec,
    ParallelNodeSpec,
    PolicyRef,
    RefSyntaxError,
    parse_ref,
)

RETURN_HINT: Final = "return"
OUT_PREFIX: Final = "$out."
SCORE_FIELD: Final = "score"
WILDCARDS: Final[tuple[object, ...]] = (object, BaseModel, JsonValue)
SCORES: Final[tuple[object, ...]] = (int, float, bool)

type Resolve = Callable[[str], Resolution]
type Shape = Callable[[object], bool]


@dataclass(frozen=True, slots=True)
class Generic:
    origin: object
    arguments: tuple[object | None, ...] = ()


@dataclass(frozen=True, slots=True)
class Contract:
    text: str
    arguments: tuple[object | None, ...]
    returns: Generic


@dataclass(frozen=True, slots=True)
class ContractProblem:
    text: str
    typed: bool = False


@dataclass(frozen=True, slots=True)
class UnknownHead:
    side: Side
    name: str
    fields: tuple[str, ...]


@dataclass(frozen=True, slots=True)
class Signature:
    names: tuple[str, ...]
    hints: Mapping[str, object]


class EvaluatorHost(StrEnum):
    INFERENCE_CHECK = "inference_check"
    EXPERIMENT_CHECK = "experiment_check"


@dataclass(frozen=True, slots=True)
class EvaluatorUse:
    file: str
    path: YamlPath
    ref: EvaluatorRef
    evaluated: Evaluated
    host: EvaluatorHost
    check: str = ""


@dataclass(frozen=True, slots=True)
class PolicySite:
    slot: Slot
    file: str
    path: YamlPath
    ref: PolicyRef | EvaluatorRef
    contract: Contract
    resolve: Resolve
    entry: NodeEntry | None = None
    use: EvaluatorUse | None = None


class SiteReports(Protocol):
    def mismatch(self, site: PolicySite, key: str, problem: str) -> Diagnostic: ...

    def reference(self, site: PolicySite, text: str, resolution: Unresolved) -> Diagnostic: ...

    def unbound(self, use: EvaluatorUse, judge: str, name: str, scope: JudgeScope) -> Diagnostic: ...


class StrictReports:
    def mismatch(self, site: PolicySite, key: str, problem: str) -> Diagnostic:
        message = f"{_label(site.ref)}: {problem} and the node types"
        return diagnostic(DiagnosticCode.E_CODE_SIGNATURE_MISMATCH, site.file, (*site.path, key), message)

    def reference(self, site: PolicySite, text: str, resolution: Unresolved) -> Diagnostic:
        message = f"{_label(site.ref)}: {resolution.message}"
        return diagnostic(PARAMS_CODES[site.slot], site.file, (*site.path, "with"), message)

    def unbound(self, use: EvaluatorUse, judge: str, name: str, scope: JudgeScope) -> Diagnostic:
        message = f"judge {judge}: input {name} is not found by name among the in and out of {scope.label}"
        return diagnostic(DiagnosticCode.E_CHECK_PARAMS, use.file, (*use.path, "inference"), message)


class ExperimentReports:
    def mismatch(self, site: PolicySite, key: str, problem: str) -> Diagnostic:
        evaluated = _evaluated(site)
        values = {
            "experiment": evaluated.owner,
            "check": _check(site),
            "problem": f"{_label(site.ref)}: {problem} and the types of {evaluated.label}",
            "fix": evaluated.typing,
        }
        return templated_diagnostic(DiagnosticCode.W_CHECK_CONTEXT_MISMATCH, site.file, (*site.path, key), values)

    def reference(self, site: PolicySite, text: str, resolution: Unresolved) -> Diagnostic:
        evaluated = _evaluated(site)
        head = unknown_head(evaluated, text)
        if head is None:
            return STRICT_REPORTS.reference(site, text, resolution)
        values = {
            "experiment": evaluated.owner,
            "check": _check(site),
            "ref": text,
            "field": head.name,
            "side": evaluated.sides.get(head.side, f"${head.side}"),
            "fields": ", ".join(head.fields) or NONE,
        }
        return templated_diagnostic(DiagnosticCode.E_CHECK_PATH_UNKNOWN, site.file, (*site.path, "with"), values)

    def unbound(self, use: EvaluatorUse, judge: str, name: str, scope: JudgeScope) -> Diagnostic:
        values = {
            "experiment": use.evaluated.owner,
            "judge": judge,
            "check": use.check,
            "field": name,
            "target": scope.label,
        }
        return templated_diagnostic(DiagnosticCode.W_JUDGE_INPUT_UNBOUND, use.file, (*use.path, "inference"), values)


type ShapeRule = Callable[[CheckContext, PolicySite, BaseModel], Iterator[str]]

CASELESS_HOSTS: Final[Mapping[EvaluatorHost, str]] = {
    EvaluatorHost.INFERENCE_CHECK: "an inference check runs on live requests, which have no case",
}
CASE_ONLY_HINT: Final = "move the comparison into a check of an experiment, or use a check that reads the output alone"

NONE: Final = "none"

PARAMS_CODES: Final[Mapping[Slot, DiagnosticCode]] = {
    Slot.JOIN: DiagnosticCode.E_POLICY_PARAMS,
    Slot.STOP: DiagnosticCode.E_POLICY_PARAMS,
    Slot.SELECT: DiagnosticCode.E_POLICY_PARAMS,
    Slot.ITEM_ERROR: DiagnosticCode.E_POLICY_PARAMS,
    Slot.EVALUATOR: DiagnosticCode.E_CHECK_PARAMS,
}
STRICT_REPORTS: Final[SiteReports] = StrictReports()
HOST_REPORTS: Final[Mapping[EvaluatorHost, SiteReports]] = {
    EvaluatorHost.INFERENCE_CHECK: STRICT_REPORTS,
    EvaluatorHost.EXPERIMENT_CHECK: ExperimentReports(),
}


def check_policies(context: CheckContext) -> Iterable[Diagnostic]:
    uses = tuple(evaluator_uses(context))
    evaluators = _evaluator_sites(context, uses)
    listed = (*_join_sites(context), *_loop_sites(context), *_item_sites(context), *evaluators)
    sites = (site for site in listed if not context.alias_failed(site.file, (*site.path, "run")))
    judges = (item for use in uses for item in _judge(context, use))
    caseless = (item for use in uses for item in _case_only(use))
    return (*(item for site in sites for item in _site(context, site)), *judges, *caseless)


def evaluator_uses(context: CheckContext) -> Iterator[EvaluatorUse]:
    checks = (
        EvaluatorUse(
            source.path,
            ("checks", index),
            check,
            inference_evaluated(context, loaded.inference_id),
            EvaluatorHost.INFERENCE_CHECK,
        )
        for loaded in context.project.inferences.values()
        if (source := loaded.source) is not None
        for index, check in enumerate(source.spec.checks or ())
    )
    experiments = (use for loaded in context.project.experiments.values() for use in _experiment_uses(context, loaded))
    return iter((*checks, *experiments))


def _experiment_uses(context: CheckContext, loaded: LoadedExperiment) -> Iterator[EvaluatorUse]:
    evaluated = subject_evaluated(context, loaded)
    source = loaded.source
    for index, check in enumerate(source.spec.checks or ()):
        yield EvaluatorUse(source.path, ("checks", index), check, evaluated, EvaluatorHost.EXPERIMENT_CHECK, check.id)


def _join_sites(context: CheckContext) -> Iterator[PolicySite]:
    for entry, spec in typed_entries(context.graph, ParallelNodeSpec):
        branch = _branch_output(context, entry, spec)
        contract = Contract(
            "(state: JoinState[T], params: P) -> JoinDecision[T]",
            (Generic(JoinState, (branch,)),),
            Generic(JoinDecision, (branch,)),
        )
        resolve = partial(context.refs.resolve, context.graph.own_scope(entry))
        yield PolicySite(Slot.JOIN, entry.file, ("join",), spec.join, contract, resolve, entry)


def _branch_output(context: CheckContext, entry: NodeEntry, spec: ParallelNodeSpec) -> object | None:
    inner = (context.graph.inner(entry, local) for local in spec.body.values())
    outputs = [context.refs.node_output(node) if node is not None else None for node in inner]
    schemas = [context.refs.schema(output) if output is not None else None for output in outputs]
    uniform = None not in schemas and all(schema == schemas[0] for schema in schemas)
    return outputs[0] if uniform else None


def _loop_sites(context: CheckContext) -> Iterator[PolicySite]:
    stop = Contract("(state: LoopState, params: P) -> StopDecision", (Generic(LoopState),), Generic(StopDecision))
    select = Contract("(state: LoopState, params: P) -> int", (Generic(LoopState),), Generic(int))
    for entry, spec in typed_entries(context.graph, LoopNodeSpec):
        resolve = partial(context.refs.resolve, context.graph.own_scope(entry))
        stops = [(Slot.STOP, ("stop", index), ref, stop) for index, ref in enumerate(spec.stop or ())]
        for slot, path, ref, contract in (*stops, (Slot.SELECT, ("select",), spec.select, select)):
            yield PolicySite(slot, entry.file, path, ref, contract, resolve, entry)


def _item_sites(context: CheckContext) -> Iterator[PolicySite]:
    for entry, spec in typed_entries(context.graph, MapNodeSpec):
        scope = context.graph.scope_of(entry)
        over = context.refs.resolve(scope, spec.over)
        element = step_element(over.annotation) if isinstance(over, Resolved) and over.annotation is not None else None
        item = None if isinstance(element, Missing | Opaque | NotList) else element
        inner = context.graph.inner(entry, spec.body)
        output = context.refs.node_output(inner) if inner is not None else None
        contract = Contract(
            "(item: T, error: MapItemError, params: P) -> ItemDecision[O]",
            (item, Generic(MapItemError)),
            Generic(ItemDecision, (output,)),
        )
        resolve = partial(context.refs.resolve, scope)
        yield PolicySite(Slot.ITEM_ERROR, entry.file, ("on_item_error",), spec.on_item_error, contract, resolve, entry)


def _evaluator_sites(context: CheckContext, uses: Iterable[EvaluatorUse]) -> Iterator[PolicySite]:
    for use in uses:
        if use.ref.inference is not None:
            continue
        hints = use.evaluated.hints
        contract = Contract(
            "(value: O, context: EvalContext[I, O], params: P) -> Verdict",
            (hints.out, Generic(EvalContext, (hints.in_, hints.out))),
            Generic(Verdict),
        )
        resolve = partial(context.refs.resolve_evaluated, use.evaluated.records)
        yield PolicySite(Slot.EVALUATOR, use.file, use.path, use.ref, contract, resolve, use=use)


def _site(context: CheckContext, site: PolicySite) -> Iterator[Diagnostic]:
    target = _target(context, site)
    if isinstance(target, Diagnostic):
        yield target
        return
    signature = _signature(target)
    key = "use" if site.ref.run is None else "run"
    found = [_contract_diagnostic(site, key, problem) for problem in _contract(context, site.contract, signature)]
    yield from found
    if has_errors(found) or signature is None:
        return
    yield from _params(context, site, signature.hints.get(signature.names[-1]))


def reports_of(site: PolicySite) -> SiteReports:
    return STRICT_REPORTS if site.use is None else HOST_REPORTS[site.use.host]


def _contract_diagnostic(site: PolicySite, key: str, problem: ContractProblem) -> Diagnostic:
    if problem.typed:
        return reports_of(site).mismatch(site, key, problem.text)
    message = f"{_label(site.ref)}: {problem.text}"
    return diagnostic(DiagnosticCode.E_CODE_SIGNATURE_MISMATCH, site.file, (*site.path, key), message)


def _target(context: CheckContext, site: PolicySite) -> object:
    run = site.ref.run
    resolved = context.code.resolve(run) if run is not None else None
    if isinstance(resolved, CodeTarget):
        return resolved.value
    if resolved is not None:
        return unresolved(context, site.file, (*site.path, "run"), resolved)
    builtins = BUILTINS[site.slot]
    found = builtins.get(site.ref.use or "")
    if found is not None:
        return found
    message = f"built-in policy {site.ref.use} does not exist in slot {site.slot.value}: {', '.join(builtins)}"
    return diagnostic(DiagnosticCode.E_POLICY_UNKNOWN, site.file, (*site.path, "use"), message)


def _signature(target: object) -> Signature | None:
    if not inspect.isfunction(target):
        return None
    hints = hints_of(target)
    return Signature(tuple(inspect.signature(target).parameters), hints) if hints is not None else None


def _contract(context: CheckContext, contract: Contract, signature: Signature | None) -> Iterator[ContractProblem]:
    if signature is None or len(signature.names) != len(contract.arguments) + 1:
        yield ContractProblem(f"expected a function {contract.text} with type annotations")
        return
    for name, expected in zip(signature.names, contract.arguments, strict=False):
        if not _matches(context, signature.hints.get(name), expected):
            yield ContractProblem(f"parameter {name} does not match contract {contract.text}", typed=True)
    if not _is_model(signature.hints.get(signature.names[-1])):
        yield ContractProblem(f"parameter {signature.names[-1]} must be the Pydantic model of the with parameters")
    if not _matches(context, signature.hints.get(RETURN_HINT), contract.returns):
        yield ContractProblem(f"the return type does not match contract {contract.text} and the node types")


def _matches(context: CheckContext, annotation: object, expected: object | None) -> bool:
    if not isinstance(expected, Generic):
        return _value_matches(context, annotation, expected)
    unaliased = _unaliased(annotation, expected)
    arguments = get_args(unaliased)
    same_origin = (get_origin(unaliased) or unaliased) is expected.origin
    return (
        same_origin
        and len(arguments) == len(expected.arguments)
        and all(
            _value_matches(context, actual, wanted)
            for actual, wanted in zip(arguments, expected.arguments, strict=True)
        )
    )


def _unaliased(annotation: object, expected: Generic) -> object:
    if isinstance(annotation, TypeAliasType) and annotation is not expected.origin:
        return annotation.__value__
    return annotation


def _value_matches(context: CheckContext, annotation: object, expected: object | None) -> bool:
    if expected is None or isinstance(annotation, TypeVar) or any(annotation is item for item in WILDCARDS):
        return True
    return same_schema(context, annotation, expected)


def _is_model(annotation: object) -> bool:
    return isinstance(annotation, type) and issubclass(annotation, BaseModel)


def _params(context: CheckContext, site: PolicySite, model: object) -> Iterator[Diagnostic]:
    if not isinstance(model, type) or not issubclass(model, BaseModel):
        return
    code = PARAMS_CODES[site.slot]
    path: YamlPath = (*site.path, "with")
    label = _label(site.ref)
    try:
        params = model.model_validate(site.ref.with_ or {})
    except ValidationError as error:
        problems = "; ".join(f"{'.'.join(str(part) for part in item['loc'])}: {item['msg']}" for item in error.errors())
        yield diagnostic(code, site.file, path, f"{label}: with does not pass model {model.__name__}: {problems}")
        return
    rule = SHAPE_RULES.get((site.slot, site.ref.use or ""))
    shapes = rule(context, site, params) if rule is not None else iter(())
    yield from _references(site, params)
    for problem in shapes:
        yield diagnostic(code, site.file, path, f"{label}: {problem}")


def _references(site: PolicySite, params: BaseModel) -> Iterator[Diagnostic]:
    data: dict[str, JsonValue] = params.model_dump(mode="json")
    texts = (
        text for name, info in type(params).model_fields.items() for text in _paths(info.annotation, data.get(name))
    )
    reports = reports_of(site)
    for text in texts:
        resolution = site.resolve(text)
        if isinstance(resolution, Unresolved):
            yield reports.reference(site, text, resolution)


def unknown_head(evaluated: Evaluated, text: str) -> UnknownHead | None:
    try:
        ref = parse_ref(text)
    except RefSyntaxError:
        return None
    side = INFERENCE_ROOTS.get(ref.root)
    head = ref.steps[0] if ref.steps else None
    if side is None or not isinstance(head, FieldStep):
        return None
    fields = record_fields(evaluated.records.side(side))
    if fields is None or head.name in fields:
        return None
    return UnknownHead(side, head.name, tuple(sorted(fields)))


def _evaluated(site: PolicySite) -> Evaluated:
    return site.use.evaluated if site.use is not None else Evaluated("", UNKNOWN_RECORDS)


def _check(site: PolicySite) -> str:
    return site.use.check if site.use is not None else ""


def _paths(annotation: object, value: JsonValue) -> tuple[str, ...]:
    if annotation is RefPath and isinstance(value, str):
        return (value,)
    if get_args(annotation) == (RefPath,) and isinstance(value, list):
        return tuple(item for item in value if isinstance(item, str))
    return ()


def _label(ref: PolicyRef | EvaluatorRef) -> str:
    return ref.use or ref.run or ""


def _judge(context: CheckContext, use: EvaluatorUse) -> Iterator[Diagnostic]:
    judge = use.ref.inference
    agent = use.ref.agent
    if judge is None or agent is None:
        return
    if not known_inference(context, judge):
        message = f"judge inference {judge} does not exist in the project"
        yield diagnostic(DiagnosticCode.E_INFERENCE_UNKNOWN, use.file, (*use.path, "inference"), message)
    if not known_agent(context, agent):
        yield diagnostic(
            DiagnosticCode.E_AGENT_UNKNOWN, use.file, (*use.path, "agent"), f"judge agent {agent} does not exist"
        )
    outputs = record_fields(context.refs.inference_record(judge, "out"))
    inputs = record_fields(context.refs.inference_record(judge, "in"))
    if outputs is None or inputs is None:
        return
    for problem in _judge_score(outputs):
        yield diagnostic(DiagnosticCode.E_CHECK_PARAMS, use.file, (*use.path, "inference"), f"judge {judge}: {problem}")
    for scope in use.evaluated.scopes:
        yield from _judge_inputs(context, use, judge, inputs, scope)


def _case_only(use: EvaluatorUse) -> Iterator[Diagnostic]:
    reason = CASELESS_HOSTS.get(use.host)
    if reason is None or use.ref.use != EXPECTED_CHECK:
        return
    message = (
        f"built-in {EXPECTED_CHECK} compares the output with the case expected_output "
        f"and is available in experiments only: {reason}"
    )
    yield diagnostic(DiagnosticCode.E_CHECK_PARAMS, use.file, (*use.path, "use"), message, hint=CASE_ONLY_HINT)


def _judge_score(outputs: Mapping[str, object]) -> Iterator[str]:
    score = outputs.get(SCORE_FIELD)
    if score is not None and any(unwrap(score).core is item for item in SCORES):
        return
    yield f"the judge out needs a field {SCORE_FIELD} of type Int, Float or Bool: the score is read from it"


def _judge_inputs(
    context: CheckContext, use: EvaluatorUse, judge: str, inputs: Mapping[str, object], scope: JudgeScope
) -> Iterator[Diagnostic]:
    if all(document is None for document in scope.documents):
        return
    sources = scope_fields(scope)
    for name, slot in inputs.items():
        yield from _judge_input(context, use, judge, (name, slot), scope, sources.get(name))


def scope_fields(scope: JudgeScope) -> Mapping[str, object]:
    return {name: field for document in scope.documents for name, field in (record_fields(document) or {}).items()}


def _judge_input(
    context: CheckContext,
    use: EvaluatorUse,
    judge: str,
    wanted: tuple[str, object],
    scope: JudgeScope,
    source: object | None,
) -> Iterator[Diagnostic]:
    name, slot = wanted
    if name in scope.bound:
        return
    if source is None and not is_optional(slot):
        yield HOST_REPORTS[use.host].unbound(use, judge, name, scope)
    if source is not None and compatible(context, slot, source) is False:
        message = f"judge {judge}: input {name} is not type compatible with field {name} of {scope.label}"
        yield diagnostic(DiagnosticCode.E_CHECK_PARAMS, use.file, (*use.path, "inference"), message)


def _expect(site: PolicySite, text: str, shape: Shape, label: str) -> Iterator[str]:
    resolution = site.resolve(text)
    if isinstance(resolution, Unresolved) or resolution.annotation is None or shape(resolution.annotation):
        return
    yield f"path {text} must point to {label}"


def _is_text(annotation: object) -> bool:
    return unwrap(annotation).core is str


def _is_text_or_list(annotation: object) -> bool:
    return _is_text(annotation) or is_list(annotation)


def _is_locale(annotation: object) -> bool:
    return unwrap(annotation).core is Locale


def _is_number(annotation: object) -> bool:
    core = unwrap(annotation).core
    return core is int or core is float


def _records_with(*names: str) -> Shape:
    def shape(annotation: object) -> bool:
        fields = record_fields(step_element(annotation))
        return fields is not None and all(name in fields for name in names)

    return shape


def _not_empty(context: CheckContext, site: PolicySite, params: BaseModel) -> Iterator[str]:
    if isinstance(params, FieldParams):
        yield from _expect(site, params.field, _is_text_or_list, "Text or a list")


def _max_words(context: CheckContext, site: PolicySite, params: BaseModel) -> Iterator[str]:
    if isinstance(params, MaxWordsParams):
        yield from _expect(site, params.field, _is_text, "Text")


def _language(context: CheckContext, site: PolicySite, params: BaseModel) -> Iterator[str]:
    if isinstance(params, LanguageParams):
        yield from _expect(site, params.field, _is_text, "Text")
        yield from _expect(site, params.locale, _is_locale, "Locale")


def _no_pii(context: CheckContext, site: PolicySite, params: BaseModel) -> Iterator[str]:
    fields = params.fields if isinstance(params, NoPiiParams) else ()
    yield from (problem for field in fields for problem in _expect(site, field, _is_text, "Text"))


def _regex(context: CheckContext, site: PolicySite, params: BaseModel) -> Iterator[str]:
    if not isinstance(params, RegexParams):
        return
    yield from _expect(site, params.field, _is_text, "Text")
    try:
        re.compile(params.pattern)
    except re.error as error:
        yield f"pattern does not compile: {error}"


def _unique_items(context: CheckContext, site: PolicySite, params: BaseModel) -> Iterator[str]:
    if isinstance(params, UniqueItemsParams):
        yield from _expect(site, params.field, _records_with(params.key), f"a list of records with field {params.key}")


def _ids_in_allowed_set(context: CheckContext, site: PolicySite, params: BaseModel) -> Iterator[str]:
    if isinstance(params, IdsInAllowedSetParams):
        yield from _expect(site, params.allowed, is_list, "a list")


def _citations_in_sources(context: CheckContext, site: PolicySite, params: BaseModel) -> Iterator[str]:
    if not isinstance(params, CitationsInSourcesParams):
        return
    citations = f"a list of records with fields {params.id}, {params.quote}"
    yield from _expect(site, params.citations, _records_with(params.id, params.quote), citations)
    sources = f"a list of records with fields {params.id}, {params.text}"
    yield from _expect(site, params.sources, _records_with(params.id, params.text), sources)
    cited = _element_field(site, params.citations, params.id)
    known = _element_field(site, params.sources, params.id)
    if cited is None or known is None or context.refs.schema(cited) == context.refs.schema(known):
        return
    yield f"field {params.id} has different types in quotes and sources"


def _element_field(site: PolicySite, text: str, name: str) -> object | None:
    resolution = site.resolve(text)
    if not isinstance(resolution, Resolved) or resolution.annotation is None:
        return None
    found = step_field(step_element(resolution.annotation), name)
    return None if isinstance(found, Missing | Opaque | NotList) else found


def _expected_fields(context: CheckContext, site: PolicySite, params: BaseModel) -> Iterator[str]:
    fields = params.fields if isinstance(params, ExpectedParams) else None
    resolutions = (site.resolve(f"{OUT_PREFIX}{name}") for name in fields or ())
    yield from (resolution.message for resolution in resolutions if isinstance(resolution, Unresolved))


def _score_path(context: CheckContext, site: PolicySite, params: BaseModel) -> Iterator[str]:
    if isinstance(params, ThresholdParams | StagnationParams | BestParams):
        yield from _expect(site, params.path, _is_number, "a number")


def _quorum(context: CheckContext, site: PolicySite, params: BaseModel) -> Iterator[str]:
    spec = site.entry.spec if site.entry is not None else None
    branches = len(spec.body) if isinstance(spec, ParallelNodeSpec) else None
    if isinstance(params, QuorumParams) and branches is not None and params.min_ok > branches:
        yield f"min_ok {params.min_ok} is greater than the number of branches {branches}"


def _default(context: CheckContext, site: PolicySite, params: BaseModel) -> Iterator[str]:
    output = site.contract.returns.arguments[0] if site.contract.returns.arguments else None
    if not isinstance(params, DefaultParams) or output is None:
        return
    try:
        TypeAdapter[object](output).validate_python(params.value)
    except ValidationError as error:
        yield f"value does not pass the out of the map body: {error.errors()[0]['msg']}"


SHAPE_RULES: Final[Mapping[tuple[Slot, str], ShapeRule]] = {
    (Slot.JOIN, "quorum"): _quorum,
    (Slot.STOP, "threshold"): _score_path,
    (Slot.STOP, "stagnation"): _score_path,
    (Slot.SELECT, "best"): _score_path,
    (Slot.ITEM_ERROR, "default"): _default,
    (Slot.EVALUATOR, "not_empty"): _not_empty,
    (Slot.EVALUATOR, "max_words"): _max_words,
    (Slot.EVALUATOR, "language"): _language,
    (Slot.EVALUATOR, "no_pii"): _no_pii,
    (Slot.EVALUATOR, "regex"): _regex,
    (Slot.EVALUATOR, "unique_items"): _unique_items,
    (Slot.EVALUATOR, "ids_in_allowed_set"): _ids_in_allowed_set,
    (Slot.EVALUATOR, "citations_in_sources"): _citations_in_sources,
    (Slot.EVALUATOR, "expected"): _expected_fields,
}
