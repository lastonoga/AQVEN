from pathlib import Path
from typing import Final

import pytest

from aqven.check import CheckReport, check_project
from aqven.codegen import GENERATED_TYPES, generate_types
from aqven.diagnostics import DiagnosticCode
from aqven.loader import LoadedProject, load_project
from aqven.spec import AgentId, FlowId, InferenceId, LlmNodeSpec, NodeId
from aqven.testing import copy_project

FIXTURE: Final = Path(__file__).parent / "fixtures" / "standard_shop"
WRITER: Final = "agents/writer/writer.yaml"
INSTRUCTIONS: Final = "agents/writer/writer.instructions.md"
REPLY_INFERENCE: Final = "flows/intake/nodes/reply/reply.inference.yaml"
REVIEW_FOLDER: Final = "flows/intake/nodes/review"
NOTE_RECORD: Final = "types/records/note.yaml"


@pytest.fixture(scope="module")
def project() -> LoadedProject:
    loaded = load_project(FIXTURE)
    assert loaded.diagnostics == ()
    assert loaded.project is not None
    return loaded.project


@pytest.fixture
def shop(tmp_path: Path) -> Path:
    return copy_project(FIXTURE, tmp_path)


def replace(root: Path, relative: str, old: str, new: str) -> None:
    target = root / relative
    source = target.read_text(encoding="utf-8")
    assert source.count(old) == 1, old
    target.write_text(source.replace(old, new), encoding="utf-8")


def located(report: CheckReport, code: DiagnosticCode) -> list[tuple[str, tuple[str | int, ...]]]:
    return [(item.file, item.path) for item in report.diagnostics if item.code is code]


def test_standard_layout_checks_clean() -> None:
    assert check_project(FIXTURE).diagnostics == ()


def test_agent_folder_holds_the_agent_its_instructions_and_subagent_inferences(project: LoadedProject) -> None:
    lookup = project.inferences[InferenceId("lookup")]

    assert {agent_id: source.path for agent_id, source in project.agents.items()} == {
        AgentId("critic"): "agents/critic.yaml",
        AgentId("writer"): WRITER,
    }
    assert project.agents[AgentId("writer")].spec.instructions == "./writer.instructions.md"
    assert INSTRUCTIONS in project.texts
    assert (lookup.folder, lookup.stem, set(lookup.texts)) == ("agents/writer", "agents/writer/lookup", {"prompt"})


def test_instructions_resolve_from_the_agent_file_not_from_the_agents_folder(shop: Path) -> None:
    (shop / INSTRUCTIONS).rename(shop / "agents/writer.instructions.md")

    report = check_project(shop)

    assert located(report, DiagnosticCode.E_PROMPT_MISSING) == [(WRITER, ("instructions",))]


def test_top_level_node_folder_holds_every_descendant_flat(project: LoadedProject) -> None:
    flow = project.flows[FlowId("intake")]
    inferences = {
        node_id: spec.inference
        for node_id, source in flow.nodes.items()
        if isinstance(spec := source.spec, LlmNodeSpec)
    }

    assert {node_id: source.path for node_id, source in flow.nodes.items()} == {
        NodeId("clean"): "flows/intake/nodes/clean/clean.node.yaml",
        NodeId("reply"): "flows/intake/nodes/reply/reply.node.yaml",
        NodeId("review"): f"{REVIEW_FOLDER}/review.node.yaml",
        NodeId("review__recheck"): f"{REVIEW_FOLDER}/recheck.node.yaml",
        NodeId("review__recheck__redo"): f"{REVIEW_FOLDER}/redo.node.yaml",
        NodeId("review__recheck__trim"): f"{REVIEW_FOLDER}/trim.node.yaml",
    }
    assert inferences == {NodeId("reply"): "reply", NodeId("review__recheck__redo"): "redo"}
    assert project.inferences[InferenceId("redo")].stem == f"{REVIEW_FOLDER}/redo"
    assert set(project.inferences[InferenceId("reply")].texts) == {"prompt", "variants/tone/calm", "variants/tone/warm"}


def test_generated_types_hold_inference_inputs_and_outputs() -> None:
    source = (FIXTURE / GENERATED_TYPES).read_text(encoding="utf-8")
    names = ("LookupIn", "LookupOut", "RedoIn", "RedoOut", "ReplyIn", "ReplyOut")

    assert source.index("type Score = ") < min(source.index(f"class {name}(BaseModel):") for name in names)
    assert [source.index(f"class {name}(BaseModel):") for name in names] == sorted(
        source.index(f"class {name}(BaseModel):") for name in names
    )
    assert "class ReplyOut(BaseModel):\n    model_config = GENERATED_CONFIG\n" in source
    assert "    similar: Annotated[list[Note], Field(max_length=3)]\n    score: Score\n" in source


def test_changed_inference_makes_generated_types_stale_until_generate(shop: Path) -> None:
    replace(
        shop,
        REPLY_INFERENCE,
        '  description: "Ответ"\n  maxLength: 200\n',
        '  description: "Ответ"\n  maxLength: 150\n',
    )

    stale = check_project(shop)

    assert located(stale, DiagnosticCode.W_GENERATED_STALE) == [(GENERATED_TYPES, ())]
    assert DiagnosticCode.E_CODE_SIGNATURE_MISMATCH in {item.code for item in stale.diagnostics}

    generate_types(shop)

    assert "max_length=150" in (shop / GENERATED_TYPES).read_text(encoding="utf-8")
    assert check_project(shop).diagnostics == ()


def test_inference_model_name_taken_by_a_type_is_reported(shop: Path) -> None:
    note = (shop / NOTE_RECORD).read_text(encoding="utf-8")
    (shop / "types/records/reply_in.yaml").write_text(note, encoding="utf-8")
    generate_types(shop)

    report = check_project(shop)
    generated = (shop / GENERATED_TYPES).read_text(encoding="utf-8")

    assert located(report, DiagnosticCode.E_ID_DUPLICATE) == [(REPLY_INFERENCE, ())]
    assert DiagnosticCode.W_GENERATED_STALE not in {item.code for item in report.diagnostics}
    assert generated.count("class ReplyIn(BaseModel):") == 1
    assert "class ReplyOut(BaseModel):" in generated
