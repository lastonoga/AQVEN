from pathlib import Path
from typing import Final

import pytest

from aqven.check import check_project
from aqven.cli import main
from aqven.loader import EntityKey, EntityKind, LoadedProject, ProjectIndex, build_index, load_project
from aqven.spec import FlowId, InferenceId, LlmNodeSpec, NodeId
from aqven.views import render_refs, render_tree

FIXTURE: Final = Path(__file__).parent / "fixtures" / "layout_shop"
REPLY: Final = EntityKey(EntityKind.INFERENCE, "reply")

TREE: Final = """project (1)
  layout_shop  aqven.yaml
agent (2)
  critic  agents/critic.yaml
  writer  agents/writer.yaml
tool (2)
  find_notes  tools/find_notes.yaml
  stamp       tools/stamp.yaml
mcp_server (1)
  desk  mcp/desk.yaml
type (2)
  Mood  types/enums/mood.yaml
  Note  types/records/note.yaml
inference (1)
  reply  flows/intake/nodes/reply.inference.yaml
flow (2)
  audit   flows/audit/flow.yaml
  intake  flows/intake/flow.yaml
node (6)
  audit.accept   flows/audit/nodes/accept.node.yaml
  audit.recheck  flows/audit/nodes/recheck.node.yaml
  intake.again   flows/intake/nodes/again.node.yaml
  intake.clean   flows/intake/nodes/clean.node.yaml
  intake.reply   flows/intake/nodes/reply.node.yaml
  intake.stamp   flows/intake/nodes/stamp.node.yaml
dataset (1)
  notes  datasets/notes.yaml"""

REPLY_REFS: Final = """inference:reply
definition: flows/intake/nodes/reply.inference.yaml
referenced by (3):
  node:audit.recheck  flows/audit/nodes/recheck.node.yaml:5 inference
  node:intake.again   flows/intake/nodes/again.node.yaml:5 inference
  node:intake.reply   flows/intake/nodes/reply.node.yaml inference (by convention)
references (1):
  type:Mood  flows/intake/nodes/reply.inference.yaml:15 out[1].type"""


@pytest.fixture(scope="module")
def project() -> LoadedProject:
    loaded = load_project(FIXTURE)
    assert loaded.diagnostics == ()
    assert loaded.project is not None
    return loaded.project


@pytest.fixture(scope="module")
def index(project: LoadedProject) -> ProjectIndex:
    return build_index(project)


def test_suggested_layout_checks_clean_without_inference_or_level_type_folders() -> None:
    assert check_project(FIXTURE).diagnostics == ()


def test_inference_owned_by_a_node_is_reused_by_id_in_the_same_and_another_flow(project: LoadedProject) -> None:
    uses = {
        (flow_id, node_id): spec.inference
        for flow_id, flow in project.flows.items()
        for node_id, source in flow.nodes.items()
        if isinstance(spec := source.spec, LlmNodeSpec)
    }

    assert project.inferences[InferenceId("reply")].stem == "flows/intake/nodes/reply"
    assert uses == {
        (FlowId("intake"), NodeId("reply")): "reply",
        (FlowId("intake"), NodeId("again")): "reply",
        (FlowId("audit"), NodeId("recheck")): "reply",
    }


def test_tree_groups_every_entity_by_kind_with_its_file(index: ProjectIndex) -> None:
    assert render_tree(index) == TREE


def test_refs_show_definition_incoming_and_outgoing(index: ProjectIndex) -> None:
    assert render_refs(index, REPLY) == REPLY_REFS


def test_outgoing_references_cover_registry_code_and_data_flow(index: ProjectIndex) -> None:
    recheck = index.outgoing(EntityKey(EntityKind.NODE, "audit.recheck"))
    stamp = index.outgoing(EntityKey(EntityKind.TOOL, "stamp"))
    writer = index.outgoing(EntityKey(EntityKind.AGENT, "writer"))

    assert [(str(item.target), item.field) for item in recheck] == [
        ("inference:reply", ("inference",)),
        ("agent:critic", ("agent",)),
        ("node:audit.accept", ("in", 0, "from")),
    ]
    assert [str(item.target) for item in stamp] == ["code:layout_shop.tools.functions:stamp"]
    assert [str(item.target) for item in writer] == ["tool:find_notes"]
    assert index.incoming(EntityKey(EntityKind.FLOW, "intake"))[0].source == EntityKey(EntityKind.NODE, "audit.accept")


@pytest.mark.parametrize(
    ("name", "found"), [("reply", ["intake.reply"]), ("audit.accept", ["audit.accept"]), ("x", [])]
)
def test_node_is_found_by_its_id_without_the_flow(index: ProjectIndex, name: str, found: list[str]) -> None:
    assert [key.id for key in index.find(EntityKind.NODE, name)] == found


CLI_AGENTS: Final = """agent (2)
  critic  agents/critic.yaml  output.mode auto -> tool (profile)
  writer  agents/writer.yaml  output.mode auto -> tool (profile)"""
PLAIN_AGENTS: Final = """agent (2)
  critic  agents/critic.yaml
  writer  agents/writer.yaml"""


def test_cli_tree_and_refs(capsys: pytest.CaptureFixture[str]) -> None:
    assert main(["tree", str(FIXTURE)]) == 0
    assert capsys.readouterr().out == f"{TREE.replace(PLAIN_AGENTS, CLI_AGENTS)}\n"
    assert main(["refs", "inference:reply", str(FIXTURE)]) == 0
    assert capsys.readouterr().out == f"{REPLY_REFS}\n"


@pytest.mark.parametrize(
    ("argv", "code"), [(["refs", "bogus:x"], 2), (["refs", "agent"], 2), (["refs", "agent:nope"], 1)]
)
def test_cli_refs_rejects_unknown_targets(argv: list[str], code: int) -> None:
    assert main([*argv, str(FIXTURE)]) == code


def test_cli_views_outside_project(tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    assert main(["tree", str(tmp_path)]) == 1
    assert "E_PROJECT_NOT_FOUND" in capsys.readouterr().out
