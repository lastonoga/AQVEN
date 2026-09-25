import importlib.util
import subprocess
import sys
from collections.abc import Mapping, Sequence
from pathlib import Path
from types import ModuleType
from typing import Final, NewType

import pytest
from pydantic import JsonValue, TypeAdapter

from aqven.codegen import (
    GENERATED_HEADER,
    GENERATED_TYPES,
    AlternativeStepShape,
    InferenceShape,
    LocalStepShape,
    StepShape,
    ToolShape,
    generate_types,
    plan_types,
    render_types,
)
from aqven.spec import (
    CodeNodeSpec,
    ExperimentId,
    FieldDecl,
    FlowId,
    InferenceId,
    InferenceSpec,
    NodeId,
    ToolId,
    ToolSpec,
    TypeId,
    TypeSpec,
    build_type_models,
    normalized_schema,
)
from aqven.testing import copy_project

FIXTURE: Final = Path(__file__).parent / "fixtures" / "fixture_shop"
TYPE_ADAPTER: Final = TypeAdapter[TypeSpec](TypeSpec)
HEADER: Final[Mapping[str, JsonValue]] = {"apiVersion": "aqven/v1", "kind": "Type", "description": "тип"}
INFERENCE_ADAPTER: Final = TypeAdapter(InferenceSpec)
INFERENCE_HEADER: Final[Mapping[str, JsonValue]] = {"apiVersion": "aqven/v1", "kind": "Inference", "description": "и"}
TOOL_ADAPTER: Final = TypeAdapter(ToolSpec)
TOOL_HEADER: Final[Mapping[str, JsonValue]] = {
    "apiVersion": "aqven/v1",
    "kind": "Tool",
    "description": "т",
    "effect": "read",
}
STEP_ADAPTER: Final = TypeAdapter(CodeNodeSpec)
STEP_HEADER: Final[Mapping[str, JsonValue]] = {
    "apiVersion": "aqven/v1",
    "kind": "Node",
    "node": "code",
    "description": "у",
}


def field(name: str, type_ref: str, **constraints: JsonValue) -> dict[str, JsonValue]:
    return {"name": name, "type": type_ref, "description": "поле", **constraints}


DOCUMENTS: Final[Mapping[str, dict[str, JsonValue]]] = {
    "Tier": {"type": "enum", "values": [{"value": "basic", "description": "б"}, {"value": "pro", "description": "п"}]},
    "OrderId": {"type": "id", "pattern": "^LUM-[0-9]{8}$", "maxLength": 12},
    "Slug": {"type": "id"},
    "Score": {"type": "value", "base": "Float", "minimum": 0, "maximum": 1},
    "Mood": {"type": "value", "base": "Text", "enum": ["calm", "loud"]},
    "Title": {"type": "value", "base": "Text", "maxLength": 80, "pattern": "^\\S.*$"},
    "Flag": {"type": "value", "base": "Bool"},
    "Account": {
        "type": "record",
        "fields": [
            field("order_id", "OrderId"),
            field("slug", "Slug?"),
            field("tier", "Tier"),
            field("score", "Score"),
            field("mood", "Mood[]", maxItems=2),
            field("tags", "Text[]", maxItems=5, maxLength=40),
            field("status", "Text", enum=["open", "closed"]),
            field("count", "Int", minimum=0, maximum=10),
            field("ratio", "Float?", maximum=2.5),
            field("json", "Text", maxLength=10),
            field("from", "Date"),
            field("seen_at", "DateTime?"),
            field("photo", "Image?"),
            field("clips", "Video[]", maxItems=3),
            field("locale", "Locale"),
            field("extra", "Dynamic"),
            field("form", "FieldSpec[]", maxItems=4),
            field("address", "Address"),
        ],
    },
    "Address": {"type": "record", "fields": [field("line", "Text", maxLength=200), field("title", "Title")]},
    "Origin": {
        "type": "union",
        "discriminator": "kind",
        "variants": [
            {"name": "store_front", "description": "витрина", "fields": [field("page", "Text", maxLength=200)]},
            {"name": "market", "description": "площадка", "fields": [field("account", "Account")]},
        ],
    },
    "Single": {
        "type": "union",
        "discriminator": "kind",
        "variants": [{"name": "only", "description": "единственный"}],
    },
    "Broken": {"type": "record", "fields": [field("ghost", "Ghost")]},
}


