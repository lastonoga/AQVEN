from collections import Counter
from collections.abc import Sequence
from typing import Final, assert_never

from pydantic import JsonValue

from aqven.compiler.codes import code_function
from aqven.compiler.context import CompileContext
from aqven.compiler.errors import compile_failure
from aqven.diagnostics import DiagnosticCode
from aqven.ir import (
    BuiltinEvaluator,
    BuiltinPolicy,
    CodeEvaluator,
    CodePolicy,
    CompiledBinding,
    CompiledCheck,
    CompiledEvaluator,
    CompiledPolicy,
    DynamicOutput,
    FieldIr,
    JudgeEvaluator,
    LiteralBinding,
    RefBinding,
)
from aqven.loader import YamlPath
from aqven.spec import (
    BoundField,
    CheckSpec,
    EvaluatorRef,
    FieldBinding,
    FieldHead,
    InputField,
    OutputField,
    PolicyRef,
)

RUN_KEY: Final = "run"
CHECKS_KEY: Final = "checks"
DUPLICATE_SEPARATOR: Final = "_"


def binding(field: FieldBinding | InputField) -> CompiledBinding:
    if field.from_ is None:
        return LiteralBinding(name=field.name, value=field.value)
    return RefBinding(name=field.name, ref=field.from_)


def bindings(fields: Sequence[FieldBinding | InputField]) -> tuple[CompiledBinding, ...]:
    return tuple(binding(field) for field in fields)


def outputs(fields: Sequence[BoundField]) -> tuple[RefBinding, ...]:
    return tuple(RefBinding(name=field.name, ref=field.from_) for field in fields)


def fields_ir(decls: Sequence[FieldHead]) -> tuple[FieldIr, ...]:
    return tuple(FieldIr(name=decl.name, type=decl.type, description=decl.description) for decl in decls)


def dynamic_outputs(fields: Sequence[OutputField]) -> tuple[DynamicOutput, ...]:
    return tuple(
        DynamicOutput(name=field.name, schema_from=field.schema_from, limits=field.limits)
        for field in fields
        if field.schema_from is not None and field.limits is not None
    )


def policy(context: CompileContext, ref: PolicyRef, file: str, path: YamlPath) -> CompiledPolicy:
    params = _params(ref.with_)
    if ref.use is not None:
        return BuiltinPolicy(use=ref.use, params=params)
    if ref.run is not None:
        return CodePolicy(run=context.code(ref.run, file, (*path, RUN_KEY)), params=params)
    raise compile_failure(DiagnosticCode.E_SPEC_INVALID, file, path, "policy has neither use nor run")


def evaluator(context: CompileContext, ref: EvaluatorRef, file: str, path: YamlPath) -> CompiledEvaluator:
    params = _params(ref.with_)
    if ref.use is not None:
        return BuiltinEvaluator(use=ref.use, params=params)
    if ref.run is not None:
        return CodeEvaluator(run=context.code(ref.run, file, (*path, RUN_KEY)), params=params)
    if ref.inference is not None and ref.agent is not None:
        return JudgeEvaluator(inference=ref.inference, agent=ref.agent)
    raise compile_failure(DiagnosticCode.E_SPEC_INVALID, file, path, "evaluator has no use, run or judge")


def checks(context: CompileContext, specs: Sequence[CheckSpec], file: str) -> tuple[CompiledCheck, ...]:
    evaluators = [evaluator(context, spec, file, (CHECKS_KEY, index)) for index, spec in enumerate(specs)]
    names = unique_names([evaluator_name(item) for item in evaluators])
    return tuple(
        CompiledCheck(name=name, evaluator=item, on_fail=spec.on_fail, threshold=spec.threshold)
        for name, item, spec in zip(names, evaluators, specs, strict=True)
    )


def evaluator_name(item: CompiledEvaluator) -> str:
    match item:
        case BuiltinEvaluator():
            return item.use
        case CodeEvaluator():
            return code_function(item.run)
        case JudgeEvaluator():
            return item.inference
        case _:
            assert_never(item)


def unique_names(bases: Sequence[str]) -> tuple[str, ...]:
    counts = Counter(bases)
    return tuple(
        base if counts[base] == 1 else f"{base}{DUPLICATE_SEPARATOR}{bases[: index + 1].count(base)}"
        for index, base in enumerate(bases)
    )


def _params(values: dict[str, JsonValue] | None) -> dict[str, JsonValue]:
    return dict(values or {})
