import re
from collections.abc import Mapping
from pathlib import Path
from typing import Final

import pytest
from pydantic import JsonValue, TypeAdapter, ValidationError

from aqven.diagnostics import DiagnosticCode
from aqven.loader import (
    LoadResult,
    Position,
    ProjectNotFound,
    YamlPath,
    entity_id,
    expected_kind,
    find_project_root,
    include_candidates,
    load_project,
    read_strict_yaml,
    type_id_for,
    validation_diagnostics,
)
from aqven.loader import project as loader_project
from aqven.spec import (
    AgentId,
    ExperimentId,
    FlowId,
    HumanNodeSpec,
    InferenceId,
    InferenceSpec,
    LlmNodeSpec,
    NodeId,
    SpecKind,
    SwitchNodeSpec,
    TypeId,
)
from aqven.testing import copy_project

FIXTURE: Final = Path(__file__).parent / "fixtures" / "fixture_shop"
HASH: Final = re.compile(r"^sha256-[0-9a-f]{64}$")
INFERENCE_ADAPTER: Final = TypeAdapter(InferenceSpec)
CLASSIFY: Final = "triage/classify.node.yaml"
INFERENCE: Final = "triage/classify.inference.yaml"
PROMPT: Final = "triage/classify.prompt.md"
SUMMARIZE: Final = "triage/summarize.yaml"
WRITER: Final = "shared/writer.yaml"

VALID_YAML: Final = 'apiVersion: "aqven/v1"\nkind: "Type"\nfields:\n- name: "subject"\n  maxLength: 200\n'

STRICT_VIOLATIONS: Final[Mapping[str, tuple[str, DiagnosticCode]]] = {
    "comment": ('a: "x" # пояснение\n', DiagnosticCode.E_YAML_COMMENT),
    "comment_line": ('# шапка\na: "x"\n', DiagnosticCode.E_YAML_COMMENT),
    "anchor": ("a: &base 1\nb: 2\n", DiagnosticCode.E_YAML_ANCHOR),
    "alias": ("a: &base 1\nb: *base\n", DiagnosticCode.E_YAML_ANCHOR),
    "tag": ("a: !!str 1\n", DiagnosticCode.E_YAML_TAG),
    "directive": ("%YAML 1.2\n---\na: 1\n", DiagnosticCode.E_YAML_DIRECTIVE),
    "flow_sequence": ('a: ["x", "y"]\n', DiagnosticCode.E_YAML_FLOW_STYLE),
    "flow_mapping": ('a: {b: "x"}\n', DiagnosticCode.E_YAML_FLOW_STYLE),
    "literal_block": ("a: |\n  text\n", DiagnosticCode.E_YAML_BLOCK_SCALAR),
    "folded_block": ("a: >\n  text\n", DiagnosticCode.E_YAML_BLOCK_SCALAR),
    "multi_document": ("a: 1\n---\nb: 2\n", DiagnosticCode.E_YAML_MULTI_DOCUMENT),
    "duplicate_key": ('a: "x"\na: "y"\n', DiagnosticCode.E_YAML_DUPLICATE_KEY),
    "syntax": ('a: "unterminated\nb: 1\n', DiagnosticCode.E_YAML_SYNTAX),
    "sequence_root": ('- "a"\n- "b"\n', DiagnosticCode.E_YAML_NOT_MAPPING),
    "empty": ("", DiagnosticCode.E_YAML_NOT_MAPPING),
}