def types() -> dict[TypeId, TypeSpec]:
    return {TypeId(name): TYPE_ADAPTER.validate_python({**HEADER, **data}) for name, data in DOCUMENTS.items()}


INFERENCES: Final[Mapping[str, dict[str, JsonValue]]] = {
    "write_reply": {
        "in": [field("account", "Account"), field("tags", "Text[]", maxItems=5, maxLength=40), field("from", "Date")],
        "out": [field("origin", "Origin"), field("score", "Score"), field("order_id", "OrderId?")],
    },
    "ping": {"out": [field("flag", "Flag")]},
    "haunted": {"in": [field("ghost", "Ghost")], "out": [field("mood", "Mood")]},
    "broken": {"in": [field("text", "Text", maxLength=10)], "out": [field("broken", "Broken")]},
    "x1": {"out": [field("count", "Int", minimum=0)]},
    "x_1": {"out": [field("count", "Int", maximum=9)]},
}


def inferences() -> dict[InferenceId, InferenceSpec]:
    return {
        InferenceId(name): INFERENCE_ADAPTER.validate_python({**INFERENCE_HEADER, **data})
        for name, data in INFERENCES.items()
    }


TOOLS: Final[Mapping[str, dict[str, JsonValue]]] = {
    "lookup_order": {
        "run": "shop.tools:lookup_order",
        "in": [field("order_id", "OrderId")],
        "out": [field("address", "Address"), field("score", "Score")],
    },
    "search_notes": {"mcp": {"server": "desk", "tool": "search_notes"}},
    "ping": {"run": "shop.tools:ping", "out": [field("flag", "Flag")]},
}

STEPS: Final[Mapping[tuple[str, str], dict[str, JsonValue]]] = {
    ("support_case", "prepare"): {
        "run": "prepare",
        "in": [{**field("tags", "Text[]", maxItems=5, maxLength=40), "from": "$input.tags"}],
        "out": [field("tier", "Tier"), field("origin", "Origin")],
    },
    ("judge_panel", "review__pick"): {
        "run": "pick",
        "in": [{**field("ghost", "Ghost"), "value": "boo"}],
        "out": [field("account", "Account")],
    },
}


def tools() -> dict[ToolId, ToolSpec]:
    return {ToolId(name): TOOL_ADAPTER.validate_python({**TOOL_HEADER, **data}) for name, data in TOOLS.items()}


def steps() -> dict[tuple[FlowId, NodeId], CodeNodeSpec]:
    return {
        (FlowId(flow_id), NodeId(node_id)): STEP_ADAPTER.validate_python({**STEP_HEADER, **data})
        for (flow_id, node_id), data in STEPS.items()
    }


LOCAL_STEPS: Final[Mapping[tuple[str, str, str], dict[str, JsonValue]]] = {
    ("judge_check", "judge", "verdict"): {
        "run": "verdict",
        "in": [{**field("score", "Score"), "from": "$judge.out.score"}],
        "out": [field("flag", "Flag")],
    },
    ("judge_again", "judge", "verdict"): {
        "run": "verdict",
        "in": [{**field("score", "Score"), "from": "$judge.out.score"}],
        "out": [field("tier", "Tier")],
    },
    ("support", "case", "prepare"): {
        "run": "prepare",
        "out": [field("flag", "Flag")],
    },
}


def local_steps() -> dict[tuple[ExperimentId, FlowId, NodeId], CodeNodeSpec]:
    return {
        (ExperimentId(experiment_id), FlowId(flow_id), NodeId(node_id)): STEP_ADAPTER.validate_python(
            {**STEP_HEADER, **data}
        )
        for (experiment_id, flow_id, node_id), data in LOCAL_STEPS.items()
    }


ALTERNATIVE_STEPS: Final[Mapping[tuple[str, str], dict[str, JsonValue]]] = {
    ("judge_check", "verdict_strict"): {
        "run": "verdict_strict",
        "in": [{**field("score", "Score"), "from": "$judge.out.score"}],
        "out": [field("flag", "Flag")],
    },
    ("support", "case_prepare"): {
        "run": "case_prepare",
        "out": [field("flag", "Flag")],
    },
}


