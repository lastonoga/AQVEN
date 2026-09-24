import json
import math
from collections.abc import Callable, Iterator, Mapping, Sequence
from dataclasses import dataclass, field
from typing import Final, Protocol

from pydantic import JsonValue

from aqven.engine.values import RefSources, RefUnresolved, evaluate_ref
from aqven.ir import (
    CompiledAgent,
    CompiledBinding,
    CompiledCallNode,
    CompiledFlow,
    CompiledLlmNode,
    CompiledLoopNode,
    CompiledMapNode,
    CompiledNode,
    CompiledProject,
    CompiledPrompt,
    JsonSchema,
    LiteralBinding,
    TemplatePrompt,
)
from aqven.ports.execution import ScopeFrame
from aqven.preview import PreviewError, PromptPreview, PromptPreviewRequest, preview_prompt, sample_document
from aqven.preview.prompt import attachments
from aqven.runtime.address import JsonObject
from aqven.series.model import CaseSnapshot, CheckPlan, JudgePlan, SubjectRecord, VariantPlanRecord
from aqven.series.plans import JUDGE_NODE, scope_nodes, top_level
from aqven.series.scoring import judge_input
from aqven.spec import FlowId, NodeId, VariantId

CHARS_PER_TOKEN: Final = 4
DEFAULT_OUTPUT_TOKENS: Final = 4096
TYPICAL_OUTPUT_TOKENS: Final = 1000
MEDIA_PART_TOKENS: Final = 1600
JUDGE_PROMPT_TOKENS: Final = 2000
SINGLE_CALL: Final = 1
CASE_PAYLOAD: Final = frozenset({"inputs", "context", "node_outputs"})

type FanOut = Callable[[CompiledNode, CaseScope], int]


@dataclass(frozen=True, slots=True)
class TokenBound:
    model: str
    tokens_in: int
    tokens_out: int
    calls: int = SINGLE_CALL


@dataclass(frozen=True, slots=True)
class BoundPlan:
    base: CompiledProject
    projects: Mapping[VariantId, CompiledProject] = field(default_factory=dict[VariantId, CompiledProject])
    judges: CompiledProject | None = None
    checks: tuple[CheckPlan, ...] = ()
    case: CaseSnapshot | None = None
    subject: SubjectRecord | None = None


def record_of(value: JsonValue) -> JsonObject:
    return value if isinstance(value, dict) else {}


def case_chars(case: CaseSnapshot) -> int:
    return len(case.model_dump_json(include=set(CASE_PAYLOAD)))


def largest_case(cases: Sequence[CaseSnapshot]) -> CaseSnapshot | None:
    return max(cases, key=case_chars, default=None)


@dataclass(frozen=True, slots=True)
class CaseScope:
    flow_input: JsonObject
    run_context: JsonObject = field(default_factory=dict[str, JsonValue])
    node_outputs: Mapping[NodeId, JsonValue] = field(default_factory=dict[NodeId, JsonValue])
    chars: int = 0

    @classmethod
    def of(cls, case: CaseSnapshot) -> CaseScope:
        return cls(
            flow_input=record_of(case.inputs),
            run_context=dict(case.context or {}),
            node_outputs=dict(case.node_outputs),
            chars=case_chars(case),
        )

    @classmethod
    def judged(cls, judge: JudgePlan, case: CaseSnapshot | None) -> CaseScope:
        if case is None:
            return EMPTY_SCOPE
        return cls(flow_input=judge_input(judge, (record_of(case.inputs),), case), chars=case_chars(case))

    def value(self, ref: str) -> JsonValue:
        sources = RefSources(
            flow_input=self.flow_input,
            run_context=self.run_context,
            frame=ScopeFrame(),
            node_output=self.node_output,
        )
        try:
            return evaluate_ref(ref, sources)
        except RefUnresolved:
            return None

    def node_output(self, node_id: str) -> JsonValue:
        return self.node_outputs.get(NodeId(node_id))


EMPTY_SCOPE: Final = CaseScope(flow_input={})


def tokens(chars: int) -> int:
    return math.ceil(chars / CHARS_PER_TOKEN)


def schema_chars(schema: JsonSchema) -> int:
    return len(json.dumps(schema, ensure_ascii=False))