ENTITY_IDS: Final[Mapping[str, tuple[str, SpecKind | None]]] = {
    "aqven.yaml": ("aqven", SpecKind.PROJECT),
    "flows/support_case/flow.yaml": ("support_case", SpecKind.FLOW),
    "flows/support_case/nodes/triage.node.yaml": ("triage", SpecKind.NODE),
    "flows/support_case/nodes/triage.inference.yaml": ("triage", SpecKind.INFERENCE),
    "flows/support_case/nodes/route/resolve.node.yaml": ("resolve", SpecKind.NODE),
    "flows/support_case/nodes/node.yaml": ("node", None),
    "flows/support_case/nodes/inference.yaml": ("inference", None),
    "judge_panel/component.yaml": ("component", None),
    "support/support_case/prepare.yaml": ("prepare", None),
    "agents/writer.yaml": ("writer", None),
    "agents/resolver.instructions.md": ("resolver", None),
    "money.yaml": ("money", None),
    "support/quick/flow.py": ("quick", SpecKind.FLOW),
    "support/quick.inference.py": ("quick", SpecKind.INFERENCE),
    "experiments/reply_quality/experiment.yaml": ("reply_quality", SpecKind.EXPERIMENT),
    "experiments/reply_quality/experiment.md": ("experiment", None),
    "experiments/reply_quality/flows/revise_only/flow.yaml": ("revise_only", SpecKind.FLOW),
}

INCLUDES: Final[Mapping[str, tuple[tuple[str, ...], str, tuple[str, ...]]]] = {
    "partial_of_variant": (
        ("support/reply/variants/tone", "support/reply"),
        "partials/revision",
        (
            "support/reply/variants/tone/partials/revision.md",
            "support/reply/partials/revision.md",
            "partials/revision.md",
        ),
    ),
    "relative_fragment": (
        ("support/reply",),
        "../../shared/prompts/brand_voice",
        ("shared/prompts/brand_voice.md",),
    ),
    "root_fragment": (
        ("support/reply",),
        "shared/prompts/brand_voice.md",
        ("support/reply/shared/prompts/brand_voice.md", "shared/prompts/brand_voice.md"),
    ),
    "root_alias": (
        ("support/reply",),
        "@root/shared/prompts/brand_voice",
        ("shared/prompts/brand_voice.md",),
    ),
}

NOTE_NODE: Final = """apiVersion: "aqven/v1"
kind: "Node"
node: "code"
description: "Заметка аудита"
run: "fixture_shop.triage.code:summarize"
out:
- name: "summary"
  type: "Text"
  description: "Заметка"
  maxLength: 200
"""


EXPERIMENT: Final = """apiVersion: "aqven/v1"
kind: "Experiment"
description: "A quick look at the audit flow"
subject:
  flow: "audit"
cases:
  dataset: "triage"
variants:
- id: "base"
question:
  kind: "look"
"""


def write(root: Path, relative: str, text: str) -> None:
    target = root / relative
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(text, encoding="utf-8")


def replace(root: Path, relative: str, old: str, new: str) -> None:
    target = root / relative
    source = target.read_text(encoding="utf-8")
    assert source.count(old) == 1, old
    target.write_text(source.replace(old, new), encoding="utf-8")


def codes(result: LoadResult) -> set[DiagnosticCode]:
    return {item.code for item in result.diagnostics}


@pytest.fixture
def shop(tmp_path: Path) -> Path:
    return copy_project(FIXTURE, tmp_path)


def test_strict_yaml_keeps_data_and_one_based_positions() -> None:
    document, problems = read_strict_yaml(VALID_YAML, "types/ticket.yaml")

    assert problems == ()
    assert document is not None
    assert document.data == {
        "apiVersion": "aqven/v1",
        "kind": "Type",
        "fields": [{"name": "subject", "maxLength": 200}],
    }
    assert document.positions[("apiVersion",)] == (1, 1)
    assert document.positions[("fields", 0)] == (4, 3)
    assert document.positions[("fields", 0, "maxLength")] == (5, 3)


@pytest.mark.parametrize("case", list(STRICT_VIOLATIONS), ids=list(STRICT_VIOLATIONS))
def test_strict_yaml_rejects_forbidden_constructs(case: str) -> None:
    text, expected = STRICT_VIOLATIONS[case]

    document, problems = read_strict_yaml(text, "types/broken.yaml")

    assert document is None
    assert expected in {item.code for item in problems}
    assert all(item.file == "types/broken.yaml" for item in problems)


