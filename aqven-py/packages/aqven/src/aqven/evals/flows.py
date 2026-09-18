from collections.abc import Iterable, Mapping
from dataclasses import dataclass
from typing import Final

from pydantic import JsonValue

from aqven.ir import CompiledFlow, CompiledLlmNode, CompiledProject, RefBinding
from aqven.runtime.address import JsonObject
from aqven.spec import AgentId, FlowId, InferenceId, NodeId

SUBJECT_NODE: Final = NodeId("subject")
OUTPUT_FIELD: Final = "output"
FLOW_INPUT_TYPE: Final = "EvalCaseIn"
FLOW_OUTPUT_TYPE: Final = "EvalCaseOut"
FLOW_PREFIX: Final = "aqven_eval"
UNIQUE_SUFFIX: Final = "_x"


@dataclass(frozen=True, slots=True)
class InferenceFlow:
    flow_id: FlowId
    inference: InferenceId
    agent: AgentId
    flow: CompiledFlow

    def unwrap(self, output: JsonValue) -> JsonObject:
        wrapper = output if isinstance(output, dict) else {}
        found = wrapper.get(OUTPUT_FIELD)
        return found if isinstance(found, dict) else {}


def unique_flow_id(plan: CompiledProject, label: str) -> FlowId:
    candidate = f"{FLOW_PREFIX}_{label}"
    while candidate in plan.flows:
        candidate = f"{candidate}{UNIQUE_SUFFIX}"
    return FlowId(candidate)


def inference_flow(plan: CompiledProject, label: str, inference_id: InferenceId, agent_id: AgentId) -> InferenceFlow:
    inference = plan.inference(inference_id)
    agent = plan.agent(agent_id)
    flow_id = unique_flow_id(plan, label)
    node = CompiledLlmNode(
        node_id=SUBJECT_NODE,
        description=f"eval subject: inference {inference_id} with agent {agent_id}",
        output_schema=inference.output_schema,
        inputs=tuple(RefBinding(name=field.name, ref=f"$input.{field.name}") for field in inference.input_fields),
        input_schema=inference.input_schema,
        agent=agent_id,
        inference=inference_id,
        output_mode=agent.output.mode,
    )
    flow = CompiledFlow(
        flow_id=flow_id,
        description=f"eval harness for inference {inference_id}",
        input_type=FLOW_INPUT_TYPE,
        output_type=FLOW_OUTPUT_TYPE,
        input_schema=inference.input_schema,
        output_schema=inference.output_schema,
        returns=(RefBinding(name=OUTPUT_FIELD, ref=f"${SUBJECT_NODE}.out"),),
        order=(SUBJECT_NODE,),
        nodes={SUBJECT_NODE: node},
    )
    return InferenceFlow(flow_id=flow_id, inference=inference_id, agent=agent_id, flow=flow)


def plan_with(plan: CompiledProject, flows: Iterable[InferenceFlow]) -> CompiledProject:
    added: Mapping[FlowId, CompiledFlow] = {item.flow_id: item.flow for item in flows}
    return plan.model_copy(update={"flows": {**plan.flows, **added}})


def case_input(plan: CompiledProject, inference_id: InferenceId, inputs: JsonValue) -> JsonObject:
    fields = plan.inference(inference_id).input_fields
    document = inputs if isinstance(inputs, dict) else {}
    return {field.name: document.get(field.name) for field in fields}
