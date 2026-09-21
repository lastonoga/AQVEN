from pathlib import Path
from typing import Final

import pytest

from aqven.check import check_project
from aqven.check.output_modes import JSON_ONLY_INSTRUCTION, KNOWN_MODELS, agent_modes, known_model, model_modes
from aqven.cli import main
from aqven.codegen import generate_types
from aqven.compiler import compile_root
from aqven.diagnostics import DiagnosticCode
from aqven.ir import CompiledLlmNode
from aqven.spec import AgentId, NodeId, OutputModeSetting
from aqven.testing import copy_project

FIXTURE: Final = Path(__file__).parent / "fixtures" / "fixture_shop"
WRITER: Final = "shared/writer.yaml"
CHEAP: Final = "shared/cheap.yaml"
QWEN: Final = "openrouter:qwen/qwen3.8-max-0902"
GPT_OSS: Final = "openrouter:openai/gpt-oss-20b"
LLAMA: Final = "together:meta-llama/Llama-3.3-70B-Instruct-Turbo"


@pytest.fixture
def shop(tmp_path: Path) -> Path:
    root = copy_project(FIXTURE, tmp_path)
    generate_types(root)
    return root


OPENROUTER_PROVIDER: Final = """- id: "openrouter"
  api_key: "ref:env/OPENROUTER_API_KEY"
  data_policy:
    allows_pii: false
    allows_sensitive: false
    retention: "unknown"
"""


def use_qwen(root: Path) -> None:
    replace(root, CHEAP, f'model: "{LLAMA}"', f'model: "{QWEN}"')
    project_file = root / "aqven.yaml"
    project_file.write_text(project_file.read_text(encoding="utf-8") + OPENROUTER_PROVIDER, encoding="utf-8")


def replace(root: Path, relative: str, old: str, new: str) -> None:
    target = root / relative
    source = target.read_text(encoding="utf-8")
    assert source.count(old) == 1, old
    target.write_text(source.replace(old, new), encoding="utf-8")


def test_known_model_table_sends_qwen_through_openrouter_to_prompted_mode() -> None:
    resolution = agent_modes(OutputModeSetting.AUTO, (QWEN,)).resolve()

    assert (resolution.mode, resolution.source, resolution.instruction) == (
        "prompted",
        "known_model",
        JSON_ONLY_INSTRUCTION,
    )
    assert known_model("openrouter:qwen/qwen3-235b-a22b-2507") is KNOWN_MODELS[1]
    assert known_model("together:Qwen/Qwen3-235B") is None


def test_live_evidence_keeps_the_verified_qwen_model_on_the_output_tool() -> None:
    modes = agent_modes(OutputModeSetting.AUTO, ("openrouter:qwen/qwen3-30b-a3b-instruct-2507",))
    resolution = modes.resolve()

    assert (resolution.mode, resolution.source, resolution.instruction) == ("tool", "known_model", None)
    assert resolution.reason.startswith("aqven models check --live on 2026-09-17")
    assert modes.reported(resolution)


def test_auto_follows_the_pydantic_ai_profile_default() -> None:
    modes = model_modes(GPT_OSS)
    resolution = agent_modes(OutputModeSetting.AUTO, (GPT_OSS,)).resolve()

    assert (modes.tool, modes.native, modes.default) == (True, True, "tool")
    assert (resolution.mode, resolution.source, resolution.instruction) == ("tool", "profile", None)
    assert not agent_modes(OutputModeSetting.AUTO, (GPT_OSS,)).reported(resolution)


def test_models_that_disagree_resolve_to_prompted_deterministically() -> None:
    modes = agent_modes(OutputModeSetting.AUTO, (GPT_OSS, QWEN))
    resolution = modes.resolve()

    assert (resolution.mode, resolution.source) == ("prompted", "fallback_models")
    assert f"{GPT_OSS} -> tool" in resolution.reason
    assert resolution.instruction == JSON_ONLY_INSTRUCTION
    assert modes.resolve() == resolution


def test_explicit_mode_is_kept_and_checked_against_every_model() -> None:
    modes = agent_modes(OutputModeSetting.NATIVE, (GPT_OSS, QWEN))

    assert modes.resolve().mode == "native"
    assert modes.resolve().source == "declared"
    assert [model.model for model in modes.unsupported()] == [QWEN]


def test_unknown_provider_profile_falls_back_to_the_default_profile() -> None:
    modes = model_modes("openrouter:no-vendor-prefix")

    assert (modes.tool, modes.native, modes.default) == (True, False, "tool")


def test_check_reports_an_explicit_mode_the_model_cannot_serve(shop: Path) -> None:
    replace(shop, CHEAP, "output:\n  strict: false", "output:\n  strict: false\n  mode: native")

    report = check_project(shop)

    (problem,) = [item for item in report.diagnostics if item.code is DiagnosticCode.E_OUTPUT_MODE_UNSUPPORTED]
    assert (problem.file, problem.path) == (CHEAP, ("output", "mode"))
    assert problem.message == f"output.mode native is not supported by model {LLAMA}"
    assert problem.hint == "set output.mode to one of: tool, prompted"


def test_check_shows_auto_resolution_through_the_known_model_table(shop: Path) -> None:
    use_qwen(shop)

    report = check_project(shop)

    (problem,) = [item for item in report.diagnostics if item.code is DiagnosticCode.W_OUTPUT_MODE_RESOLVED]
    assert problem.file == CHEAP
    assert problem.message.startswith(f"output.mode auto resolves to prompted for model {QWEN} (qwen models")
    assert problem.hint == "set output.mode: prompted to pin it"
    assert report.ok


def test_prompted_mode_does_not_need_strict_schema_support(shop: Path) -> None:
    replace(shop, CHEAP, "output:\n  strict: false", "output:\n  mode: prompted")

    report = check_project(shop)

    assert DiagnosticCode.E_STRICT_UNSUPPORTED not in {item.code for item in report.diagnostics}


def test_text_mode_value_is_reported_as_text_output(shop: Path) -> None:
    replace(shop, WRITER, "settings:", 'output:\n  mode: "text"\nsettings:')

    report = check_project(shop)

    assert DiagnosticCode.E_TEXT_OUTPUT in {item.code for item in report.diagnostics}


def test_compiled_ir_carries_the_resolved_mode_and_its_source(shop: Path) -> None:
    use_qwen(shop)

    project = compile_root(shop)
    cheap = project.agent(AgentId("cheap"))
    writer = project.agent(AgentId("writer"))
    dumped = cheap.model_dump(mode="json")["output"]

    assert (dumped["mode"], dumped["declared_mode"], dumped["mode_source"]) == ("prompted", "auto", "known_model")
    assert dumped["instruction"] == JSON_ONLY_INSTRUCTION
    assert (writer.output.mode, writer.output.mode_source, writer.file) == ("tool", "profile", WRITER)
    flow = next(iter(project.flows.values()))
    classify = flow.node(NodeId("classify"))
    assert isinstance(classify, CompiledLlmNode)
    assert classify.output_mode == "tool"


def test_tree_prints_the_resolved_mode_next_to_each_agent(shop: Path, capsys: pytest.CaptureFixture[str]) -> None:
    use_qwen(shop)

    assert main(["tree", str(shop)]) == 0

    output = capsys.readouterr().out
    assert "cheap   shared/cheap.yaml   output.mode auto -> prompted (known_model)" in output
    assert "writer  shared/writer.yaml  output.mode auto -> tool (profile)" in output
