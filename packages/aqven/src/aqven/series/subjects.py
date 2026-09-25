from collections.abc import Mapping, Sequence
from dataclasses import dataclass, replace
from typing import Final, Protocol

from pydantic import JsonValue, TypeAdapter, ValidationError

from aqven.engine.errors import CodeLoadError
from aqven.engine.facade import missing_context_keys
from aqven.engine.request import RunRecord, RunSpec, SeriesTag
from aqven.engine.selection import SelectionError, range_missing, range_order
from aqven.ir import CompiledFlow, CompiledProject, IrLookupError
from aqven.runtime.address import JsonObject
from aqven.runtime.options import RunContext
from aqven.series.model import CaseSnapshot, SubjectKind, SubjectRecord, VariantPlanRecord
from aqven.spec import DatasetId, ExperimentSubject, FlowId, Limits, NodeId

EXPERIMENT_MODE: Final = "experiment"
DATASET_ITEM_SEPARATOR: Final = "/"


class TypeSource(Protocol):
    def type_annotation(self, package: str, type_ref: str) -> object: ...


class SubjectUnbound(RuntimeError):
    def __init__(self, kind: SubjectKind) -> None:
        super().__init__(f"the {kind.value} subject strategy is used before it is bound to a series")
        self.kind = kind


class CaseInputInvalid(ValueError):
    def __init__(self, case_name: str, problems: Sequence[str]) -> None:
        super().__init__(f"case {case_name}: {'; '.join(problems)}")
        self.case_name = case_name
        self.problems = tuple(problems)


@dataclass(frozen=True, slots=True)
class SubjectBinding:
    subject: SubjectRecord
    types: TypeSource
    package: str


@dataclass(frozen=True, slots=True)
class PreparedRun:
    flow_input: JsonObject
    spec: RunSpec


class SubjectStrategy(Protocol):
    @property
    def kind(self) -> SubjectKind: ...

    def bind(self, binding: SubjectBinding) -> SubjectStrategy: ...

    def problems(self, plan: CompiledProject, flow_id: FlowId, case: CaseSnapshot) -> tuple[str, ...]: ...

    def prepare(
        self,
        variant: VariantPlanRecord,
        case: CaseSnapshot,
        dataset_id: DatasetId,
        tag: SeriesTag,
        limit_usd_micros: int,
    ) -> PreparedRun: ...

    def subject_output(self, record: RunRecord) -> JsonValue: ...

    def scope(
        self, flow: CompiledFlow, case: CaseSnapshot, record: RunRecord, top_outputs: Mapping[NodeId, JsonValue]
    ) -> tuple[JsonObject, ...]: ...


def dataset_item_id(dataset_id: DatasetId, case_name: str) -> str:
    return f"{dataset_id}{DATASET_ITEM_SEPARATOR}{case_name}"


def run_context(case: CaseSnapshot) -> RunContext | None:
    return None if case.context is None else RunContext.model_validate(case.context)


def context_problems(case: CaseSnapshot) -> tuple[str, ...]:
    try:
        run_context(case)
    except ValidationError as error:
        return tuple(f"context: {item['msg']}" for item in error.errors())
    return ()


def subject_limits(limit_usd_micros: int) -> Limits:
    return Limits(usd_micros=max(0, limit_usd_micros))


def objects(documents: Sequence[JsonValue]) -> tuple[JsonObject, ...]:
    return tuple(document for document in documents if isinstance(document, dict))


def ordered_outputs(order: Sequence[NodeId], outputs: Mapping[NodeId, JsonValue]) -> tuple[JsonValue, ...]:
    return tuple(outputs[node_id] for node_id in order if node_id in outputs)


def validation_messages(error: ValidationError) -> tuple[str, ...]:
    return tuple(f"{'.'.join(str(part) for part in item['loc']) or 'inputs'}: {item['msg']}" for item in error.errors())


def input_adapter(binding: SubjectBinding, type_ref: str) -> TypeAdapter[object]:
    return TypeAdapter[object](binding.types.type_annotation(binding.package, type_ref))


def validated_input(binding: SubjectBinding, type_ref: str, case: CaseSnapshot) -> JsonObject:
    adapter = input_adapter(binding, type_ref)
    try:
        validated = adapter.validate_python(case.inputs)
    except ValidationError as error:
        raise CaseInputInvalid(case.name, validation_messages(error)) from error
    dumped: JsonValue = adapter.dump_python(validated, mode="json", by_alias=True)
    if not isinstance(dumped, dict):
        raise CaseInputInvalid(case.name, ("the flow input is not a record",))
    return dumped


def whole_input_problems(binding: SubjectBinding, flow: CompiledFlow, case: CaseSnapshot) -> tuple[str, ...]:
    try:
        validated_input(binding, flow.input_type, case)
    except CaseInputInvalid as error:
        return error.problems
    except CodeLoadError as error:
        return (str(error),)
    return ()


def missing_context(flow: CompiledFlow, case: CaseSnapshot) -> tuple[str, ...]:
    try:
        spec = RunSpec(flow_id=flow.flow_id, context=run_context(case))
    except ValidationError:
        return ()
    return tuple(
        f"flow {flow.flow_id} reads $run.context.{key.value} and the case has no such context"
        for key in missing_context_keys(flow, spec)
    )


def compiled_flow(plan: CompiledProject, flow_id: FlowId) -> CompiledFlow | None:
    try:
        return plan.flow(flow_id)
    except IrLookupError:
        return None


