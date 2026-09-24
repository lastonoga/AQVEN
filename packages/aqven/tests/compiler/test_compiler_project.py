import pkgutil
from collections.abc import Iterator
from dataclasses import replace
from pathlib import Path
from typing import Final

import pytest
from pydantic import JsonValue

from aqven.check import CodeResolver, check_project
from aqven.compiler import CompileError, absolute_code_ref, compile_project, compile_root
from aqven.diagnostics import DiagnosticCode
from aqven.ir import (
    BuiltinPolicy,
    CodeEvaluator,
    CodePolicy,
    CodePrompt,
    CodeToolSource,
    CompiledCodeNode,
    CompiledLlmNode,
    CompiledLoopNode,
    CompiledNode,
    CompiledProject,
    CompiledSwitchCase,
    CompiledSwitchNode,
    CompiledToolNode,
    LiteralBinding,
    McpToolSource,
    RefBinding,
    TemplatePrompt,
    node_kind,
    project_hash,
)
from aqven.loader import LoadedFlow, load_project
from aqven.spec import (
    AgentId,
    CodeRef,
    FlowId,
    InferenceId,
    McpServerId,
    NodeId,
    NodeKind,
    ProviderName,
    ToolId,
    TypeId,
)
from aqven.testing import copy_project

FIXTURES: Final = Path(__file__).parents[1] / "fixtures"
STANDARD: Final = FIXTURES / "standard_shop"
LUMEN: Final = Path(__file__).parents[4] / "examples" / "lumen"
INTAKE: Final = FlowId("intake")
TITLE_KEY: Final = "title"


@pytest.fixture(scope="module")
def standard() -> CompiledProject:
    return compile_root(STANDARD)


def node(project: CompiledProject, node_id: str) -> CompiledNode:
    return project.flow(INTAKE).node(NodeId(node_id))


def schema_keys(value: JsonValue, parent: str = "") -> Iterator[tuple[str, str]]:
    if isinstance(value, dict):
        for key, child in value.items():
            yield parent, key
            yield from schema_keys(child, key)
    if isinstance(value, list):
        for item in value:
            yield from schema_keys(item, parent)


def code_refs(project: CompiledProject) -> set[CodeRef]:
    nodes = [item for flow in project.flows.values() for item in flow.nodes.values()]
    return {
        *(item.run for item in nodes if isinstance(item, CompiledCodeNode)),
        *(
            policy.run
            for item in nodes
            if isinstance(item, CompiledLoopNode)
            for policy in (*item.stop, item.select)
            if isinstance(policy, CodePolicy)
        ),
        *(tool.source.run for tool in project.tools.values() if isinstance(tool.source, CodeToolSource)),
        *(tool.wait.poll for tool in project.tools.values() if tool.wait is not None),
        *(
            check.evaluator.run
            for inference in project.inferences.values()
            for check in inference.checks
            if isinstance(check.evaluator, CodeEvaluator)
        ),
        *(
            inference.prompt.run
            for inference in project.inferences.values()
            if isinstance(inference.prompt, CodePrompt)
        ),
    }


def test_standard_shop_compiles_every_registry_and_flow(standard: CompiledProject) -> None:
    flow = standard.flow(INTAKE)

    assert standard.package == "standard_shop"
    assert set(standard.agents) == {AgentId("critic"), AgentId("writer")}
    assert set(standard.inferences) == {InferenceId("lookup"), InferenceId("redo"), InferenceId("reply")}
    assert set(standard.tools) == {ToolId("stamp")}
    assert set(standard.type_schemas) == {TypeId("Mood"), TypeId("Note"), TypeId("Score")}
    assert flow.order == (NodeId("clean"), NodeId("reply"), NodeId("review"))
    assert {node_id: node_kind(item) for node_id, item in flow.nodes.items()} == {
        NodeId("clean"): NodeKind.CODE,
        NodeId("reply"): NodeKind.LLM,
        NodeId("review"): NodeKind.SWITCH,
        NodeId("review__recheck"): NodeKind.LOOP,
        NodeId("review__recheck__redo"): NodeKind.LLM,
        NodeId("review__recheck__trim"): NodeKind.CODE,
    }


def test_code_refs_become_absolute_module_functions(standard: CompiledProject) -> None:
    reply = standard.inference(InferenceId("reply"))

    assert code_refs(standard) == {
        "standard_shop.flows.intake.nodes.clean.clean:clean",
        "standard_shop.flows.intake.nodes.review.trim:trim",
        "standard_shop.tools.functions:stamp",
        "standard_shop.flows.intake.nodes.reply.reply:reply_is_short",
    }
    assert [(check.name, check.on_fail.value) for check in reply.checks] == [("reply_is_short", "flag")]


def test_absolute_code_refs_resolve_through_pkgutil(standard: CompiledProject) -> None:
    with CodeResolver(STANDARD).session():
        resolved = {ref: pkgutil.resolve_name(ref) for ref in code_refs(standard)}

    assert all(callable(value) for value in resolved.values())