def test_strict_yaml_reports_comment_line() -> None:
    _, problems = read_strict_yaml('a: "x"\nb: "y" # хвост\n', "aqven.yaml")

    (problem,) = problems
    assert (problem.code, problem.line) == (DiagnosticCode.E_YAML_COMMENT, 2)


def test_hash_inside_quoted_string_is_not_a_comment() -> None:
    document, problems = read_strict_yaml('a: "цвет #ffffff"\n', "aqven.yaml")

    assert problems == ()
    assert document is not None


def test_empty_flow_sequence_is_allowed_as_the_only_empty_list_spelling() -> None:
    document, problems = read_strict_yaml('a: []\nb:\n- "value"\n', "aqven.yaml")

    assert document is not None and not problems
    assert document.data == {"a": [], "b": ["value"]}

    _, nonempty_problems = read_strict_yaml('a: ["value"]\n', "aqven.yaml")
    assert any(problem.code == DiagnosticCode.E_YAML_FLOW_STYLE for problem in nonempty_problems)


def test_empty_flow_mapping_is_allowed_as_the_only_empty_mapping_spelling() -> None:
    document, problems = read_strict_yaml('agents: {}\nmodels:\n- "openai:gpt-5.4-mini"\n', "finding.yaml")

    assert document is not None and not problems
    assert document.data == {"agents": {}, "models": ["openai:gpt-5.4-mini"]}

    _, nonempty_problems = read_strict_yaml('agents: {revise: "mistral"}\n', "finding.yaml")
    assert [problem.code for problem in nonempty_problems] == [DiagnosticCode.E_YAML_FLOW_STYLE]


@pytest.mark.parametrize("path", list(ENTITY_IDS), ids=list(ENTITY_IDS))
def test_ids_come_from_file_name_up_to_the_first_dot_or_the_flow_folder(path: str) -> None:
    assert (entity_id(path), expected_kind(path)) == ENTITY_IDS[path]


@pytest.mark.parametrize("case", list(INCLUDES), ids=list(INCLUDES))
def test_includes_resolve_next_to_the_template_then_from_the_module_root(case: str) -> None:
    folders, name, expected = INCLUDES[case]

    assert include_candidates(folders, name) == expected


def test_type_id_is_pascal_case_of_the_stem() -> None:
    assert type_id_for("refund_policy_id") == TypeId("RefundPolicyId")


def test_fixture_project_loads_without_diagnostics() -> None:
    result = load_project(FIXTURE)

    assert result.diagnostics == ()
    project = result.project
    assert project is not None
    assert project.project.spec.package == "fixture_shop"
    assert set(project.types) == {
        TypeId("Customer"),
        TypeId("TriageCategory"),
        TypeId("TriageTicket"),
        TypeId("TriageReview"),
        TypeId("TriageResult"),
    }
    flow = project.flows[FlowId("triage")]
    assert flow.source is not None
    assert flow.folder == "triage"
    assert HASH.fullmatch(flow.source.file_hash) is not None
    assert set(flow.nodes) == {NodeId("classify"), NodeId("route"), NodeId("route__confirm"), NodeId("summarize")}
    assert isinstance(flow.nodes[NodeId("route")].spec, SwitchNodeSpec)
    assert isinstance(flow.nodes[NodeId("route__confirm")].spec, HumanNodeSpec)
    inference = project.inferences[InferenceId("classify")]
    assert (inference.folder, inference.stem, set(inference.texts)) == ("triage", "triage/classify", {"prompt"})
    assert set(project.agents) == {AgentId("writer"), AgentId("cheap")}
    assert {"shared/tone.md", PROMPT} <= set(project.texts)
    assert project.invalid_paths == frozenset()


def test_node_uses_the_inference_next_to_it_without_a_key() -> None:
    project = load_project(FIXTURE).project
    assert project is not None

    classify = project.flows[FlowId("triage")].nodes[NodeId("classify")]

    assert isinstance(classify.spec, LlmNodeSpec)
    assert classify.spec.inference == InferenceId("classify")
    assert classify.path == CLASSIFY