def binding_value(binding: CompiledBinding, scope: CaseScope) -> JsonValue:
    if isinstance(binding, LiteralBinding):
        return binding.value
    return scope.value(binding.ref)


@dataclass(frozen=True, slots=True)
class NodeDocument:
    values: JsonObject
    complete: bool


def node_document(project: CompiledProject, node: CompiledLlmNode, scope: CaseScope) -> NodeDocument:
    found = {binding.name: binding_value(binding, scope) for binding in node.inputs}
    resolved = {name: value for name, value in found.items() if value is not None}
    sampled = sample_document(project.inference(node.inference).input_schema)
    return NodeDocument(values={**sampled, **resolved}, complete=len(resolved) == len(found))


def preview_chars(preview: PromptPreview) -> int:
    texts = (preview.instructions or "", *(message.text for message in preview.messages))
    return sum(len(text) for text in texts) + schema_chars(preview.output.json_schema)


def template_chars(prompt: CompiledPrompt | None) -> int:
    if not isinstance(prompt, TemplatePrompt):
        return 0
    return len(prompt.template) + sum(len(text) for text in prompt.partials.values())


def renders_offline(project: CompiledProject, node: CompiledLlmNode) -> bool:
    prompt = project.inference(node.inference).prompt
    return prompt is None or isinstance(prompt, TemplatePrompt)


class PromptMeasure(Protocol):
    def chars(
        self, project: CompiledProject, flow_id: FlowId, node: CompiledLlmNode, scope: CaseScope
    ) -> int | None: ...


@dataclass(frozen=True, slots=True)
class RenderedPrompt:
    def chars(self, project: CompiledProject, flow_id: FlowId, node: CompiledLlmNode, scope: CaseScope) -> int | None:
        if not renders_offline(project, node):
            return None
        document = node_document(project, node, scope)
        request = PromptPreviewRequest(flow_id=flow_id, node_id=node.node_id, input=document.values)
        try:
            preview = preview_prompt(project, request)
        except PreviewError:
            return None
        return preview_chars(preview) + (0 if document.complete else scope.chars)


@dataclass(frozen=True, slots=True)
class TemplateSize:
    def chars(self, project: CompiledProject, flow_id: FlowId, node: CompiledLlmNode, scope: CaseScope) -> int | None:
        inference = project.inference(node.inference)
        instructions = project.agent(node.agent).instructions or ""
        prompt = template_chars(inference.prompt) + len(instructions) + schema_chars(inference.output_schema)
        return prompt + scope.chars


PROMPT_MEASURES: Final[tuple[PromptMeasure, ...]] = (RenderedPrompt(), TemplateSize())


def media_tokens(project: CompiledProject, node: CompiledLlmNode, scope: CaseScope) -> int:
    document = node_document(project, node, scope)
    return len(attachments(project.inference(node.inference), document.values)) * MEDIA_PART_TOKENS


def prompt_tokens(project: CompiledProject, flow_id: FlowId, node: CompiledLlmNode, scope: CaseScope) -> int:
    measured = (measure.chars(project, flow_id, node, scope) for measure in PROMPT_MEASURES)
    text = tokens(next((found for found in measured if found is not None), scope.chars))
    return text + media_tokens(project, node, scope)


def output_tokens(agent: CompiledAgent) -> int:
    settings = agent.settings
    limit = None if settings is None else settings.max_tokens
    return min(limit or DEFAULT_OUTPUT_TOKENS, TYPICAL_OUTPUT_TOKENS)


def loop_cap(node: CompiledNode, scope: CaseScope) -> int:
    return node.max_iter if isinstance(node, CompiledLoopNode) else SINGLE_CALL


def map_width(node: CompiledNode, scope: CaseScope) -> int:
    if not isinstance(node, CompiledMapNode):
        return SINGLE_CALL
    items = scope.value(node.over)
    return max(SINGLE_CALL, len(items)) if isinstance(items, list) else SINGLE_CALL


def no_fan_out(node: CompiledNode, scope: CaseScope) -> int:
    return SINGLE_CALL


FAN_OUTS: Final[Mapping[str, FanOut]] = {"loop": loop_cap, "map": map_width}


def ancestors(flow: CompiledFlow, node: CompiledNode) -> Iterator[CompiledNode]:
    parent = node.parent
    while parent is not None:
        current = flow.node(parent)
        yield current
        parent = current.parent


