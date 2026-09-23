from pathlib import Path
from typing import Final

import pytest
from test_check_experiments import PROJECT_FILES, write
from test_check_findings import FINDING_FILE, SERIES, finding, put_finding

from aqven.cli import main
from aqven.codegen import generate_types
from aqven.loader import EntityKey, EntityKind, ProjectIndex, build_index, load_project
from aqven.testing import copy_project
from aqven.views import render_tree

FIXTURE: Final = Path(__file__).parent / "fixtures" / "fixture_shop"
TRIAGE: Final = EntityKey(EntityKind.EXPERIMENT, "triage_agents")
JUDGE: Final = EntityKey(EntityKind.EXPERIMENT, "judge_check")
ARM: Final = EntityKey(EntityKind.ARM, "judge_check.judge")
ARM_NODE: Final = EntityKey(EntityKind.NODE, "judge_check.judge.judge")
FINDING: Final = EntityKey(EntityKind.FINDING, f"triage_agents.{SERIES}")

EXPERIMENT_GROUPS: Final = f"""experiment (2)
  judge_check    experiments/judge_check/experiment.yaml
  triage_agents  experiments/triage_agents/experiment.yaml
arm (1)
  judge_check.judge  experiments/judge_check/arms/judge/flow.yaml
finding (1)
  triage_agents.{SERIES}  {FINDING_FILE}"""


@pytest.fixture
def lab(tmp_path: Path) -> Path:
    root = copy_project(FIXTURE, tmp_path)
    for relative, text in PROJECT_FILES.items():
        write(root, relative, text)
    generate_types(root)
    put_finding(root, FINDING_FILE, finding())
    return root


@pytest.fixture
def index(lab: Path) -> ProjectIndex:
    result = load_project(lab)
    assert result.diagnostics == ()
    assert result.project is not None
    return build_index(result.project)


def targets(index: ProjectIndex, key: EntityKey) -> list[tuple[str, str]]:
    return sorted({(str(item.target), ".".join(str(part) for part in item.field)) for item in index.outgoing(key)})


def test_the_tree_lists_experiments_their_arms_and_findings(index: ProjectIndex) -> None:
    tree = render_tree(index)

    assert tree.endswith(EXPERIMENT_GROUPS)
    assert "  judge_check.judge.judge  experiments/judge_check/arms/judge/nodes/judge.node.yaml" in tree


def test_an_experiment_references_its_flow_dataset_agents_checks_and_arms(index: ProjectIndex) -> None:
    assert targets(index, TRIAGE) == [
        ("agent:cheap", "variants.1.agents.classify"),
        ("agent:writer", "checks.2.agent"),
        ("code:fixture_shop.triage.experiment_checks:summary_written", "checks.1.run"),
        ("dataset:triage_cases", "cases.dataset"),
        ("experiment:judge_check", "checks.2.validated_by"),
        ("flow:triage", "subject.flow"),
        ("inference:triage_judge", "checks.2.inference"),
    ]
    assert targets(index, JUDGE) == [("arm:judge_check.judge", "subject.arm"), ("dataset:judge_cases", "cases.dataset")]
    assert targets(index, FINDING) == [("experiment:triage_agents", "experiment")]


def test_an_arm_and_its_nodes_keep_their_references_inside_the_experiment(index: ProjectIndex) -> None:
    assert ("node:judge_check.judge.judge", "order.0") in targets(index, ARM)
    assert ("agent:writer", "agent") in targets(index, ARM_NODE)
    assert [str(item.source) for item in index.incoming(ARM)] == ["experiment:judge_check"]


def test_qualified_entities_are_found_by_their_own_name(index: ProjectIndex) -> None:
    assert index.find(EntityKind.ARM, "judge") == (ARM,)
    assert index.find(EntityKind.FINDING, SERIES) == (FINDING,)
    assert ARM_NODE in index.find(EntityKind.NODE, "judge")


def test_cli_refs_find_the_experiments_that_assign_an_agent(lab: Path, capsys: pytest.CaptureFixture[str]) -> None:
    assert main(["refs", "agent:cheap", str(lab)]) == 0
    assert "experiment:triage_agents  experiments/triage_agents/experiment.yaml" in capsys.readouterr().out
    assert main(["tree", str(lab)]) == 0
    assert EXPERIMENT_GROUPS in capsys.readouterr().out