def test_each_node_takes_the_inference_and_texts_of_its_own_prefix(shop: Path) -> None:
    node = (shop / CLASSIFY).read_text(encoding="utf-8").replace("Выбор очереди по теме и тексту", "Повторный выбор")
    write(shop, "triage/recheck.node.yaml", node)
    write(shop, "triage/recheck.inference.yaml", (shop / INFERENCE).read_text(encoding="utf-8"))
    write(shop, "triage/recheck.prompt.md", (shop / PROMPT).read_text(encoding="utf-8"))
    write(shop, "triage/recheck.variants/tone/calm.md", "Пиши спокойно.\n")

    project = load_project(shop).project

    assert project is not None
    nodes = project.flows[FlowId("triage")].nodes
    specs = {name: nodes[NodeId(name)].spec for name in ("classify", "recheck")}
    assert {name: spec.inference for name, spec in specs.items() if isinstance(spec, LlmNodeSpec)} == {
        "classify": InferenceId("classify"),
        "recheck": InferenceId("recheck"),
    }
    assert set(project.inferences[InferenceId("classify")].texts) == {"prompt"}
    assert set(project.inferences[InferenceId("recheck")].texts) == {"prompt", "variants/tone/calm"}


def test_source_spec_keeps_positions_of_keys() -> None:
    project = load_project(FIXTURE).project
    assert project is not None

    classify = project.flows[FlowId("triage")].nodes[NodeId("classify")]
    inference = project.inferences[InferenceId("classify")].source

    assert classify.positions[("agent",)] == (5, 1)
    assert inference is not None
    assert inference.positions[("out", 1, "type")] == (14, 3)


def test_missing_project_file_is_reported(tmp_path: Path) -> None:
    result = load_project(tmp_path)

    assert result.project is None
    assert codes(result) == {DiagnosticCode.E_PROJECT_NOT_FOUND}


def test_project_root_is_found_from_nested_path() -> None:
    assert find_project_root(FIXTURE / "triage" / "types") == FIXTURE.resolve()


def test_project_root_outside_any_project_raises(tmp_path: Path) -> None:
    with pytest.raises(ProjectNotFound):
        find_project_root(tmp_path)


def test_unknown_key_carries_file_path_and_line(shop: Path) -> None:
    replace(shop, CLASSIFY, 'agent: "writer"\n', 'instructions: "Классифицируй"\nagent: "writer"\n')

    result = load_project(shop)

    (problem,) = result.diagnostics
    assert problem.code is DiagnosticCode.E_UNKNOWN_KEY
    assert (problem.file, problem.path, problem.line) == (CLASSIFY, ("instructions",), 5)
    assert CLASSIFY in (result.project.invalid_paths if result.project else ())


def test_check_union_errors_point_into_the_document(shop: Path) -> None:
    replace(shop, INFERENCE, 'on_fail: "flag"', 'on_fail: "warn"')

    (problem,) = load_project(shop).diagnostics

    assert (problem.code, problem.path) == (DiagnosticCode.E_SPEC_INVALID, ("checks", 1, "on_fail"))
    assert problem.line == 35


def test_all_errors_of_a_file_are_reported_at_once(shop: Path) -> None:
    replace(shop, SUMMARIZE, "out:\n", 'color: "red"\nout:\n')
    replace(shop, SUMMARIZE, "  maxLength: 200\n", "  maxLength: -1\n")

    result = load_project(shop)

    assert codes(result) == {DiagnosticCode.E_SPEC_INVALID, DiagnosticCode.E_UNKNOWN_KEY}
    assert {item.path for item in result.diagnostics} == {("out", 0, "maxLength"), ("color",)}