def test_code_ref_conversion_keeps_absolute_refs_and_rejects_non_modules() -> None:
    assert absolute_code_ref("shop", "@root/tools/functions.py:stamp") == "shop.tools.functions:stamp"
    assert absolute_code_ref("shop", "shop.code.text:squash") == "shop.code.text:squash"
    assert absolute_code_ref("shop", "@root/tools/my-tools.py:stamp") is None
    assert absolute_code_ref("shop", "@root/class/functions.py:stamp") is None
    assert absolute_code_ref("shop", "@root/tools/v1.2.py:stamp") is None


def test_prompt_template_carries_partials_and_variant_texts(standard: CompiledProject) -> None:
    reply = standard.inference(InferenceId("reply"))
    root = STANDARD

    assert isinstance(reply.prompt, TemplatePrompt)
    assert reply.prompt.level == 2
    assert reply.prompt.template == (root / "flows/intake/nodes/reply/reply.prompt.md").read_text(encoding="utf-8")
    assert reply.prompt.partials == {"fragments/tone": (root / "fragments/tone.md").read_text(encoding="utf-8")}
    tone = reply.variants["tone"]
    assert tone.on == "$in.mood"
    assert tone.default is None
    assert tone.cases == {
        "calm": (root / "flows/intake/nodes/reply/reply.variants/tone/calm.md").read_text(encoding="utf-8"),
        "warm": (root / "flows/intake/nodes/reply/reply.variants/tone/warm.md").read_text(encoding="utf-8"),
    }


def test_llm_node_binds_inputs_and_carries_inference_schemas(standard: CompiledProject) -> None:
    reply = node(standard, "reply")

    assert isinstance(reply, CompiledLlmNode)
    assert (reply.agent, reply.inference, reply.output_mode, reply.parent) == ("writer", "reply", "tool", None)
    assert reply.inputs == (
        RefBinding(name="text", ref="$clean.out.text"),
        LiteralBinding(name="mood", value="calm"),
    )
    assert reply.input_schema == standard.inference(InferenceId("reply")).input_schema
    assert reply.output_schema == standard.inference(InferenceId("reply")).output_schema
    assert reply.input_schema["required"] == ["text", "mood"]


def test_schemas_keep_constraints_and_descriptions_without_titles(standard: CompiledProject) -> None:
    clean = node(standard, "clean")
    schemas = [
        *(item.output_schema for flow in standard.flows.values() for item in flow.nodes.values()),
        *standard.type_schemas.values(),
    ]

    assert isinstance(clean, CompiledCodeNode)
    assert clean.input_schema == {
        "additionalProperties": False,
        "properties": {"text": {"description": "Текст заметки", "maxLength": 200, "type": "string"}},
        "required": ["text"],
        "type": "object",
    }
    assert all(key != TITLE_KEY or parent == "properties" for schema in schemas for parent, key in schema_keys(schema))


def test_switch_and_loop_bodies_use_expanded_node_ids(standard: CompiledProject) -> None:
    review = node(standard, "review")
    recheck = node(standard, "review__recheck")
    trim = node(standard, "review__recheck__trim")

    assert isinstance(review, CompiledSwitchNode)
    assert review.on == "$reply.out.mood"
    assert review.output_names == ("text",)
    assert review.cases == {
        "calm": CompiledSwitchCase(bindings=(RefBinding(name="text", ref="$reply.out.text"),)),
        "warm": CompiledSwitchCase(
            node=NodeId("review__recheck"), bindings=(RefBinding(name="text", ref="$recheck.out.text"),)
        ),
    }
    assert isinstance(recheck, CompiledLoopNode)
    assert recheck.parent == NodeId("review")
    assert recheck.body == (NodeId("review__recheck__redo"), NodeId("review__recheck__trim"))
    assert recheck.stop == (BuiltinPolicy(use="threshold", params={"path": "$iter.redo.out.score", "gte": 0.8}),)
    assert recheck.select == BuiltinPolicy(use="last")
    assert recheck.outputs == (RefBinding(name="text", ref="$iter.trim.out.text"),)
    assert isinstance(trim, CompiledCodeNode)
    assert trim.parent == NodeId("review__recheck")
    assert trim.inputs == (RefBinding(name="text", ref="$redo.out.text"),)


def test_agent_carries_instructions_models_tools_and_subagents(standard: CompiledProject) -> None:
    writer = standard.agent(AgentId("writer"))
    root = STANDARD

    assert writer.instructions == (root / "agents/writer/writer.instructions.md").read_text(encoding="utf-8")
    openai = ProviderName("openai")
    assert [(model.model, model.provider) for model in writer.models] == [("openai:gpt-5.4-mini", openai)]
    assert writer.tools == (ToolId("stamp"),)
    assert [(sub.name, sub.agent, sub.inference) for sub in writer.subagents] == [("lookup", "critic", "lookup")]
    assert standard.agent(AgentId("critic")).instructions is None


