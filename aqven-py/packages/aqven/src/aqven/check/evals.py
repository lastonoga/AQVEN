from collections.abc import Iterable, Iterator
from typing import Final

from pydantic import TypeAdapter, ValidationError

from aqven.check.context import CheckContext
from aqven.check.registry import known_agent, known_inference
from aqven.diagnostics import Diagnostic, DiagnosticCode, diagnostic
from aqven.loader import SourceSpec, YamlPath
from aqven.spec import DatasetFile, EvalSpec, GateAction, GateSpec, OptimizationSpec

RELEASE_FORBIDDEN: Final = ("block", "gate_unavailable")


def check_evals(context: CheckContext) -> Iterable[Diagnostic]:
    return tuple(item for source in context.project.evals.values() for item in _eval(context, source))


def _eval(context: CheckContext, source: SourceSpec[EvalSpec]) -> Iterator[Diagnostic]:
    spec = source.spec
    file = source.path
    if not known_inference(context, spec.inference):
        message = f"inference {spec.inference} does not exist in the project"
        yield diagnostic(DiagnosticCode.E_INFERENCE_UNKNOWN, file, ("inference",), message)
    if not known_agent(context, spec.agent):
        yield diagnostic(
            DiagnosticCode.E_AGENT_UNKNOWN, file, ("agent",), f"agent {spec.agent} does not exist in the project"
        )
    dataset = context.project.datasets.get(spec.dataset)
    if dataset is None:
        message = f"dataset {spec.dataset} does not exist in the project"
        yield diagnostic(DiagnosticCode.E_DATASET_UNKNOWN, file, ("dataset",), message)
    if dataset is not None:
        yield from _dataset(context, spec, dataset)
    if spec.gate is not None:
        yield from _gate(file, spec, spec.gate)
        yield from _calibration(context, file, spec.gate)
    if spec.optimization is not None:
        yield from _optimization(context, file, spec, spec.optimization)


def _gate(file: str, spec: EvalSpec, gate: GateSpec) -> Iterator[Diagnostic]:
    actions = gate.actions
    released = [name for name in RELEASE_FORBIDDEN if getattr(actions, name) is GateAction.RELEASE]
    for name in released:
        message = f"outcome {name} never releases: release is forbidden (GATE_UNAVAILABLE does not degrade to PASS)"
        yield diagnostic(DiagnosticCode.E_GATE_POLICY, file, ("gate", "actions", name), message)
    scorers = {scorer.id for scorer in spec.scorers}
    families = gate.families
    groups = (("primary", families.primary), ("secondary", families.secondary or ()), ("safety", families.safety or ()))
    for group, ids in groups:
        unknown = [scorer for scorer in ids if scorer not in scorers]
        if unknown:
            message = f"family {group} names unknown evaluators: {', '.join(unknown)}"
            yield diagnostic(DiagnosticCode.E_GATE_POLICY, file, ("gate", "families", group), message)


def _calibration(context: CheckContext, file: str, gate: GateSpec) -> Iterator[Diagnostic]:
    admission = gate.judge_admission
    if admission is None or admission.calibration_dataset in context.project.datasets:
        return
    message = f"judge calibration dataset {admission.calibration_dataset} does not exist in the project"
    path: YamlPath = ("gate", "judge_admission", "calibration_dataset")
    yield diagnostic(DiagnosticCode.E_DATASET_UNKNOWN, file, path, message)


def _optimization(
    context: CheckContext, file: str, spec: EvalSpec, optimization: OptimizationSpec
) -> Iterator[Diagnostic]:
    path: YamlPath = ("optimization",)
    if not known_agent(context, optimization.reflection_agent):
        message = f"reflection agent {optimization.reflection_agent} does not exist in the project"
        yield diagnostic(DiagnosticCode.E_AGENT_UNKNOWN, file, (*path, "reflection_agent"), message)
    if optimization.objective not in {scorer.id for scorer in spec.scorers}:
        message = f"objective {optimization.objective} is not among the scorers evaluators"
        yield diagnostic(DiagnosticCode.E_OPTIMIZATION_TARGET, file, (*path, "objective"), message)
    inference = context.inference(spec.inference)
    if inference is None or inference.prompt_code is None:
        return
    message = f"only a level 1 or 2 prompt can be optimized, but inference {spec.inference} has a code prompt (level 3)"
    yield diagnostic(DiagnosticCode.E_OPTIMIZATION_TARGET, file, path, message)


def _dataset(context: CheckContext, spec: EvalSpec, source: SourceSpec[DatasetFile]) -> Iterator[Diagnostic]:
    refs = context.refs
    inputs = refs.inference_record(spec.inference, "in")
    outputs = refs.inference_record(spec.inference, "out")
    for index, case in enumerate(source.spec.cases):
        yield from _case_value(source.path, ("cases", index, "inputs"), inputs, case.inputs, case.name)
        if case.expected_output is None:
            continue
        path = ("cases", index, "expected_output")
        yield from _case_value(source.path, path, outputs, case.expected_output, case.name)


def _case_value(file: str, path: YamlPath, record: object | None, value: object, name: str) -> Iterator[Diagnostic]:
    if record is None:
        return
    try:
        TypeAdapter[object](record).validate_python(value)
    except ValidationError as error:
        first = error.errors()[0]
        location = ".".join(str(part) for part in first["loc"])
        message = f"case {name}: value does not pass the inference model: {location}: {first['msg']}"
        yield diagnostic(DiagnosticCode.E_SPEC_INVALID, file, path, message)
