from collections.abc import Mapping
from pathlib import Path
from typing import Final

from aqven.ir import (
    AgentModel,
    BuiltinPolicy,
    CodeToolSource,
    CompiledAgent,
    CompiledBinding,
    CompiledCallNode,
    CompiledCodeNode,
    CompiledFlow,
    CompiledInference,
    CompiledJobWait,
    CompiledLlmNode,
    CompiledMcpServer,
    CompiledNarrowNode,
    CompiledNode,
    CompiledParallelNode,
    CompiledProject,
    CompiledSwitchCase,
    CompiledSwitchNode,
    CompiledTool,
    CompiledToolNode,
    FieldIr,
    JsonSchema,
    McpToolSource,
    RefBinding,
)
from aqven.spec import (
    AgentId,
    CodeRef,
    Effect,
    FlowId,
    InferenceId,
    McpServerId,
    ModelString,
    NodeId,
    ProviderName,
    SecretBinding,
    SecretRef,
    ToolId,
    TypeId,
)

FIXTURE_ROOT: Final = Path(__file__).parent / "relay_shop"
PACKAGE: Final = "relay_shop"
STEPS: Final = "relay_shop.code.steps"
TEXT_FIELD: Final = (FieldIr(name="text", type="Text", description="Text"),)
OBJECT_SCHEMA: Final[JsonSchema] = {"type": "object"}


def ref(name: str, text: str) -> RefBinding:
    return RefBinding(name=name, ref=text)


def code_node(
    node_id: str, function: str, source: str, *, parent: str | None = None, run: str = STEPS
) -> CompiledCodeNode:
    return CompiledCodeNode(
        node_id=NodeId(node_id),
        parent=NodeId(parent) if parent is not None else None,
        description=f"Node {node_id}",
        run=CodeRef(f"{run}:{function}"),
        inputs=(ref("text", source),),
        input_schema=OBJECT_SCHEMA,
        input_fields=TEXT_FIELD,
        output_fields=TEXT_FIELD,
        output_schema=OBJECT_SCHEMA,
    )


def flow(flow_id: str, nodes: tuple[CompiledNode, ...], order: tuple[str, ...], returns: str) -> CompiledFlow:
    returns_binding: tuple[CompiledBinding, ...] = (ref("text", returns),)
    return CompiledFlow(
        flow_id=FlowId(flow_id),
        description=f"Flow {flow_id}",
        input_type="Ticket",
        output_type="Reply",
        input_schema=OBJECT_SCHEMA,
        output_schema=OBJECT_SCHEMA,
        returns=returns_binding,
        order=tuple(NodeId(node_id) for node_id in order),
        nodes={node.node_id: node for node in nodes},
    )


def relay_flow() -> CompiledFlow:
    route = CompiledSwitchNode(
        node_id=NodeId("route"),
        description="Loud reply for urgent requests",
        on="$input.priority",
        cases={
            "high": CompiledSwitchCase(node=NodeId("route__loud"), bindings=(ref("text", "$loud.out.text"),)),
            "low": CompiledSwitchCase(bindings=(ref("text", "$normalize.out.text"),)),
        },
        output_names=("text",),
        output_schema=OBJECT_SCHEMA,
    )
    stamp = CompiledToolNode(
        node_id=NodeId("stamp"),
        description="Stamp",
        tool=ToolId("stamp"),
        inputs=(ref("text", "$route.out.text"),),
        input_schema=OBJECT_SCHEMA,
        output_schema=OBJECT_SCHEMA,
    )
    nodes: tuple[CompiledNode, ...] = (
        code_node("normalize", "normalize", "$input.text"),
        route,
        code_node("route__loud", "shout", "$normalize.out.text", parent="route"),
        stamp,
        code_node("finish", "finalize", "$stamp.out.text"),
    )
    return flow("relay", nodes, ("normalize", "route", "stamp", "finish"), "$finish.out.text")


def gated_flow() -> CompiledFlow:
    nodes: tuple[CompiledNode, ...] = (
        code_node("first", "shout", "$input.text"),
        code_node("gate", "wait_gate", "$first.out.text"),
        code_node("last", "finalize", "$gate.out.text"),
    )
    return flow("gated", nodes, ("first", "gate", "last"), "$last.out.text")


def outer_flow() -> CompiledFlow:
    inner = CompiledCallNode(
        node_id=NodeId("inner"),
        description="Nested relay run",
        flow=FlowId("relay"),
        inputs=(ref("text", "$input.text"), ref("priority", "$input.priority")),
        input_schema=OBJECT_SCHEMA,
        output_schema=OBJECT_SCHEMA,
    )
    check = CompiledNarrowNode(
        node_id=NodeId("check"),
        description="Narrow the output to Reply",
        source="$inner.out",
        to=TypeId("Reply"),
        output_schema=OBJECT_SCHEMA,
    )
    nodes: tuple[CompiledNode, ...] = (inner, check)
    return flow("outer", nodes, ("inner", "check"), "$check.out.text")


def broken_flow() -> CompiledFlow:
    nodes: tuple[CompiledNode, ...] = (
        code_node("first", "normalize", "$input.text"),
        code_node("boom", "explode", "$first.out.text"),
        code_node("never", "finalize", "$boom.out.text"),
    )
    return flow("broken", nodes, ("first", "boom", "never"), "$never.out.text")