def test_determinism_and_ttl_are_unknown_keys(shop: Path) -> None:
    replace(shop, SUMMARIZE, "in:\n", 'determinism: "stable"\nttl_ms: 1000\nin:\n')

    result = load_project(shop)

    assert codes(result) == {DiagnosticCode.E_UNKNOWN_KEY}
    assert {item.path for item in result.diagnostics} == {("determinism",), ("ttl_ms",)}


def test_escalation_with_value_is_unknown_key_under_policy(shop: Path) -> None:
    replace(
        shop,
        "triage/confirm.yaml",
        '  policy: "default"\n  value:\n    category: "delivery"\n',
        '  policy: "escalate"\n  assignee: "lead"\n  timeout_seconds: 60\n  value: "x"\n',
    )

    (problem,) = load_project(shop).diagnostics

    assert problem.code is DiagnosticCode.E_UNKNOWN_KEY
    assert problem.path == ("on_timeout", "value")


@pytest.mark.parametrize(
    ("old", "new", "expected"),
    [
        ('apiVersion: "aqven/v1"', 'apiVersion: "aqven/v9"', DiagnosticCode.E_API_VERSION),
        ('kind: "Node"', 'kind: "Flow"', DiagnosticCode.E_KIND_PATH_MISMATCH),
        ('kind: "Node"', 'kind: "Widget"', DiagnosticCode.E_KIND_UNKNOWN),
        ('node: "llm"', 'node: "race"', DiagnosticCode.E_NODE_KIND_UNSUPPORTED),
    ],
    ids=["api_version", "conventional_name_kind", "kind_unknown", "node_kind_unsupported"],
)
def test_header_problems(shop: Path, old: str, new: str, expected: DiagnosticCode) -> None:
    replace(shop, CLASSIFY, old, new)

    assert codes(load_project(shop)) == {expected}


def test_project_kind_outside_the_root_file_is_misplaced(shop: Path) -> None:
    write(shop, "shared/settings.yaml", (shop / "aqven.yaml").read_text(encoding="utf-8"))

    result = load_project(shop)

    assert [(item.code, item.file) for item in result.diagnostics] == [
        (DiagnosticCode.E_KIND_PATH_MISMATCH, "shared/settings.yaml")
    ]


def test_yaml_without_aqven_header_is_ignored(shop: Path) -> None:
    write(shop, "triage/notes.yaml", "title: x  # не описание aqven\nitems: [1, 2]\n")
    write(shop, "shared/other.yml", 'apiVersion: "apps/v1"\nkind: "Deployment"\n')

    assert load_project(shop).diagnostics == ()


def test_aqven_yaml_without_kind_is_reported(shop: Path) -> None:
    write(shop, "triage/notes.yaml", 'apiVersion: "aqven/v1"\n')

    assert codes(load_project(shop)) == {DiagnosticCode.E_KIND_UNKNOWN}


@pytest.mark.parametrize(
    ("original", "copy"),
    [
        ("shared/customer.yaml", "triage/types/customer.yaml"),
        (WRITER, "triage/agents/writer.yaml"),
        (INFERENCE, "shared/classify.inference.yaml"),
        (SUMMARIZE, "triage/more/summarize.yaml"),
    ],
    ids=["type", "agent", "inference", "node_of_one_flow"],
)
def test_duplicate_id_of_one_kind_names_both_files(shop: Path, original: str, copy: str) -> None:
    write(shop, copy, (shop / original).read_text(encoding="utf-8"))

    (problem,) = [item for item in load_project(shop).diagnostics if item.code is DiagnosticCode.E_ID_DUPLICATE]

    (other,) = {original, copy} - {problem.file}
    assert other in problem.message


def test_same_id_in_different_kinds_is_allowed(shop: Path) -> None:
    write(shop, "shared/triage.yaml", (shop / WRITER).read_text(encoding="utf-8"))

    result = load_project(shop)

    assert result.diagnostics == ()
    assert result.project is not None
    assert AgentId("triage") in result.project.agents