def calls_of(flow: CompiledFlow, node: CompiledNode, scope: CaseScope) -> int:
    return math.prod(FAN_OUTS.get(item.kind, no_fan_out)(item, scope) for item in ancestors(flow, node))


def llm_bound(
    project: CompiledProject, flow: CompiledFlow, node: CompiledLlmNode, scope: CaseScope, calls: int
) -> TokenBound:
    agent = project.agent(node.agent)
    return TokenBound(
        model=agent.primary.model,
        tokens_in=prompt_tokens(project, flow.flow_id, node, scope),
        tokens_out=output_tokens(agent),
        calls=calls * calls_of(flow, node, scope),
    )


def scoped_nodes(flow: CompiledFlow, subject: SubjectRecord | None) -> tuple[CompiledNode, ...]:
    if subject is None:
        return tuple(flow.nodes.values())
    scope = scope_nodes(flow, subject)
    return tuple(node for node in flow.nodes.values() if top_level(flow, node.node_id) in scope)


@dataclass(frozen=True, slots=True)
class FlowReach:
    flow: CompiledFlow
    nodes: tuple[CompiledNode, ...]
    scope: CaseScope
    calls: int = SINGLE_CALL
    seen: frozenset[FlowId] = frozenset()


def callee_input(call: CompiledCallNode, scope: CaseScope) -> JsonObject:
    found = {binding.name: binding_value(binding, scope) for binding in call.inputs}
    return {name: value for name, value in found.items() if value is not None}


def callee_bounds(project: CompiledProject, caller: FlowReach, call: CompiledCallNode) -> tuple[TokenBound, ...]:
    callee = project.flows.get(call.flow)
    if callee is None or call.flow in caller.seen:
        return ()
    reach = FlowReach(
        flow=callee,
        nodes=tuple(callee.nodes.values()),
        scope=CaseScope(flow_input=callee_input(call, caller.scope), chars=caller.scope.chars),
        calls=caller.calls * calls_of(caller.flow, call, caller.scope),
        seen=caller.seen | {call.flow},
    )
    return flow_bounds(project, reach)


def flow_bounds(project: CompiledProject, reach: FlowReach) -> tuple[TokenBound, ...]:
    llm = tuple(
        llm_bound(project, reach.flow, node, reach.scope, reach.calls)
        for node in reach.nodes
        if isinstance(node, CompiledLlmNode)
    )
    calls = (node for node in reach.nodes if isinstance(node, CompiledCallNode))
    return (*llm, *(bound for call in calls for bound in callee_bounds(project, reach, call)))


def judge_prompt_tokens(judges: CompiledProject | None, judge: JudgePlan, case: CaseSnapshot | None) -> int:
    flow = None if judges is None else judges.flows.get(judge.flow_id)
    node = None if flow is None else flow.nodes.get(JUDGE_NODE)
    if judges is None or flow is None or not isinstance(node, CompiledLlmNode):
        return JUDGE_PROMPT_TOKENS
    return prompt_tokens(judges, flow.flow_id, node, CaseScope.judged(judge, case))


def judge_bound(plan: BoundPlan, judge: JudgePlan, answer_tokens: int) -> TokenBound:
    agent = plan.base.agent(judge.agent)
    return TokenBound(
        model=agent.primary.model,
        tokens_in=judge_prompt_tokens(plan.judges, judge, plan.case) + answer_tokens,
        tokens_out=output_tokens(agent),
    )


def judge_bounds(plan: BoundPlan, answer_tokens: int) -> tuple[TokenBound, ...]:
    judges = (check.judge for check in plan.checks)
    return tuple(judge_bound(plan, judge, answer_tokens) for judge in judges if judge is not None)


def attempt_bound(plan: BoundPlan, variant: VariantPlanRecord) -> tuple[TokenBound, ...] | None:
    project = plan.projects.get(variant.variant_id, plan.base)
    flow = project.flows.get(variant.flow_id)
    if flow is None:
        return None
    scope = EMPTY_SCOPE if plan.case is None else CaseScope.of(plan.case)
    reach = FlowReach(flow=flow, nodes=scoped_nodes(flow, plan.subject), scope=scope, seen=frozenset({flow.flow_id}))
    subject = flow_bounds(project, reach)
    answer = max((bound.tokens_out for bound in subject), default=0)
    return (*subject, *judge_bounds(plan, answer))