def thinking_flow() -> CompiledFlow:
    think = CompiledLlmNode(
        node_id=NodeId("think"),
        description="Model node without a connected executor",
        agent=AgentId("writer"),
        inference=InferenceId("answer"),
        output_mode="tool",
        inputs=(ref("text", "$input.text"),),
        input_schema=OBJECT_SCHEMA,
        output_schema=OBJECT_SCHEMA,
    )
    nodes: tuple[CompiledNode, ...] = (think,)
    return flow("thinking", nodes, ("think",), "$think.out.text")


def fan_flow() -> CompiledFlow:
    fan = CompiledParallelNode(
        node_id=NodeId("fan"),
        description="Two branches over one text",
        branches={"left": NodeId("fan__left"), "right": NodeId("fan__right")},
        join=BuiltinPolicy(use="all"),
        outputs=(ref("left", "$branch.left.text"), ref("right", "$branch.right.text")),
        output_schema=OBJECT_SCHEMA,
    )
    nodes: tuple[CompiledNode, ...] = (
        code_node("first", "normalize", "$input.text"),
        fan,
        code_node("fan__left", "shout", "$first.out.text", parent="fan"),
        code_node("fan__right", "finalize", "$first.out.text", parent="fan"),
        code_node("after", "finalize", "$fan.out.left"),
    )
    return flow("fan", nodes, ("first", "fan", "after"), "$after.out.text")


def gated_fan_flow() -> CompiledFlow:
    fan = CompiledParallelNode(
        node_id=NodeId("fan"),
        description="A gated branch and a fast branch",
        branches={"slow": NodeId("fan__slow"), "fast": NodeId("fan__fast")},
        join=BuiltinPolicy(use="all"),
        outputs=(ref("slow", "$branch.slow.text"), ref("fast", "$branch.fast.text")),
        output_schema=OBJECT_SCHEMA,
    )
    nodes: tuple[CompiledNode, ...] = (
        code_node("first", "normalize", "$input.text"),
        fan,
        code_node("fan__slow", "wait_gate", "$first.out.text", parent="fan"),
        code_node("fan__fast", "shout", "$first.out.text", parent="fan"),
        code_node("after", "finalize", "$fan.out.slow"),
    )
    return flow("gated_fan", nodes, ("first", "fan", "after"), "$after.out.text")


def tool_flow(flow_id: str, tool_id: str) -> CompiledFlow:
    node = CompiledToolNode(
        node_id=NodeId("use"),
        description=f"Tool {tool_id}",
        tool=ToolId(tool_id),
        inputs=(ref("text", "$input.text"),),
        input_schema=OBJECT_SCHEMA,
        output_schema=OBJECT_SCHEMA,
    )
    nodes: tuple[CompiledNode, ...] = (node,)
    return flow(flow_id, nodes, ("use",), "$use.out.text")


def lookup_tool() -> CompiledTool:
    return CompiledTool(
        tool_id=ToolId("lookup"),
        description="Search the notes service over MCP",
        source=McpToolSource(server=McpServerId("desk"), tool="find"),
        effect=Effect.READ,
    )


def render_tool() -> CompiledTool:
    return CompiledTool(
        tool_id=ToolId("render"),
        description="Long render",
        source=CodeToolSource(run=CodeRef("relay_shop.tools.functions:start_render")),
        effect=Effect.EXTERNAL,
        wait=CompiledJobWait(
            poll=CodeRef("relay_shop.tools.functions:poll_render"), interval_seconds=1, timeout_seconds=30
        ),
    )


def desk_server() -> CompiledMcpServer:
    return CompiledMcpServer(server_id=McpServerId("desk"), description="Notes service", url="https://desk.example/mcp")


def stamp_tool() -> CompiledTool:
    return CompiledTool(
        tool_id=ToolId("stamp"),
        description="Stamp a note in the external service",
        source=CodeToolSource(run=CodeRef("relay_shop.tools.functions:stamp")),
        effect=Effect.WRITE,
        secrets=(SecretBinding(name="token", ref=SecretRef("ref:env/RELAY_TOKEN")),),
    )


def writer_agent() -> CompiledAgent:
    model = AgentModel(model=ModelString("openrouter:openai/gpt-oss-20b"), provider=ProviderName("openrouter"))
    return CompiledAgent(agent_id=AgentId("writer"), description="Writer", models=(model,))


def answer_inference() -> CompiledInference:
    return CompiledInference(
        inference_id=InferenceId("answer"),
        description="Reply",
        output_fields=TEXT_FIELD,
        input_schema=OBJECT_SCHEMA,
        output_schema=OBJECT_SCHEMA,
    )


def relay_project() -> CompiledProject:
    flows: Mapping[FlowId, CompiledFlow] = {
        compiled.flow_id: compiled
        for compiled in (
            relay_flow(),
            gated_flow(),
            outer_flow(),
            broken_flow(),
            thinking_flow(),
            fan_flow(),
            gated_fan_flow(),
            tool_flow("lookup", "lookup"),
            tool_flow("render", "render"),
        )
    }
    return CompiledProject(
        package=PACKAGE,
        description="Project for engine core tests",
        agents={AgentId("writer"): writer_agent()},
        inferences={InferenceId("answer"): answer_inference()},
        tools={ToolId("stamp"): stamp_tool(), ToolId("lookup"): lookup_tool(), ToolId("render"): render_tool()},
        mcp_servers={McpServerId("desk"): desk_server()},
        flows=dict(flows),
    )