@dataclass(frozen=True, slots=True)
class FlowSubject:
    kind: SubjectKind = SubjectKind.FLOW
    binding: SubjectBinding | None = None

    def bind(self, binding: SubjectBinding) -> SubjectStrategy:
        return replace(self, binding=binding)

    def problems(self, plan: CompiledProject, flow_id: FlowId, case: CaseSnapshot) -> tuple[str, ...]:
        flow = compiled_flow(plan, flow_id)
        if flow is None:
            return (f"flow {flow_id} is not in the compiled plan",)
        return (
            *context_problems(case),
            *missing_context(flow, case),
            *whole_input_problems(self._bound(), flow, case),
        )

    def prepare(
        self,
        variant: VariantPlanRecord,
        case: CaseSnapshot,
        dataset_id: DatasetId,
        tag: SeriesTag,
        limit_usd_micros: int,
    ) -> PreparedRun:
        flow_input = validated_input(self._bound(), variant.input_type, case)
        spec = RunSpec(
            flow_id=variant.flow_id,
            mode=EXPERIMENT_MODE,
            dataset_item_id=dataset_item_id(dataset_id, case.name),
            context=run_context(case),
            limits=subject_limits(limit_usd_micros),
            cassettes=None,
            output_deltas=False,
            series=tag,
        )
        return PreparedRun(flow_input=flow_input, spec=spec)

    def subject_output(self, record: RunRecord) -> JsonValue:
        return record.output

    def scope(
        self, flow: CompiledFlow, case: CaseSnapshot, record: RunRecord, top_outputs: Mapping[NodeId, JsonValue]
    ) -> tuple[JsonObject, ...]:
        produced = ordered_outputs(flow.order, top_outputs)
        return objects((case.inputs, *produced[:-1], self.subject_output(record)))

    def _bound(self) -> SubjectBinding:
        if self.binding is None:
            raise SubjectUnbound(self.kind)
        return self.binding


@dataclass(frozen=True, slots=True)
class RangeSubject:
    kind: SubjectKind = SubjectKind.RANGE
    binding: SubjectBinding | None = None

    def bind(self, binding: SubjectBinding) -> SubjectStrategy:
        return replace(self, binding=binding)

    def problems(self, plan: CompiledProject, flow_id: FlowId, case: CaseSnapshot) -> tuple[str, ...]:
        flow = compiled_flow(plan, flow_id)
        if flow is None:
            return (f"flow {flow_id} is not in the compiled plan",)
        start, end = self._ends()
        try:
            range_order(flow, start, end)
        except SelectionError as error:
            return (str(error),)
        if not isinstance(case.inputs, dict):
            return ("a node range needs an input record",)
        context = case.context or {}
        missing = range_missing(flow, start, end, case.inputs, context, case.node_outputs)
        return (*context_problems(case), *(f"{item.reference}: {item.reason}" for item in missing))

    def prepare(
        self,
        variant: VariantPlanRecord,
        case: CaseSnapshot,
        dataset_id: DatasetId,
        tag: SeriesTag,
        limit_usd_micros: int,
    ) -> PreparedRun:
        start, end = self._ends()
        if not isinstance(case.inputs, dict):
            raise CaseInputInvalid(case.name, ("a node range needs an input record",))
        spec = RunSpec(
            flow_id=variant.flow_id,
            mode=EXPERIMENT_MODE,
            dataset_item_id=dataset_item_id(dataset_id, case.name),
            context=run_context(case),
            start_node=start,
            end_node=end,
            node_outputs=dict(case.node_outputs),
            limits=subject_limits(limit_usd_micros),
            cassettes=None,
            output_deltas=False,
            series=tag,
        )
        return PreparedRun(flow_input=case.inputs, spec=spec)

    def subject_output(self, record: RunRecord) -> JsonValue:
        _, end = self._ends()
        output = record.output
        return output.get(end) if isinstance(output, dict) else None

    def scope(
        self, flow: CompiledFlow, case: CaseSnapshot, record: RunRecord, top_outputs: Mapping[NodeId, JsonValue]
    ) -> tuple[JsonObject, ...]:
        start, end = self._ends()
        first = flow.order.index(start) if start in flow.order else 0
        last = flow.order.index(end) if end in flow.order else len(flow.order) - 1
        before = ordered_outputs(flow.order[:first], case.node_outputs)
        inside = ordered_outputs(flow.order[first:last], top_outputs)
        return objects((case.inputs, *before, *inside, self.subject_output(record)))

    def _ends(self) -> tuple[NodeId, NodeId]:
        if self.binding is None:
            raise SubjectUnbound(self.kind)
        subject = self.binding.subject
        if subject.start_node is None or subject.end_node is None:
            raise SubjectUnbound(self.kind)
        return subject.start_node, subject.end_node


SUBJECTS: Final[Mapping[bool, SubjectStrategy]] = {
    False: FlowSubject(),
    True: RangeSubject(),
}


def subject_key(subject: SubjectRecord) -> bool:
    return subject.start_node is not None


def subject_kind(experiment: ExperimentSubject) -> SubjectKind:
    return SUBJECTS[experiment.from_ is not None].kind


def subject_strategy(binding: SubjectBinding) -> SubjectStrategy:
    return SUBJECTS[subject_key(binding.subject)].bind(binding)