def test_nodes_belong_to_the_nearest_flow(shop: Path) -> None:
    flow = (shop / "triage/flow.yaml").read_text(encoding="utf-8")
    write(shop, "triage/audit/flow.yaml", flow)
    write(shop, "triage/audit/steps/note.yaml", NOTE_NODE)

    project = load_project(shop).project

    assert project is not None
    assert set(project.flows[FlowId("audit")].nodes) == {NodeId("note")}
    assert NodeId("note") not in project.flows[FlowId("triage")].nodes


def test_node_outside_any_flow_is_orphan(shop: Path) -> None:
    write(shop, "shared/note.yaml", NOTE_NODE)

    result = load_project(shop)

    assert [(item.code, item.file) for item in result.diagnostics] == [
        (DiagnosticCode.E_ORPHAN_FILE, "shared/note.yaml")
    ]


def test_inference_key_next_to_own_inference_conflicts(shop: Path) -> None:
    replace(shop, CLASSIFY, 'agent: "writer"\n', 'inference: "classify"\nagent: "writer"\n')

    result = load_project(shop)

    assert [(item.code, item.file, item.path) for item in result.diagnostics] == [
        (DiagnosticCode.E_SOURCE_CONFLICT, CLASSIFY, ("inference",))
    ]


def test_bad_id_from_file_name_is_reported(shop: Path) -> None:
    write(shop, "shared/night-writer.yaml", (shop / WRITER).read_text(encoding="utf-8"))
    write(shop, "triage/route__extra.yaml", NOTE_NODE)

    result = load_project(shop)

    assert {(item.code, item.file) for item in result.diagnostics} >= {
        (DiagnosticCode.E_BAD_NAME, "shared/night-writer.yaml"),
        (DiagnosticCode.E_BAD_NAME, "triage/route__extra.yaml"),
    }


@pytest.mark.parametrize("builder", ["triage/flow.py", "triage/classify.inference.py"])
def test_yaml_and_builder_sources_conflict(shop: Path, builder: str) -> None:
    write(shop, builder, "from aqven.spec import Flow\n")

    result = load_project(shop)

    assert [(item.code, item.file) for item in result.diagnostics] == [(DiagnosticCode.E_SOURCE_CONFLICT, builder)]


def test_dynamic_limits_errors_get_their_own_code() -> None:
    data: JsonValue = {
        "apiVersion": "aqven/v1",
        "kind": "Inference",
        "description": "d",
        "out": [{"name": "record", "type": "Dynamic", "description": "d", "limits": {"max_depth": 4}}],
    }
    positions: dict[YamlPath, Position] = {
        ("out",): (1, 1),
        ("out", 0): (2, 3),
        ("out", 0, "limits"): (3, 3),
        ("out", 0, "limits", "max_depth"): (4, 5),
    }

    with pytest.raises(ValidationError) as caught:
        INFERENCE_ADAPTER.validate_python(data)
    problems = validation_diagnostics(caught.value, "support/x.inference.yaml", positions, data)

    assert {item.code for item in problems} == {DiagnosticCode.E_DYNAMIC_LIMITS}
    assert ("out", 0, "limits", "max_depth") in {item.path for item in problems}
    assert all(item.path[0] == "out" for item in problems)


def with_experiment(root: Path, folder: str) -> None:
    write(root, f"{folder}/experiment.yaml", EXPERIMENT)
    write(root, f"{folder}/flows/audit/flow.yaml", (root / "triage/flow.yaml").read_text(encoding="utf-8"))
    write(root, f"{folder}/flows/audit/nodes/note.yaml", NOTE_NODE)