def alternative_steps() -> dict[tuple[ExperimentId, NodeId], CodeNodeSpec]:
    return {
        (ExperimentId(experiment_id), NodeId(node_id)): STEP_ADAPTER.validate_python({**STEP_HEADER, **data})
        for (experiment_id, node_id), data in ALTERNATIVE_STEPS.items()
    }


def load_module(path: Path) -> ModuleType:
    spec = importlib.util.spec_from_file_location("aqven_codegen_probe", path)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    try:
        spec.loader.exec_module(module)
    finally:
        sys.modules.pop(spec.name, None)
    return module


def generated_annotation(module: ModuleType, type_id: str) -> object:
    value: object = getattr(module, type_id)
    if isinstance(value, NewType):
        value = getattr(module, f"{type_id}Field")
    return getattr(value, "__value__", value)


def test_generated_models_have_the_schemas_of_the_type_files(tmp_path: Path) -> None:
    declared = types()
    target = tmp_path / "types.py"
    target.write_text(render_types(declared), encoding="utf-8")

    module = load_module(target)
    models = build_type_models(declared)

    assert set(models.annotations) == set(declared) - {TypeId("Broken")}
    for type_id, annotation in models.annotations.items():
        assert normalized_schema(generated_annotation(module, type_id)) == normalized_schema(annotation), type_id


def test_generated_source_is_ordered_by_dependency_and_names_reserved_fields() -> None:
    source = render_types(types())

    assert source.index("class Address(") < source.index("class Account(") < source.index("class OriginMarket(")
    assert 'json_: Annotated[str, StringConstraints(max_length=10)] = Field(alias="json")' in source
    assert 'from_: date = Field(alias="from")' in source
    assert "    order_id: OrderIdField\n" in source
    assert 'type Origin = Annotated[OriginStoreFront | OriginMarket, Field(discriminator="kind")]' in source
    assert "type Single = SingleOnly" in source
    assert "Broken" not in source
    assert source.startswith(
        f"{GENERATED_HEADER}\nfrom datetime import date, datetime\nfrom typing import Annotated, Literal, NewType\n"
    )


def test_no_types_render_nothing() -> None:
    assert render_types({}) == ""


def test_inference_models_have_the_schemas_of_the_inference_records(tmp_path: Path) -> None:
    declared = types()
    target = tmp_path / "types.py"
    target.write_text(render_types(declared, inferences()), encoding="utf-8")

    module = load_module(target)
    models = build_type_models(declared)
    records = {
        "WriteReplyIn": INFERENCES["write_reply"]["in"],
        "WriteReplyOut": INFERENCES["write_reply"]["out"],
        "PingOut": INFERENCES["ping"]["out"],
        "HauntedOut": INFERENCES["haunted"]["out"],
        "X1Out": INFERENCES["x1"]["out"],
    }

    for name, fields in records.items():
        spec = INFERENCE_ADAPTER.validate_python({**INFERENCE_HEADER, "out": fields})
        expected = normalized_schema(models.record(name, spec.out))
        assert normalized_schema(generated_annotation(module, name)) == expected, name
    assert normalized_schema(generated_annotation(module, "PingIn")) == normalized_schema(models.record("PingIn", []))


def test_inference_models_follow_the_types_in_id_order_and_skip_unbuildable_or_taken_names() -> None:
    plan = plan_types(types(), inferences())
    source = render_types(types(), inferences())

    assert [record.name for record in plan.records] == [
        "BrokenIn",
        "HauntedOut",
        "PingIn",
        "PingOut",
        "WriteReplyIn",
        "WriteReplyOut",
        "X1In",
        "X1Out",
    ]
    assert [(record.name, record.owner) for record in plan.conflicts] == [
        ("X1In", InferenceShape(InferenceId("x_1"))),
        ("X1Out", InferenceShape(InferenceId("x_1"))),
    ]
    assert source.index("class OriginMarket(") < source.index("class HauntedOut(") < source.index("class X1Out(")
    assert "HauntedIn" not in source
    assert "BrokenOut" not in source
    assert 'from_: date = Field(alias="from")' in source
    assert "    order_id: OrderIdField | None\n" in source
    assert source.count("class X1Out(BaseModel):") == 1
    assert "count: Annotated[int, Field(ge=0)]" in source


