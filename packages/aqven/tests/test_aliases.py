from collections.abc import Mapping
from pathlib import Path
from typing import Final

import pytest
from pydantic import JsonValue

from aqven.check import CheckReport, check_project
from aqven.diagnostics import DiagnosticCode
from aqven.loader import Alias, YamlPath
from aqven.loader.aliases import AliasScope, resolve_aliases
from aqven.spec import CodeNodeSpec, FlowId, NodeId, SpecKind
from aqven.testing import copy_project

FIXTURE: Final = Path(__file__).parent / "fixtures" / "alias_shop"
CLEAN: Final = "flows/intake/nodes/clean.node.yaml"
CLEAN_CODE: Final = "flows/intake/nodes/clean.py"
FINISH: Final = "flows/intake/nodes/finish.node.yaml"
REPLY: Final = "flows/intake/nodes/reply.inference.yaml"
SEAL: Final = "flows/audit/nodes/seal.node.yaml"
STAMP: Final = "tools/stamp.yaml"
WRITER: Final = "agents/writer.yaml"
CLEAN_FILE: Final = "@root/flows/intake/nodes/clean.py:clean"
CLEAN_PATH: Final = "alias_shop.flows.intake.nodes.clean:clean"
FINISH_PATH: Final = "alias_shop.flows.intake.steps:finish"

WRITTEN: Final[Mapping[str, Mapping[YamlPath, Alias]]] = {
    SEAL: {("run",): Alias("@intake.steps:finish", FINISH_PATH)},
    CLEAN: {("run",): Alias("clean", CLEAN_FILE)},
    FINISH: {("run",): Alias("@flow.steps:finish", FINISH_PATH)},
    REPLY: {("prompt",): Alias("@flow/prompts/reply.md", "@root/flows/intake/prompts/reply.md")},
    STAMP: {("run",): Alias("@root.tools.functions:stamp", "alias_shop.tools.functions:stamp")},
}

CODE_FORMS: Final[Mapping[str, str]] = {
    "clean": CLEAN_FILE,
    CLEAN_FILE: CLEAN_FILE,
    "@here.clean:clean": CLEAN_PATH,
    "@flow.nodes.clean:clean": CLEAN_PATH,
    "@intake.nodes.clean:clean": CLEAN_PATH,
    "@root.flows.intake.nodes.clean:clean": CLEAN_PATH,
    CLEAN_PATH: CLEAN_PATH,
}

FAILURES: Final[Mapping[str, tuple[str, str, str, DiagnosticCode, YamlPath]]] = {
    "unknown_flow_id": (SEAL, "@intake.", "@intak.", DiagnosticCode.E_ALIAS_UNKNOWN, ("run",)),
    "unknown_name": (STAMP, "@root.", "@module.", DiagnosticCode.E_ALIAS_UNKNOWN, ("run",)),
    "flow_path_outside_flow": (WRITER, "@root/", "@flow/", DiagnosticCode.E_ALIAS_UNKNOWN, ("instructions",)),
    "bare_function_missing": (CLEAN, 'run: "clean"', 'run: "scrub"', DiagnosticCode.E_CODE_NOT_FOUND, ("run",)),
    "module_not_importable": (FINISH, "@flow.steps:", "@flow.class:", DiagnosticCode.E_ALIAS_OUTSIDE_PACKAGE, ("run",)),
}

SCOPE: Final = AliasScope("shop", ("flows/intake",))

SITES: Final[Mapping[str, tuple[SpecKind, str, JsonValue, JsonValue]]] = {
    "inference": (
        SpecKind.INFERENCE,
        "flows/intake/nodes/reply.inference.yaml",
        {
            "prompt": "draft",
            "variants": {"tone": {"cases": {"calm": "calm", "loud": "@flow/tones/loud.md"}}},
            "examples": [{"name": "calm", "in": {"prompt": "draft"}, "out": {"run": "clean"}}],
            "checks": [{"run": "@here.checks:short"}, {"run": "short"}, {"use": "not_empty"}],
        },
        {
            "prompt": "@root/flows/intake/nodes/reply.py:draft",
            "variants": {"tone": {"cases": {"calm": "calm", "loud": "@root/flows/intake/tones/loud.md"}}},
            "examples": [{"name": "calm", "in": {"prompt": "draft"}, "out": {"run": "clean"}}],
            "checks": [
                {"run": "shop.flows.intake.nodes.checks:short"},
                {"run": "@root/flows/intake/nodes/reply.py:short"},
                {"use": "not_empty"},
            ],
        },
    ),
    "node": (
        SpecKind.NODE,
        "flows/intake/nodes/polish.node.yaml",
        {
            "join": {"run": "quorum"},
            "on_item_error": {"run": "shop.policies:skip"},
            "stop": [{"use": "threshold"}, {"run": "@flow.policies:enough"}],
            "select": {"run": "@root.policies:best"},
        },
        {
            "join": {"run": "@root/flows/intake/nodes/polish.py:quorum"},
            "on_item_error": {"run": "shop.policies:skip"},
            "stop": [{"use": "threshold"}, {"run": "shop.flows.intake.policies:enough"}],
            "select": {"run": "shop.policies:best"},
        },
    ),
    "variant_default": (
        SpecKind.INFERENCE,
        "flows/intake/nodes/reply.inference.yaml",
        {"variants": {"tone": {"cases": {"calm": "calm"}, "default": "@flow/tones/plain.md"}}},
        {"variants": {"tone": {"cases": {"calm": "calm"}, "default": "@root/flows/intake/tones/plain.md"}}},
    ),
    "tool": (
        SpecKind.TOOL,
        "tools/clip.yaml",
        {"run": "@here.functions:start_clip", "wait": {"poll": "poll_clip"}},
        {"run": "shop.tools.functions:start_clip", "wait": {"poll": "@root/tools/clip.py:poll_clip"}},
    ),
    "eval": (
        SpecKind.EVAL,
        "evals/quality.yaml",
        {"scorers": [{"run": "@intake.evaluators:grounded"}, {"use": "cost_usd"}]},
        {"scorers": [{"run": "shop.flows.intake.evaluators:grounded"}, {"use": "cost_usd"}]},
    ),
    "agent": (
        SpecKind.AGENT,
        "agents/resolver.yaml",
        {"instructions": "../prompts/resolver.md", "tools": ["stamp"]},
        {"instructions": "../prompts/resolver.md", "tools": ["stamp"]},
    ),
}