def test_experiment_takes_its_id_notes_and_local_flows_from_its_folder(shop: Path) -> None:
    with_experiment(shop, "experiments/audit_look")
    write(shop, "experiments/audit_look/experiment.md", "Why the audit flow is worth a look.\n")

    result = load_project(shop)

    assert result.diagnostics == ()
    project = result.project
    assert project is not None
    experiment = project.experiments[ExperimentId("audit_look")]
    assert (experiment.folder, experiment.source.path) == (
        "experiments/audit_look",
        "experiments/audit_look/experiment.yaml",
    )
    assert experiment.notes == "Why the audit flow is worth a look.\n"
    assert set(experiment.flows) == {FlowId("audit")}
    assert set(experiment.flows[FlowId("audit")].nodes) == {NodeId("note")}
    assert experiment.flows[FlowId("audit")].folder == "experiments/audit_look/flows/audit"
    assert set(project.flows) == {FlowId("triage")}


def test_experiment_without_notes_or_local_files_loads(shop: Path) -> None:
    write(shop, "experiments/audit_look/experiment.yaml", EXPERIMENT)

    project = load_project(shop).project

    assert project is not None
    experiment = project.experiments[ExperimentId("audit_look")]
    assert (experiment.notes, dict(experiment.flows), dict(experiment.alternatives), dict(experiment.prompts)) == (
        None,
        {},
        {},
        {},
    )


def test_experiment_owns_its_alternatives_by_local_id_with_their_own_files(shop: Path) -> None:
    folder = "experiments/audit_look"
    write(shop, f"{folder}/experiment.yaml", EXPERIMENT)
    write(shop, f"{folder}/nodes/note_short/note_short.node.yaml", NOTE_NODE)
    write(shop, f"{folder}/nodes/classify_short.node.yaml", (shop / CLASSIFY).read_text(encoding="utf-8"))
    write(shop, f"{folder}/nodes/classify_short.inference.yaml", (shop / INFERENCE).read_text(encoding="utf-8"))
    write(shop, f"{folder}/nodes/classify_short.prompt.md", (shop / PROMPT).read_text(encoding="utf-8"))

    result = load_project(shop)

    assert result.diagnostics == ()
    project = result.project
    assert project is not None
    alternatives = project.experiments[ExperimentId("audit_look")].alternatives
    classify = alternatives[NodeId("classify_short")].spec
    assert set(alternatives) == {NodeId("note_short"), NodeId("classify_short")}
    assert alternatives[NodeId("note_short")].path == f"{folder}/nodes/note_short/note_short.node.yaml"
    assert isinstance(classify, LlmNodeSpec) and classify.inference == InferenceId("classify_short")
    assert InferenceId("classify_short") in project.inferences


def test_alternative_ids_are_unique_in_an_experiment(shop: Path) -> None:
    folder = "experiments/audit_look"
    write(shop, f"{folder}/experiment.yaml", EXPERIMENT)
    write(shop, f"{folder}/nodes/a/note_short.node.yaml", NOTE_NODE)
    write(shop, f"{folder}/nodes/b/note_short.node.yaml", NOTE_NODE)

    result = load_project(shop)

    assert [(item.code, item.file) for item in result.diagnostics] == [
        (DiagnosticCode.E_ID_DUPLICATE, f"{folder}/nodes/b/note_short.node.yaml")
    ]


def test_experiment_prompts_are_named_by_their_files(shop: Path) -> None:
    folder = "experiments/audit_look"
    write(shop, f"{folder}/experiment.yaml", EXPERIMENT)
    write(shop, f"{folder}/prompts/short.md", "Sort the ticket.\n")
    write(shop, f"{folder}/prompts/Long-One.md", "Sort the ticket slowly.\n")
    write(shop, f"{folder}/prompts/drafts/old.md", "Old.\n")

    result = load_project(shop)

    assert [(item.code, item.file) for item in result.diagnostics] == [
        (DiagnosticCode.E_BAD_NAME, f"{folder}/prompts/Long-One.md")
    ]
    assert result.project is not None
    prompts = result.project.experiments[ExperimentId("audit_look")].prompts
    assert {name: (prompt.path, prompt.text) for name, prompt in prompts.items()} == {
        "short": (f"{folder}/prompts/short.md", "Sort the ticket.\n")
    }


