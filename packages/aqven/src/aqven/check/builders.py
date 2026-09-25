from collections.abc import Mapping
from dataclasses import dataclass, replace
from typing import Final

from aqven.check.resolver import CodeFailure, CodeResolver
from aqven.diagnostics import Diagnostic, DiagnosticCode, diagnostic
from aqven.loader import LoadedExperiment, LoadedFlow, LoadedInference, LoadedProject, SourceSpec, file_hash
from aqven.spec import ExperimentId, Flow, FlowId, InferenceId, InferenceSpec, NodeId, NodeSpec

BUILD_FUNCTION: Final = "build"


@dataclass(frozen=True, slots=True)
class Materialized:
    project: LoadedProject
    diagnostics: tuple[Diagnostic, ...]


def materialize_builders(project: LoadedProject, code: CodeResolver) -> Materialized:
    flow_outcomes = {flow_id: _flow(project, flow, code) for flow_id, flow in project.flows.items() if _unbuilt(flow)}
    local_outcomes = {
        (experiment_id, flow_id): _flow(project, flow, code)
        for experiment_id, experiment in project.experiments.items()
        for flow_id, flow in experiment.flows.items()
        if _unbuilt(flow)
    }
    inference_outcomes = {
        inference_id: _inference(project, inference, code)
        for inference_id, inference in project.inferences.items()
        if inference.builder_path is not None and inference.source is None
    }
    flows: Mapping[FlowId, LoadedFlow] = {
        **project.flows,
        **{flow_id: flow for flow_id, (flow, _) in flow_outcomes.items()},
    }
    inferences: Mapping[InferenceId, LoadedInference] = {
        **project.inferences,
        **{inference_id: inference for inference_id, (inference, _) in inference_outcomes.items()},
    }
    experiments = {
        experiment_id: _with_local_flows(experiment_id, experiment, local_outcomes)
        for experiment_id, experiment in project.experiments.items()
    }
    diagnostics = (
        *(item for _, problems in flow_outcomes.values() for item in problems),
        *(item for _, problems in local_outcomes.values() for item in problems),
        *(item for _, problems in inference_outcomes.values() for item in problems),
    )
    materialized = replace(project, flows=flows, inferences=inferences, experiments=experiments)
    return Materialized(materialized, diagnostics)


def _unbuilt(flow: LoadedFlow) -> bool:
    return flow.builder_path is not None and flow.source is None


def _with_local_flows(
    experiment_id: ExperimentId,
    experiment: LoadedExperiment,
    outcomes: Mapping[tuple[ExperimentId, FlowId], tuple[LoadedFlow, tuple[Diagnostic, ...]]],
) -> LoadedExperiment:
    built = {flow_id: flow for (owner, flow_id), (flow, _) in outcomes.items() if owner == experiment_id}
    return replace(experiment, flows={**experiment.flows, **built}) if built else experiment


def _flow(project: LoadedProject, flow: LoadedFlow, code: CodeResolver) -> tuple[LoadedFlow, tuple[Diagnostic, ...]]:
    path = flow.builder_path or ""
    built = _build(code, path, Flow)
    if isinstance(built, CodeFailure):
        return flow, (diagnostic(DiagnosticCode.E_BUILDER_FAILED, path, (), built.message),)
    digest = file_hash((project.root / path).read_bytes())
    nodes: dict[NodeId, SourceSpec[NodeSpec]] = {
        **flow.nodes,
        **{node_id: SourceSpec(path, digest, spec, {}) for node_id, spec in built.nodes.items()},
    }
    source = SourceSpec(path=path, file_hash=digest, spec=built.spec, positions={})
    return replace(flow, source=source, nodes=nodes), ()


def _inference(
    project: LoadedProject, inference: LoadedInference, code: CodeResolver
) -> tuple[LoadedInference, tuple[Diagnostic, ...]]:
    path = inference.builder_path or ""
    built = _build(code, path, InferenceSpec)
    if isinstance(built, CodeFailure):
        return inference, (diagnostic(DiagnosticCode.E_BUILDER_FAILED, path, (), built.message),)
    digest = file_hash((project.root / path).read_bytes())
    return replace(inference, source=SourceSpec(path=path, file_hash=digest, spec=built, positions={})), ()


def _build[T](code: CodeResolver, path: str, expected: type[T]) -> T | CodeFailure:
    module = code.load_builder(path)
    if isinstance(module, CodeFailure):
        return module
    build: object = getattr(module, BUILD_FUNCTION, None)
    if not callable(build):
        return CodeFailure(path, f"builder has no function {BUILD_FUNCTION}() -> {expected.__name__}")
    try:
        result: object = build()
    except Exception as error:
        return CodeFailure(path, f"{BUILD_FUNCTION}() raised {type(error).__name__}: {error}")
    if not isinstance(result, expected):
        return CodeFailure(path, f"{BUILD_FUNCTION}() returned {type(result).__name__} instead of {expected.__name__}")
    return result