def replace(root: Path, relative: str, old: str, new: str) -> None:
    target = root / relative
    source = target.read_text(encoding="utf-8")
    assert source.count(old) == 1, old
    target.write_text(source.replace(old, new), encoding="utf-8")


def located(report: CheckReport, code: DiagnosticCode) -> list[tuple[str, YamlPath]]:
    return [(item.file, item.path) for item in report.diagnostics if item.code is code]


@pytest.fixture
def shop(tmp_path: Path) -> Path:
    return copy_project(FIXTURE, tmp_path)


def test_fixture_resolves_every_alias_and_keeps_the_written_form() -> None:
    report = check_project(FIXTURE)

    assert report.diagnostics == ()
    assert report.project is not None
    assert report.project.aliases == WRITTEN


@pytest.mark.parametrize("form", list(CODE_FORMS), ids=list(CODE_FORMS))
def test_bare_name_resolves_to_the_node_file_and_dotted_forms_to_an_import_path(shop: Path, form: str) -> None:
    replace(shop, CLEAN, 'run: "clean"', f'run: "{form}"')

    report = check_project(shop)

    assert report.diagnostics == ()
    assert report.project is not None
    spec = report.project.flows[FlowId("intake")].nodes[NodeId("clean")].spec
    assert isinstance(spec, CodeNodeSpec)
    assert spec.run == CODE_FORMS[form]


def test_node_code_beside_a_package_of_the_same_name_is_loaded_by_file_path(shop: Path) -> None:
    (shop / "flows/intake/nodes/clean").mkdir()
    (shop / "flows/intake/nodes/clean/__init__.py").write_text("", encoding="utf-8")

    assert check_project(shop).diagnostics == ()

    replace(shop, CLEAN, 'run: "clean"', f'run: "{CLEAN_PATH}"')

    assert located(check_project(shop), DiagnosticCode.E_CODE_REF_UNRESOLVED) == [(CLEAN, ("run",))]


@pytest.mark.parametrize("name", list(FAILURES), ids=list(FAILURES))
def test_alias_failure_is_reported_once_at_the_reference(shop: Path, name: str) -> None:
    file, old, new, code, path = FAILURES[name]
    replace(shop, file, old, new)

    report = check_project(shop)

    assert located(report, code) == [(file, path)]
    assert DiagnosticCode.E_CODE_REF_UNRESOLVED not in {item.code for item in report.diagnostics}


def test_bare_name_without_code_file_next_to_the_node(shop: Path) -> None:
    (shop / CLEAN_CODE).unlink()

    assert located(check_project(shop), DiagnosticCode.E_CODE_NOT_FOUND) == [(CLEAN, ("run",))]


def test_folder_outside_the_package_is_not_importable(shop: Path) -> None:
    (shop / "flows/v-2").mkdir()
    (shop / "flows/intake").rename(shop / "flows/v-2/intake")

    report = check_project(shop)

    moved = f"flows/v-2/{FINISH.removeprefix('flows/')}"
    assert located(report, DiagnosticCode.E_ALIAS_OUTSIDE_PACKAGE) == [(file, ("run",)) for file in (SEAL, moved)]
    assert report.project is not None
    assert {item.file for item in report.diagnostics} == {SEAL, moved}


def test_flow_id_equal_to_an_alias_is_reserved(shop: Path) -> None:
    (shop / "flows/audit").rename(shop / "flows/root")

    report = check_project(shop)

    assert located(report, DiagnosticCode.E_ALIAS_RESERVED) == [("flows/root/flow.yaml", ())]
    assert report.errors == tuple(item for item in report.diagnostics if item.code is DiagnosticCode.E_ALIAS_RESERVED)


@pytest.mark.parametrize("kind", list(SITES), ids=list(SITES))
def test_aliases_are_rewritten_only_at_reference_sites(kind: str) -> None:
    spec_kind, file, data, expected = SITES[kind]

    aliased = resolve_aliases(SCOPE, file, spec_kind, data)

    assert (aliased.data, aliased.diagnostics) == (expected, ())