def test_same_local_flow_name_in_two_experiments_does_not_collide(shop: Path) -> None:
    with_experiment(shop, "experiments/audit_look")
    with_experiment(shop, "experiments/audit_again")

    result = load_project(shop)

    assert result.diagnostics == ()
    project = result.project
    assert project is not None
    folders = {key: experiment.flows[FlowId("audit")].folder for key, experiment in project.experiments.items()}
    assert folders == {
        ExperimentId("audit_look"): "experiments/audit_look/flows/audit",
        ExperimentId("audit_again"): "experiments/audit_again/flows/audit",
    }
    assert FlowId("audit") not in project.flows


def test_flows_folder_without_experiment_file_holds_project_flows(shop: Path) -> None:
    with_experiment(shop, "experiments/audit_look")
    (shop / "experiments/audit_look/experiment.yaml").unlink()

    project = load_project(shop).project

    assert project is not None
    assert project.experiments == {}
    assert project.flows[FlowId("audit")].folder == "experiments/audit_look/flows/audit"


def test_invalid_experiment_file_still_owns_its_local_flows(shop: Path) -> None:
    with_experiment(shop, "experiments/audit_look")
    replace(shop, "experiments/audit_look/experiment.yaml", 'kind: "look"', 'kind: "glance"')

    result = load_project(shop)

    assert codes(result) == {DiagnosticCode.E_SPEC_INVALID}
    assert result.project is not None
    assert result.project.experiments == {}
    assert FlowId("audit") not in result.project.flows


@pytest.mark.parametrize(
    "folder",
    ["experiments/audit_look/arms/audit", "experiments/audit_look/audit", "experiments/audit_look"],
)
def test_flow_elsewhere_in_an_experiment_folder_is_an_orphan(shop: Path, folder: str) -> None:
    write(shop, "experiments/audit_look/experiment.yaml", EXPERIMENT)
    write(shop, f"{folder}/flow.yaml", (shop / "triage/flow.yaml").read_text(encoding="utf-8"))
    write(shop, f"{folder}/nodes/note.yaml", NOTE_NODE)

    result = load_project(shop)

    problem = next(item for item in result.diagnostics if item.code is DiagnosticCode.E_ORPHAN_FILE)
    assert [(item.code, item.file) for item in result.diagnostics] == [
        (DiagnosticCode.E_ORPHAN_FILE, f"{folder}/flow.yaml")
    ]
    assert "move it there" in problem.message and "experiments/audit_look/flows/" in problem.message
    assert result.project is not None
    assert dict(result.project.experiments[ExperimentId("audit_look")].flows) == {}
    assert set(result.project.flows) == {FlowId("triage")}


def test_node_elsewhere_in_an_experiment_folder_is_an_orphan(shop: Path) -> None:
    write(shop, "experiments/audit_look/experiment.yaml", EXPERIMENT)
    write(shop, "experiments/audit_look/spare/note.yaml", NOTE_NODE)

    result = load_project(shop)

    assert [(item.code, item.file) for item in result.diagnostics] == [
        (DiagnosticCode.E_ORPHAN_FILE, "experiments/audit_look/spare/note.yaml")
    ]


def test_a_file_deleted_between_listing_and_reading_is_skipped(shop: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    ghosts = (shop / "shared/ghost.yaml", shop / "shared/ghost.md")
    ghosts[0].write_text(VALID_YAML, encoding="utf-8")
    ghosts[1].write_text("gone soon", encoding="utf-8")
    listed = loader_project.project_files

    def listing_then_delete(root: Path) -> tuple[str, ...]:
        files = listed(root)
        for ghost in ghosts:
            ghost.unlink()
        return files

    monkeypatch.setattr(loader_project, "project_files", listing_then_delete)

    result = load_project(shop)

    assert result.project is not None
    assert TypeId("ghost") not in result.project.types
    assert "shared/ghost.md" not in result.project.texts
    assert {"shared/tone.md", PROMPT} <= set(result.project.texts)