def test_flow_signature_and_returns(standard: CompiledProject) -> None:
    flow = standard.flow(INTAKE)

    assert (flow.input_type, flow.output_type) == ("Note", "Note")
    assert flow.input_schema == standard.type_schema(TypeId("Note"))
    assert flow.returns == (RefBinding(name="text", ref="$review.out.text"),)


def test_compiled_project_round_trips_through_json(standard: CompiledProject) -> None:
    restored = CompiledProject.model_validate_json(standard.model_dump_json())

    assert restored == standard
    assert project_hash(restored) == project_hash(standard)


def test_loaded_project_compiles_like_the_check_report(standard: CompiledProject) -> None:
    loaded = load_project(STANDARD).project

    assert loaded is not None
    assert compile_project(loaded) == standard


def test_failed_check_report_is_not_compiled(tmp_path: Path) -> None:
    root = copy_project(STANDARD, tmp_path)
    target = root / "flows/intake/nodes/reply/reply.node.yaml"
    target.write_text(target.read_text(encoding="utf-8").replace("$clean.out.text", "$clean.out.missing"), "utf-8")

    with pytest.raises(CompileError) as raised:
        compile_project(check_project(root))

    assert DiagnosticCode.E_REF_MISSING in {item.code for item in raised.value.diagnostics}


def test_unmaterialized_builder_flow_is_rejected() -> None:
    loaded = load_project(STANDARD).project
    assert loaded is not None
    intake = loaded.flows[INTAKE]
    builder = LoadedFlow(INTAKE, intake.folder, None, "flows/intake/flow.py", intake.nodes)

    with pytest.raises(CompileError) as raised:
        compile_project(replace(loaded, flows={INTAKE: builder}))

    assert [item.code for item in raised.value.diagnostics] == [DiagnosticCode.E_BUILDER_FAILED]


def test_mcp_tool_keeps_server_source_without_schemas() -> None:
    project = compile_root(FIXTURES / "layout_shop")
    tool = project.tool(ToolId("find_notes"))

    assert tool.source == McpToolSource(server=McpServerId("desk"), tool="search_notes")
    assert (tool.input_schema, tool.output_schema, tool.input_fields) == (None, None, ())
    assert project.mcp_server(McpServerId("desk")).url == "https://desk.example/mcp"


def test_aliased_prompt_and_instructions_resolve_to_file_texts() -> None:
    root = FIXTURES / "alias_shop"
    project = compile_root(root)
    reply = project.inference(InferenceId("reply"))

    assert isinstance(reply.prompt, TemplatePrompt)
    assert reply.prompt.template == (root / "flows/intake/prompts/reply.md").read_text(encoding="utf-8")
    assert project.agent(AgentId("writer")).instructions == (root / "prompts/writer.md").read_text(encoding="utf-8")


@pytest.mark.parametrize("fixture", ["standard_shop", "layout_shop", "alias_shop", "fixture_shop"])
def test_every_fixture_compiles_deterministically(fixture: str) -> None:
    first = compile_root(FIXTURES / fixture)
    second = compile_root(FIXTURES / fixture)

    assert first.model_dump_json() == second.model_dump_json()
    assert project_hash(first) == project_hash(second)


def test_lumen_example_compiles_read_only() -> None:
    report = check_project(LUMEN)
    if not report.ok:
        pytest.skip(f"the lumen example does not pass aqven check yet: {len(report.errors)} errors")

    project = compile_project(report)
    illustrate = project.inference(InferenceId("illustrate"))
    revise = project.inference(InferenceId("revise"))
    find_tickets = project.tool(ToolId("find_tickets"))
    drafts = project.flow(FlowId("support_case")).node(NodeId("drafts"))

    assert set(project.flows) == {FlowId("judge_panel"), FlowId("support_case")}
    assert illustrate.prompt == CodePrompt(
        run=CodeRef("lumen.flows.support_case.nodes.illustrate.illustrate:illustrate_prompt")
    )
    assert isinstance(revise.prompt, TemplatePrompt)
    assert set(revise.variants["lamp_guide"].cases) == {"mains", "rechargeable", "smart_wifi", "smart_zigbee"}
    assert revise.variants["lamp_guide"].on == "$in.product.lamp_kind"
    assert len({check.name for check in revise.checks}) == len(revise.checks)
    assert isinstance(find_tickets.source, McpToolSource)
    assert node_kind(drafts) is NodeKind.PARALLEL
    assert all(item.input_schema.get("properties") for item in tool_nodes(project))


def tool_nodes(project: CompiledProject) -> list[CompiledToolNode]:
    return [
        item for flow in project.flows.values() for item in flow.nodes.values() if isinstance(item, CompiledToolNode)
    ]