def test_inference_model_name_taken_by_a_type_is_a_conflict() -> None:
    declared = {**types(), TypeId("PingOut"): types()[TypeId("Address")]}

    plan = plan_types(declared, inferences())

    assert [record.name for record in plan.conflicts] == ["PingOut", "X1In", "X1Out"]
    assert render_types(declared, inferences()).count("class PingOut(BaseModel):") == 1


def test_tool_and_step_models_have_the_schemas_of_their_declarations(tmp_path: Path) -> None:
    declared = types()
    target = tmp_path / "types.py"
    target.write_text(render_types(declared, tools=tools(), steps=steps()), encoding="utf-8")

    module = load_module(target)
    models = build_type_models(declared)
    lookup = tools()[ToolId("lookup_order")]
    ping = tools()[ToolId("ping")]
    prepare = steps()[(FlowId("support_case"), NodeId("prepare"))]
    pick = steps()[(FlowId("judge_panel"), NodeId("review__pick"))]
    records: Mapping[str, Sequence[FieldDecl]] = {
        "LookupOrderIn": lookup.in_,
        "LookupOrderOut": lookup.out,
        "PingIn": ping.in_,
        "PingOut": ping.out,
        "SupportCasePrepareIn": prepare.in_,
        "SupportCasePrepareOut": prepare.out,
        "JudgePanelPickOut": pick.out,
    }

    for name, fields in records.items():
        expected = normalized_schema(models.record(name, fields))
        assert normalized_schema(generated_annotation(module, name)) == expected, name


def test_tool_and_step_models_follow_inference_models_in_id_order() -> None:
    plan = plan_types(types(), inferences(), tools(), steps())
    source = render_types(types(), inferences(), tools(), steps())
    names = [record.name for record in plan.records]

    assert names[names.index("X1Out") + 1 :] == [
        "LookupOrderIn",
        "LookupOrderOut",
        "JudgePanelPickOut",
        "SupportCasePrepareIn",
        "SupportCasePrepareOut",
    ]
    assert [(record.name, record.owner) for record in plan.conflicts] == [
        ("X1In", InferenceShape(InferenceId("x_1"))),
        ("X1Out", InferenceShape(InferenceId("x_1"))),
        ("PingIn", ToolShape(ToolId("ping"))),
        ("PingOut", ToolShape(ToolId("ping"))),
    ]
    assert plan.records[-1].owner == StepShape(FlowId("support_case"), NodeId("prepare"))
    assert "SearchNotes" not in source
    assert "JudgePanelPickIn" not in source
    assert "JudgePanelReviewPick" not in source
    assert (
        "    tags: Annotated[list[Annotated[str, StringConstraints(max_length=40)]], Field(max_length=5)]\n" in source
    )


def test_step_model_name_taken_by_a_type_is_a_conflict() -> None:
    declared = {**types(), TypeId("SupportCasePrepareOut"): types()[TypeId("Address")]}

    plan = plan_types(declared, tools=tools(), steps=steps())

    assert [(record.name, record.owner) for record in plan.conflicts] == [
        ("SupportCasePrepareOut", StepShape(FlowId("support_case"), NodeId("prepare")))
    ]


def test_local_step_models_carry_the_experiment_and_flow_and_follow_the_flow_steps(tmp_path: Path) -> None:
    declared = types()
    plan = plan_types(declared, steps=steps(), local_steps=local_steps())
    target = tmp_path / "types.py"
    target.write_text(render_types(declared, steps=steps(), local_steps=local_steps()), encoding="utf-8")
    module = load_module(target)
    models = build_type_models(declared)
    names = [record.name for record in plan.records]

    assert names[names.index("SupportCasePrepareOut") + 1 :] == [
        "JudgeAgainJudgeVerdictIn",
        "JudgeAgainJudgeVerdictOut",
        "JudgeCheckJudgeVerdictIn",
        "JudgeCheckJudgeVerdictOut",
    ]
    assert [(record.name, record.owner) for record in plan.conflicts] == [
        ("SupportCasePrepareIn", LocalStepShape(ExperimentId("support"), FlowId("case"), NodeId("prepare"))),
        ("SupportCasePrepareOut", LocalStepShape(ExperimentId("support"), FlowId("case"), NodeId("prepare"))),
    ]
    verdict = local_steps()[(ExperimentId("judge_check"), FlowId("judge"), NodeId("verdict"))]
    expected = normalized_schema(models.record("JudgeCheckJudgeVerdictIn", verdict.in_))
    assert normalized_schema(generated_annotation(module, "JudgeCheckJudgeVerdictIn")) == expected


def test_alternative_step_models_carry_the_experiment_and_follow_the_local_steps(tmp_path: Path) -> None:
    declared = types()
    plan = plan_types(declared, steps=steps(), local_steps=local_steps(), alternative_steps=alternative_steps())
    target = tmp_path / "types.py"
    source = render_types(declared, steps=steps(), alternative_steps=alternative_steps())
    target.write_text(source, encoding="utf-8")
    module = load_module(target)
    names = [record.name for record in plan.records]

    assert names[names.index("JudgeCheckJudgeVerdictOut") + 1 :] == [
        "JudgeCheckVerdictStrictIn",
        "JudgeCheckVerdictStrictOut",
    ]
    assert [(record.name, record.owner) for record in plan.conflicts][-2:] == [
        ("SupportCasePrepareIn", AlternativeStepShape(ExperimentId("support"), NodeId("case_prepare"))),
        ("SupportCasePrepareOut", AlternativeStepShape(ExperimentId("support"), NodeId("case_prepare"))),
    ]
    strict = alternative_steps()[(ExperimentId("judge_check"), NodeId("verdict_strict"))]
    expected = normalized_schema(build_type_models(declared).record("JudgeCheckVerdictStrictOut", strict.out))
    assert normalized_schema(generated_annotation(module, "JudgeCheckVerdictStrictOut")) == expected


def test_generate_writes_only_when_the_text_changes(tmp_path: Path) -> None:
    root = copy_project(FIXTURE, tmp_path)
    target = root / GENERATED_TYPES
    before = target.stat().st_mtime_ns

    assert generate_types(root).project is not None
    assert target.stat().st_mtime_ns == before

    target.unlink()
    generate_types(root)

    assert target.read_text(encoding="utf-8") == (FIXTURE / GENERATED_TYPES).read_text(encoding="utf-8")
    assert generate_types(tmp_path).project is None
    assert not (tmp_path / GENERATED_TYPES).exists()


PYTEST_INI: Final = '[tool.pytest.ini_options]\naqven_project = "fixture_shop"\n'
CONFTEST_NEEDS_TYPES: Final = (
    'from pathlib import Path\n\nassert (Path(__file__).parent / "fixture_shop/types.py").is_file()\n'
)
PASSING_TEST: Final = "def test_generated() -> None:\n    assert True\n"


def test_pytest_plugin_generates_types_before_conftest_imports(tmp_path: Path) -> None:
    root = copy_project(FIXTURE, tmp_path)
    (root / GENERATED_TYPES).unlink()
    (tmp_path / "pyproject.toml").write_text(PYTEST_INI, encoding="utf-8")
    (tmp_path / "conftest.py").write_text(CONFTEST_NEEDS_TYPES, encoding="utf-8")
    (tmp_path / "test_generated.py").write_text(PASSING_TEST, encoding="utf-8")

    completed = subprocess.run(
        [sys.executable, "-m", "pytest", "-q", "-p", "no:cacheprovider", "test_generated.py"],
        cwd=tmp_path,
        capture_output=True,
        text=True,
        check=False,
        timeout=120,
    )

    assert completed.returncode == 0, completed.stdout
    assert (root / GENERATED_TYPES).read_text(encoding="utf-8") == (FIXTURE / GENERATED_TYPES).read_text(
        encoding="utf-8"
    )


SAMPLES: Final[Mapping[str, JsonValue]] = {
    "Origin": {"kind": "store_front", "page": "главная"},
    "Address": {"line": "Тверская, 1", "title": "Дом"},
    "OrderId": "LUM-20260917",
}


@pytest.mark.parametrize("name", list(SAMPLES))
def test_generated_models_validate_like_registry_models(tmp_path: Path, name: str) -> None:
    declared = types()
    target = tmp_path / "types.py"
    target.write_text(render_types(declared), encoding="utf-8")
    generated = TypeAdapter[object](generated_annotation(load_module(target), name))
    registry = TypeAdapter[object](build_type_models(declared).resolve(TypeId(name)))

    assert generated.dump_python(generated.validate_python(SAMPLES[name]), mode="json") == registry.dump_python(
        registry.validate_python(SAMPLES[name]), mode="json"
    )
