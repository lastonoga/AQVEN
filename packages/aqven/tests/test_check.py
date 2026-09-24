import json
import subprocess
import sys
from collections.abc import Mapping
from dataclasses import dataclass
from decimal import Decimal
from importlib import resources
from pathlib import Path
from typing import Final

import pytest
from pydantic import JsonValue

from aqven.check import CheckReport, CodeResolver, build_context, check_project
from aqven.check.schemas import accepts, rejection
from aqven.check.scopes import Resolved
from aqven.check.shapes import is_optional
from aqven.cli import COMMANDS, NOT_IMPLEMENTED, main
from aqven.codegen import GENERATED_TYPES, generate_types
from aqven.diagnostics import DiagnosticCode, Severity
from aqven.loader import load_project
from aqven.spec import FlowId, InferenceId, NodeId, SpecKind
from aqven.testing import copy_project

FIXTURE: Final = Path(__file__).parent / "fixtures" / "fixture_shop"
PACKAGE: Final = "fixture_shop"
FLOW: Final = "triage/flow.yaml"
CLASSIFY: Final = "triage/classify.node.yaml"
INFERENCE: Final = "triage/classify.inference.yaml"
PROMPT: Final = "triage/classify.prompt.md"
WRITER: Final = "shared/writer.yaml"
CHEAP: Final = "shared/cheap.yaml"
ROUTE: Final = "triage/route.yaml"
CONFIRM: Final = "triage/confirm.yaml"
SUMMARIZE: Final = "triage/summarize.yaml"
CODE: Final = "triage/code.py"
CLASSIFY_CODE: Final = "triage/classify.py"
TICKET: Final = "triage/types/triage_ticket.yaml"
STEM: Final = "triage/classify"
PARTIAL: Final = f"{STEM}.partials/customer.md"
TONES: Final = f"{STEM}.variants/tone"
PENDING: Final = ("fmt", "plan", "build")


@dataclass(frozen=True, slots=True)
class Mutation:
    file: str
    old: str
    new: str
    expected: DiagnosticCode


MUTATIONS: Final[Mapping[str, Mutation]] = {
    "inference_key_next_to_own_inference": Mutation(
        CLASSIFY, 'agent: "writer"', 'inference: "sort"\nagent: "writer"', DiagnosticCode.E_SOURCE_CONFLICT
    ),
    "agent_unknown": Mutation(CLASSIFY, 'agent: "writer"', 'agent: "author"', DiagnosticCode.E_AGENT_UNKNOWN),
    "input_unbound": Mutation(
        CLASSIFY, 'in:\n- name: "ticket"\n  from: "$input"\n', "", DiagnosticCode.E_INPUT_UNBOUND
    ),
    "input_unknown": Mutation(CLASSIFY, 'name: "ticket"', 'name: "request"', DiagnosticCode.E_INPUT_UNKNOWN),
    "check_params_path": Mutation(INFERENCE, "$out.rationale", "$out.reason", DiagnosticCode.E_CHECK_PARAMS),
    "check_params_shape": Mutation(INFERENCE, "$out.rationale", "$in.ticket", DiagnosticCode.E_CHECK_PARAMS),
    "check_params_model": Mutation(INFERENCE, "    field: ", "    target: ", DiagnosticCode.E_CHECK_PARAMS),
    "example_invalid": Mutation(
        INFERENCE, 'category: "delivery"', 'category: "returns"', DiagnosticCode.E_EXAMPLE_INVALID
    ),
    "text_mode_on_agent": Mutation(
        WRITER, "settings:", 'output:\n  mode: "text"\nsettings:', DiagnosticCode.E_TEXT_OUTPUT
    ),
    "inference_without_out": Mutation(
        INFERENCE,
        'out:\n- name: "rationale"\n  type: "Text"\n  description: "Обоснование выбора"\n  maxLength: 300\n'
        '- name: "category"\n  type: "TriageCategory"\n  description: "Очередь"\n',
        "",
        DiagnosticCode.E_TEXT_OUTPUT,
    ),
    "outcome_fallback_without_fallback_models": Mutation(
        WRITER, "settings:", 'output:\n  on_error: "fallback"\nsettings:', DiagnosticCode.E_OUTCOME_FALLBACK
    ),
    "provider_unknown": Mutation(
        WRITER, 'model: "openai:gpt-5.4-mini"', 'model: "google:gemini-3.8-flash"', DiagnosticCode.E_PROVIDER_UNKNOWN
    ),
    "image_to_text_only_model": Mutation(
        CLASSIFY, 'agent: "writer"', 'agent: "cheap"', DiagnosticCode.E_MODALITY_UNSUPPORTED
    ),
    "pii_to_provider_without_pii": Mutation(
        CLASSIFY, 'agent: "writer"', 'agent: "cheap"', DiagnosticCode.E_PII_PROVIDER
    ),
    "strict_on_model_without_strict": Mutation(
        CHEAP, "strict: false", "strict: true", DiagnosticCode.E_STRICT_UNSUPPORTED
    ),
    "unbounded_output": Mutation(SUMMARIZE, "  maxLength: 200\n", "", DiagnosticCode.E_OUTPUT_UNBOUNDED),
    "unbounded_inference_output": Mutation(INFERENCE, "  maxLength: 300\n", "", DiagnosticCode.E_OUTPUT_UNBOUNDED),
    "registry_drift_from_generated": Mutation(
        TICKET, "  maxLength: 2000\n", "", DiagnosticCode.E_CODE_SIGNATURE_MISMATCH
    ),
    "missing_node": Mutation(SUMMARIZE, "$route.out.category", "$routing.out.category", DiagnosticCode.E_REF_MISSING),
    "missing_field": Mutation(SUMMARIZE, "$route.out.category", "$route.out.queue", DiagnosticCode.E_REF_MISSING),
    "inner_node_from_outside": Mutation(
        SUMMARIZE, "$route.out.category", "$confirm.out.category", DiagnosticCode.E_REF_SCOPE
    ),
    "ref_syntax": Mutation(SUMMARIZE, 'from: "$input"', 'from: "input"', DiagnosticCode.E_REF_SYNTAX),
    "binding_type": Mutation(
        SUMMARIZE, 'from: "$route.out.category"', 'from: "$input.subject"', DiagnosticCode.E_BINDING_TYPE
    ),
    "llm_binding_type": Mutation(CLASSIFY, 'from: "$input"', 'from: "$input.customer"', DiagnosticCode.E_BINDING_TYPE),
    "cycle": Mutation(CLASSIFY, 'from: "$input"', 'from: "$summarize.out.summary"', DiagnosticCode.E_CYCLE),
    "unordered_node": Mutation(FLOW, '- "summarize"\n', "", DiagnosticCode.E_NODE_UNORDERED),
    "switch_not_exhaustive": Mutation(
        ROUTE, '  delivery:\n    node: "confirm"\n', "", DiagnosticCode.E_SWITCH_NOT_EXHAUSTIVE
    ),
    "switch_on_text": Mutation(
        ROUTE, 'on: "$classify.out.category"', 'on: "$classify.out.rationale"', DiagnosticCode.E_SWITCH_ON_TYPE
    ),
    "human_default_invalid": Mutation(
        CONFIRM, 'category: "delivery"', 'category: "returns"', DiagnosticCode.E_HUMAN_DEFAULT_INVALID
    ),
    "human_form_not_record": Mutation(
        CONFIRM, 'form: "TriageReview"', 'form: "TriageCategory"', DiagnosticCode.E_HUMAN_FORM_TYPE
    ),
    "type_unknown": Mutation(INFERENCE, 'type: "TriageTicket"', 'type: "Ticket"', DiagnosticCode.E_TYPE_UNKNOWN),
    "type_ref_syntax": Mutation(
        INFERENCE, 'type: "TriageTicket"', 'type: "TriageTicket?[]"', DiagnosticCode.E_TYPE_REF_SYNTAX
    ),
    "constraint_mismatch": Mutation(
        INFERENCE,
        '  type: "TriageCategory"\n',
        '  type: "TriageCategory"\n  maxLength: 5\n',
        DiagnosticCode.E_TYPE_CONSTRAINT_MISMATCH,
    ),
    "prompt_path_missing": Mutation(
        INFERENCE, "examples:\n", 'prompt: "./prompts/classify.md"\nexamples:\n', DiagnosticCode.E_PROMPT_MISSING
    ),
    "prompt_path_syntax": Mutation(
        INFERENCE, "examples:\n", 'prompt: "Ответь покупателю"\nexamples:\n', DiagnosticCode.E_SPEC_INVALID
    ),
    "variable_undeclared": Mutation(
        PROMPT, "{{ ticket.body }}", "{{ ticket.text }}", DiagnosticCode.E_PROMPT_VARIABLE_UNDECLARED
    ),
    "input_unused": Mutation(
        PROMPT,
        "Тема: {{ ticket.subject }}\nТекст: {{ ticket.body }}\n"
        "{% if ticket.photo %}К обращению приложено фото товара.{% endif %}\n",
        "",
        DiagnosticCode.E_PROMPT_INPUT_UNUSED,
    ),
    "output_format_twice": Mutation(
        PROMPT,
        "{{ output_format }}",
        "{{ output_format }}\n{{ output_format }}",
        DiagnosticCode.E_PROMPT_OUTPUT_FORMAT,
    ),
    "media_rendered": Mutation(
        PROMPT, "фото товара.", "фото {{ ticket.photo }}.", DiagnosticCode.E_PROMPT_MEDIA_RENDERED
    ),
    "unbalanced_message": Mutation(
        PROMPT,
        "{% message user %}",
        "{% if ticket.photo %}{% message user %}{% endif %}",
        DiagnosticCode.E_PROMPT_SYNTAX,
    ),
    "fragment_missing": Mutation(PROMPT, "shared/tone", "shared/voice", DiagnosticCode.E_FRAGMENT_MISSING),
    "tag_forbidden": Mutation(
        PROMPT,
        "{{ output_format }}",
        "{% assign x = 1 %}{{ output_format }}",
        DiagnosticCode.E_PROMPT_TAG_FORBIDDEN,
    ),
    "filter_forbidden": Mutation(
        PROMPT, "{{ ticket.body }}", "{{ ticket.body | upcase }}", DiagnosticCode.E_PROMPT_FILTER_FORBIDDEN
    ),
    "fragment_with_variable": Mutation(
        "shared/tone.md", "по делу.", "по делу, {{ ticket }}.", DiagnosticCode.E_PROMPT_VARIABLE_UNDECLARED
    ),
    "code_unresolved": Mutation(SUMMARIZE, "code:summarize", "code:summary", DiagnosticCode.E_CODE_REF_UNRESOLVED),
    "code_parameter_drift": Mutation(
        CODE,
        "category: TriageCategory) -> TriageSummarizeOut",
        "queue: TriageCategory) -> TriageSummarizeOut",
        DiagnosticCode.E_CODE_SIGNATURE_MISMATCH,
    ),
    "code_return_drift": Mutation(
        CODE,
        "category: TriageCategory) -> TriageSummarizeOut",
        "category: TriageCategory) -> TriageTicket",
        DiagnosticCode.E_CODE_SIGNATURE_MISMATCH,
    ),
    "generated_model_drift": Mutation(
        GENERATED_TYPES,
        "GENERATED_CONFIG\n    summary: Annotated[str, StringConstraints(max_length=200)]\n",
        "GENERATED_CONFIG\n    summary: Annotated[str, StringConstraints(max_length=150)]\n",
        DiagnosticCode.E_CODE_SIGNATURE_MISMATCH,
    ),
    "custom_check_output_drift": Mutation(
        CLASSIFY_CODE,
        "(value: ClassifyOut,",
        "(value: ClassifyIn,",
        DiagnosticCode.E_CODE_SIGNATURE_MISMATCH,
    ),
    "custom_check_context_drift": Mutation(
        CLASSIFY_CODE,
        "context: EvalContext[ClassifyIn, ClassifyOut]",
        "context: EvalContext[ClassifyOut, ClassifyOut]",
        DiagnosticCode.E_CODE_SIGNATURE_MISMATCH,
    ),
    "custom_check_without_params": Mutation(
        CLASSIFY_CODE, ", params: NoParams) -> Verdict", ") -> Verdict", DiagnosticCode.E_CODE_SIGNATURE_MISMATCH
    ),
    "check_unknown_builtin": Mutation(
        INFERENCE, 'use: "not_empty"', 'use: "not_blank"', DiagnosticCode.E_POLICY_UNKNOWN
    ),
    "check_use_and_run": Mutation(
        INFERENCE,
        '- use: "not_empty"\n',
        '- use: "not_empty"\n  run: "fixture_shop.triage.code:summarize"\n',
        DiagnosticCode.E_SPEC_INVALID,
    ),
    "custom_check_unresolved": Mutation(
        INFERENCE,
        "classify:rationale_is_short",
        "classify:rationale_is_long",
        DiagnosticCode.E_CODE_REF_UNRESOLVED,
    ),
    "docstring": Mutation(
        CODE,
        "def summarize(ticket: TriageTicket, category: TriageCategory) -> TriageSummarizeOut:\n",
        'def summarize(ticket: TriageTicket, category: TriageCategory) -> TriageSummarizeOut:\n    """Кратко."""\n',
        DiagnosticCode.E_DOCSTRING,
    ),
    "determinism_is_not_a_key": Mutation(
        SUMMARIZE, "in:\n", 'determinism: "pure"\nin:\n', DiagnosticCode.E_UNKNOWN_KEY
    ),
    "bad_name": Mutation(INFERENCE, 'name: "rationale"', 'name: "Rationale"', DiagnosticCode.E_BAD_NAME),
    "package_mismatch": Mutation(
        "aqven.yaml", 'package: "fixture_shop"', 'package: "shop"', DiagnosticCode.E_PACKAGE_MISMATCH
    ),
    "secret_literal": Mutation(
        "aqven.yaml", "ref:env/OPENAI_API_KEY", "sk-proj-4f9c2a7e1b3d5f6a8c0e2d4b", DiagnosticCode.E_SECRET_LITERAL
    ),
    "secret_ref_syntax": Mutation(
        "aqven.yaml", "ref:env/OPENAI_API_KEY", "ref:env/openai", DiagnosticCode.E_SECRET_REF_SYNTAX
    ),
}


def replace(root: Path, relative: str, old: str, new: str) -> None:
    target = root / relative
    source = target.read_text(encoding="utf-8")
    assert source.count(old) == 1, old
    target.write_text(source.replace(old, new), encoding="utf-8")


def write(root: Path, relative: str, text: str) -> None:
    target = root / relative
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(text, encoding="utf-8")


def append(root: Path, relative: str, text: str) -> None:
    target = root / relative
    target.write_text(target.read_text(encoding="utf-8") + text, encoding="utf-8")


def found(report: CheckReport) -> set[DiagnosticCode]:
    return {item.code for item in report.diagnostics}


def diagnostics_of(report: CheckReport, code: DiagnosticCode) -> list[tuple[str, tuple[str | int, ...]]]:
    return [(item.file, item.path) for item in report.diagnostics if item.code is code]


def order(root: Path, node_id: str) -> None:
    replace(root, FLOW, '- "summarize"\n', f'- "summarize"\n- "{node_id}"\n')


@pytest.fixture
def shop(tmp_path: Path) -> Path:
    return copy_project(FIXTURE, tmp_path)


def test_fixture_project_is_clean() -> None:
    report = check_project(FIXTURE)

    assert report.diagnostics == ()
    assert report.ok
    assert report.project is not None


def test_value_type_hint_requires_dynamic_output(shop: Path) -> None:
    replace(
        shop,
        INFERENCE,
        '  description: "Обоснование выбора"\n  maxLength: 300\n',
        '  description: "Обоснование выбора"\n  maxLength: 300\n  value_type: "TriageTicket"\n',
    )

    assert diagnostics_of(check_project(shop), DiagnosticCode.E_DYNAMIC_VALUE_TYPE) == [
        (INFERENCE, ("out", 0, "value_type"))
    ]


def test_value_type_hint_must_reference_a_registry_type(shop: Path) -> None:
    replace(
        shop,
        INFERENCE,
        '  description: "Обоснование выбора"\n  maxLength: 300\n',
        '  description: "Обоснование выбора"\n  maxLength: 300\n  value_type: "UnknownRecord"\n',
    )

    assert diagnostics_of(check_project(shop), DiagnosticCode.E_TYPE_UNKNOWN) == [(INFERENCE, ("out", 0, "value_type"))]


def test_value_type_hint_requires_record_or_union(shop: Path) -> None:
    replace(
        shop,
        INFERENCE,
        '- name: "rationale"\n  type: "Text"\n  description: "Обоснование выбора"\n  maxLength: 300\n',
        '- name: "rationale"\n  type: "Dynamic"\n  description: "Обоснование выбора"\n'
        '  value_type: "TriageCategory"\n  limits:\n    max_fields: 3\n    max_depth: 1\n'
        "    max_text_length: 300\n    max_items: 3\n",
    )

    assert diagnostics_of(check_project(shop), DiagnosticCode.E_DYNAMIC_VALUE_TYPE) == [
        (INFERENCE, ("out", 0, "value_type"))
    ]


@pytest.mark.parametrize("name", list(MUTATIONS), ids=list(MUTATIONS))
def test_mutation_is_reported(shop: Path, name: str) -> None:
    mutation = MUTATIONS[name]
    replace(shop, mutation.file, mutation.old, mutation.new)

    report = check_project(shop)

    assert mutation.expected in found(report)
    assert not report.ok


def with_research_cap(root: Path, cap: str) -> None:
    project = root / "aqven.yaml"
    project.write_text(f"{project.read_text(encoding='utf-8')}research:\n  spend_cap_usd: {cap}\n", encoding="utf-8")


@pytest.mark.parametrize("cap", ["-0.01", '"lots"', "true", ".nan", ".inf"])
def test_check_rejects_a_research_cap_that_is_not_dollars(shop: Path, cap: str) -> None:
    with_research_cap(shop, cap)

    report = check_project(shop)

    assert diagnostics_of(report, DiagnosticCode.E_SPEC_INVALID) == [("aqven.yaml", ("research", "spend_cap_usd"))]
    assert not report.ok


def test_check_accepts_a_research_cap_in_dollars(shop: Path) -> None:
    with_research_cap(shop, "2.50")

    report = check_project(shop)

    assert report.ok
    assert report.project is not None
    research = report.project.project.spec.research
    assert research is not None and research.spend_cap_usd == Decimal("2.50")


def test_outcome_fallback_points_at_the_policy_without_fallback_models(shop: Path) -> None:
    replace(shop, WRITER, "settings:", 'output:\n  on_refusal: "fallback"\n  on_truncated: "retry"\nsettings:')

    report = check_project(shop)

    rejected = [item for item in report.diagnostics if item.code is DiagnosticCode.E_OUTCOME_FALLBACK]
    assert [(item.file, item.path) for item in rejected] == [(WRITER, ("output", "on_refusal"))]
    assert rejected[0].hint == "add fallback_models to the agent or set output.on_refusal: retry or fail"


def test_outcome_fallback_with_fallback_models_is_clean(shop: Path) -> None:
    fallback = 'fallback_models:\n- "openai:gpt-5.4-mini"\noutput:\n  on_error: "fallback"\nsettings:'
    replace(shop, WRITER, "settings:", fallback)

    assert check_project(shop).diagnostics == ()


def test_agent_reference_is_required_on_llm_node(shop: Path) -> None:
    replace(shop, CLASSIFY, 'agent: "writer"\n', "")

    report = check_project(shop)

    assert diagnostics_of(report, DiagnosticCode.E_SPEC_INVALID) == [(CLASSIFY, ("agent",))]


def test_model_keys_on_llm_node_are_unknown(shop: Path) -> None:
    replace(shop, CLASSIFY, 'agent: "writer"\n', 'agent: "writer"\nmodel_role: "writer"\nprompt: "./classify.md"\n')

    report = check_project(shop)

    assert {item.path for item in report.diagnostics if item.code is DiagnosticCode.E_UNKNOWN_KEY} == {
        ("model_role",),
        ("prompt",),
    }


def test_llm_node_without_own_or_shared_inference_is_reported(shop: Path) -> None:
    (shop / INFERENCE).unlink()
    (shop / PROMPT).unlink()

    assert diagnostics_of(check_project(shop), DiagnosticCode.E_INFERENCE_UNKNOWN) == [(CLASSIFY, ())]


def test_llm_node_names_a_shared_inference_by_key(shop: Path) -> None:
    node = (
        (shop / CLASSIFY)
        .read_text(encoding="utf-8")
        .replace('agent: "writer"', 'inference: "classify"\nagent: "writer"')
    )
    write(shop, "shared/classify.inference.yaml", (shop / INFERENCE).read_text(encoding="utf-8"))
    write(shop, "shared/classify.prompt.md", (shop / PROMPT).read_text(encoding="utf-8"))
    write(shop, "triage/classify.yaml", node)
    for name in (INFERENCE, PROMPT, CLASSIFY):
        (shop / name).unlink()
    assert check_project(shop).diagnostics == ()

    replace(shop, "triage/classify.yaml", 'inference: "classify"', 'inference: "sort"')

    assert diagnostics_of(check_project(shop), DiagnosticCode.E_INFERENCE_UNKNOWN) == [
        ("triage/classify.yaml", ("inference",))
    ]


@pytest.mark.parametrize("include", ["../shared/tone", "shared/tone.md"], ids=["relative", "module_root"])
def test_fragment_is_included_relative_to_prompt_or_module_root(shop: Path, include: str) -> None:
    replace(shop, PROMPT, '{% include "shared/tone" %}', f'{{% include "{include}" %}}')

    assert check_project(shop).diagnostics == ()


def test_text_mode_on_inference_is_rejected(shop: Path) -> None:
    replace(shop, INFERENCE, "examples:\n", 'output_type: "text"\nexamples:\n')
    generate_types(shop)

    (problem,) = check_project(shop).diagnostics

    assert (problem.code, problem.file, problem.path) == (DiagnosticCode.E_TEXT_OUTPUT, INFERENCE, ("output_type",))
    assert "there is no text mode" in problem.message


def test_yaml_diagnostics_carry_line_and_column(shop: Path) -> None:
    replace(shop, SUMMARIZE, "$route.out.category", "$routing.out.category")

    (problem,) = [item for item in check_project(shop).diagnostics if item.code is DiagnosticCode.E_REF_MISSING]

    assert (problem.file, problem.path, problem.line, problem.column) == (SUMMARIZE, ("in", 1, "from"), 14, 3)
    assert problem.severity is Severity.ERROR


def test_nested_message_is_reported_when_template_parses(shop: Path) -> None:
    replace(
        shop,
        PROMPT,
        "{% message user %}",
        "{% message user %}{% if ticket.photo %}{% message assistant %}Фото{% endmessage %}{% endif %}",
    )

    assert DiagnosticCode.E_PROMPT_MESSAGE_NESTED in found(check_project(shop))


PARTIAL_INCLUDE: Final = '{% include "classify.partials/customer" %}'


def test_partial_reads_inputs_and_is_checked(shop: Path) -> None:
    write(shop, PARTIAL, "Покупатель: {{ ticket.customer.name }}\n")
    replace(shop, PROMPT, "Тема:", f"{PARTIAL_INCLUDE}\nТема:")
    assert check_project(shop).diagnostics == ()

    replace(shop, PARTIAL, "customer.name", "customer.phone")

    report = check_project(shop)

    assert diagnostics_of(report, DiagnosticCode.E_PROMPT_VARIABLE_UNDECLARED) == [(PARTIAL, ())]


HINT_INPUT: Final = """- name: "hint"
  type: "TriageCategory?"
  description: "Подсказка очереди от витрины"
out:
"""

TONE_SLOT: Final = """variants:
  tone:
    on: "hint"
    cases:
      billing: "money"
      delivery: "parcel"
    default: "neutral"
examples:
"""

TONE_FILES: Final[Mapping[str, str]] = {
    "money": "Пиши про оплату точно, без обещаний возврата.\n",
    "parcel": "Пиши про доставку, называя тему {{ ticket.subject }}.\n",
    "neutral": "Пиши нейтрально.\n",
}


def with_variants(root: Path) -> None:
    replace(root, INFERENCE, "\nout:\n", f"\n{HINT_INPUT}")
    replace(root, INFERENCE, '- run: "fixture_shop.triage.classify:rationale_is_short"\n  on_fail: "flag"\n', "")
    replace(root, INFERENCE, "examples:\n", TONE_SLOT)
    replace(root, INFERENCE, "      photo: null\n  out:", "      photo: null\n    hint: null\n  out:")
    replace(root, PROMPT, "{{ output_format }}", "{{ variants.tone }}\n{{ output_format }}")
    for name, text in TONE_FILES.items():
        write(root, f"{TONES}/{name}.md", text)
    generate_types(root)


def test_variant_slot_is_clean(shop: Path) -> None:
    with_variants(shop)

    report = check_project(shop)

    assert report.diagnostics == ()
    assert report.project is not None
    assert set(report.project.inferences[InferenceId("classify")].texts) == {
        "prompt",
        "variants/tone/money",
        "variants/tone/parcel",
        "variants/tone/neutral",
    }


VARIANT_PATH: Final = ("variants", "tone")


@pytest.mark.parametrize(
    ("file", "old", "new", "expected", "location"),
    [
        (
            INFERENCE,
            'default: "neutral"',
            'default: "calm"',
            DiagnosticCode.E_VARIANT_MISSING,
            (INFERENCE, (*VARIANT_PATH, "default")),
        ),
        (INFERENCE, '    default: "neutral"\n', "", DiagnosticCode.E_VARIANT_NOT_EXHAUSTIVE, (INFERENCE, VARIANT_PATH)),
        (
            INFERENCE,
            'billing: "money"',
            'returns: "money"',
            DiagnosticCode.E_VARIANT_NOT_EXHAUSTIVE,
            (INFERENCE, (*VARIANT_PATH, "cases", "returns")),
        ),
        (INFERENCE, 'on: "hint"', 'on: "mood"', DiagnosticCode.E_REF_MISSING, (INFERENCE, (*VARIANT_PATH, "on"))),
        (INFERENCE, 'on: "hint"', 'on: "ticket"', DiagnosticCode.E_SWITCH_ON_TYPE, (INFERENCE, (*VARIANT_PATH, "on"))),
        (
            INFERENCE,
            'on: "hint"',
            'on: "$out.category"',
            DiagnosticCode.E_REF_SCOPE,
            (INFERENCE, (*VARIANT_PATH, "on")),
        ),
        (PROMPT, "{{ variants.tone }}\n", "", DiagnosticCode.E_PROMPT_INPUT_UNUSED, (PROMPT, ())),
        (
            PROMPT,
            "{{ variants.tone }}",
            "{{ variants.voice }}",
            DiagnosticCode.E_PROMPT_VARIABLE_UNDECLARED,
            (PROMPT, ()),
        ),
        (
            f"{TONES}/parcel.md",
            "{{ ticket.subject }}",
            "{{ variants.tone }}",
            DiagnosticCode.E_PROMPT_VARIABLE_UNDECLARED,
            (f"{TONES}/parcel.md", ()),
        ),
    ],
    ids=[
        "default_file_missing",
        "optional_enum_without_default",
        "case_outside_enum",
        "on_unknown_input",
        "on_record",
        "on_output",
        "slot_not_rendered",
        "slot_undeclared",
        "variant_reads_variants",
    ],
)
def test_variant_problem_is_reported(
    shop: Path, file: str, old: str, new: str, expected: DiagnosticCode, location: tuple[str, tuple[str | int, ...]]
) -> None:
    with_variants(shop)
    replace(shop, file, old, new)

    assert location in diagnostics_of(check_project(shop), expected)


def test_unreferenced_variant_file_is_orphan(shop: Path) -> None:
    with_variants(shop)
    write(shop, f"{TONES}/cheerful.md", "Пиши бодро.\n")

    report = check_project(shop)

    assert diagnostics_of(report, DiagnosticCode.E_ORPHAN_FILE) == [(f"{TONES}/cheerful.md", ())]


@pytest.mark.parametrize(
    "reference", ["../shared/neutral_tone.md", "shared/neutral_tone.md"], ids=["relative", "module_root"]
)
def test_variant_is_an_explicit_markdown_path(shop: Path, reference: str) -> None:
    with_variants(shop)
    (shop / TONES / "neutral.md").unlink()
    write(shop, "shared/neutral_tone.md", TONE_FILES["neutral"])
    replace(shop, INFERENCE, 'default: "neutral"', f'default: "{reference}"')

    assert check_project(shop).diagnostics == ()

    (shop / "shared/neutral_tone.md").unlink()

    assert diagnostics_of(check_project(shop), DiagnosticCode.E_VARIANT_MISSING) == [
        (INFERENCE, (*VARIANT_PATH, "default"))
    ]


def test_variants_need_prompt_file(shop: Path) -> None:
    with_variants(shop)
    (shop / PROMPT).unlink()
    replace(shop, INFERENCE, "variants:\n", 'prompt: "fixture_shop.triage.code:summarize"\nvariants:\n')

    assert (INFERENCE, ("variants",)) in diagnostics_of(check_project(shop), DiagnosticCode.E_SPEC_INVALID)


def test_unreachable_file_with_the_inference_prefix_is_orphan(shop: Path) -> None:
    write(shop, f"{STEM}.partials/unused.md", "Никем не включённая часть.\n")
    write(shop, "triage/notes.md", "Заметка рядом, но без префикса инференса.\n")

    report = check_project(shop)

    assert diagnostics_of(report, DiagnosticCode.E_ORPHAN_FILE) == [(f"{STEM}.partials/unused.md", ())]


def test_inference_without_prompt_file_or_code_prompt(shop: Path) -> None:
    (shop / PROMPT).unlink()

    assert diagnostics_of(check_project(shop), DiagnosticCode.E_PROMPT_MISSING) == [(INFERENCE, ())]


def test_code_prompt_leaves_partials_orphan(shop: Path) -> None:
    write(shop, PARTIAL, "Покупатель.\n")
    (shop / PROMPT).unlink()
    replace(shop, INFERENCE, "examples:\n", 'prompt: "fixture_shop.triage.code:classify_prompt"\nexamples:\n')

    report = check_project(shop)

    assert diagnostics_of(report, DiagnosticCode.E_ORPHAN_FILE) == [(PARTIAL, ())]
    assert (INFERENCE, ("prompt",)) in diagnostics_of(report, DiagnosticCode.E_CODE_REF_UNRESOLVED)


def test_prompt_of_invalid_inference_file_is_not_orphan(shop: Path) -> None:
    replace(shop, INFERENCE, "examples:\n", "surprise: true\nexamples:\n")

    report = check_project(shop)

    assert DiagnosticCode.E_UNKNOWN_KEY in found(report)
    assert diagnostics_of(report, DiagnosticCode.E_ORPHAN_FILE) == []
    assert DiagnosticCode.E_INFERENCE_UNKNOWN not in found(report)


PROMPT_ELSEWHERE: Final = "triage/prompts/classify.md"


@pytest.mark.parametrize(
    "reference", ["./prompts/classify.md", "triage/prompts/classify.md"], ids=["relative", "module_root"]
)
def test_explicit_prompt_path_overrides_the_convention(shop: Path, reference: str) -> None:
    write(shop, PROMPT_ELSEWHERE, (shop / PROMPT).read_text(encoding="utf-8"))
    (shop / PROMPT).unlink()
    replace(shop, INFERENCE, "examples:\n", f'prompt: "{reference}"\nexamples:\n')

    assert check_project(shop).diagnostics == ()

    replace(shop, PROMPT_ELSEWHERE, "{{ ticket.body }}", "{{ ticket.text }}")

    assert diagnostics_of(check_project(shop), DiagnosticCode.E_PROMPT_VARIABLE_UNDECLARED) == [(PROMPT_ELSEWHERE, ())]


@pytest.mark.parametrize(
    "prompt",
    ['"./prompts/classify.md"', '"fixture_shop.triage.code:classify_prompt"'],
    ids=["path", "code"],
)
def test_explicit_prompt_next_to_prompt_file_is_a_warning(shop: Path, prompt: str) -> None:
    write(shop, PROMPT_ELSEWHERE, (shop / PROMPT).read_text(encoding="utf-8"))
    replace(shop, INFERENCE, "examples:\n", f"prompt: {prompt}\nexamples:\n")

    report = check_project(shop)

    assert diagnostics_of(report, DiagnosticCode.W_PROMPT_SHADOWED) == [(INFERENCE, ("prompt",))]
    assert diagnostics_of(report, DiagnosticCode.E_ORPHAN_FILE) == []


def test_explicit_path_to_the_adjacent_prompt_is_not_shadowing(shop: Path) -> None:
    replace(shop, INFERENCE, "examples:\n", 'prompt: "./classify.prompt.md"\nexamples:\n')

    assert check_project(shop).diagnostics == ()


LOOP_NODE: Final = """apiVersion: "aqven/v1"
kind: "Node"
node: "loop"
description: "Повтор краткого содержания"
body:
- "draft"
init:
  draft:
  - name: "category"
    value: "delivery"
max_iter: 2
stop:
- run: "fixture_shop.triage.code:summary_written"
  with:
    path: "$iter.draft.out.summary"
select:
  use: "last"
out:
- name: "summary"
  type: "Text"
  description: "Итог"
  maxLength: 200
  from: "$iter.draft.out.summary"
"""

LOOP_BODY: Final = """apiVersion: "aqven/v1"
kind: "Node"
node: "code"
description: "Черновик краткого содержания"
run: "fixture_shop.triage.code:summarize"
in:
- name: "ticket"
  type: "TriageTicket"
  description: "Обращение"
  from: "$input"
- name: "category"
  type: "TriageCategory"
  description: "Очередь"
  value: "billing"
out:
- name: "summary"
  type: "Text"
  description: "Краткое содержание"
  maxLength: 200
"""
LOOP_FILE: Final = "triage/polish.yaml"


def with_loop(root: Path, loop: str = LOOP_NODE) -> None:
    write(root, LOOP_FILE, loop)
    write(root, "triage/polish/draft.yaml", LOOP_BODY)
    order(root, "polish")
    generate_types(root)


def test_loop_with_policies_is_clean(shop: Path) -> None:
    with_loop(shop)

    report = check_project(shop)

    assert report.diagnostics == ()
    assert report.project is not None
    assert NodeId("polish__draft") in report.project.flows[FlowId("triage")].nodes


def test_loop_state_is_optional_in_body_and_present_in_policies(shop: Path) -> None:
    with_loop(shop)
    loaded = load_project(shop).project
    assert loaded is not None
    code = CodeResolver(shop)

    with code.session():
        context = build_context(loaded, code)
        owner = FlowId("triage")
        draft = context.graph.entry(owner, "polish__draft")
        polish = context.graph.entry(owner, "polish")
        assert draft is not None
        assert polish is not None
        previous = context.refs.resolve(context.graph.scope_of(draft), "$acc.draft.out.summary")
        current = context.refs.resolve(context.graph.own_scope(polish), "$iter.draft.out.summary")

    assert isinstance(previous, Resolved)
    assert isinstance(current, Resolved)
    assert is_optional(previous.annotation)
    assert not is_optional(current.annotation)


STOP_RUN: Final = '- run: "fixture_shop.triage.code:summary_written"\n  with:\n    path: "$iter.draft.out.summary"'


@pytest.mark.parametrize(
    ("old", "new", "expected", "path"),
    [
        ('- name: "category"', '- name: "queue"', DiagnosticCode.E_INPUT_UNKNOWN, ("init", "draft", 0, "name")),
        ("init:\n  draft:", "init:\n  critic:", DiagnosticCode.E_REF_MISSING, ("init", "critic")),
        ('value: "delivery"', 'value: "returns"', DiagnosticCode.E_BINDING_TYPE, ("init", "draft", 0, "value")),
        ('use: "last"', 'use: "median"', DiagnosticCode.E_POLICY_UNKNOWN, ("select", "use")),
        ('use: "last"', 'use: "best"', DiagnosticCode.E_POLICY_PARAMS, ("select", "with")),
        ("code:summary_written", "code:summarize", DiagnosticCode.E_CODE_SIGNATURE_MISMATCH, ("stop", 0, "run")),
        (
            'path: "$iter.draft.out.summary"\n',
            'path: "$iter.draft.out.digest"\n',
            DiagnosticCode.E_POLICY_PARAMS,
            ("stop", 0, "with"),
        ),
        (
            STOP_RUN,
            STOP_RUN.replace('run: "fixture_shop.triage.code:summary_written"', 'use: "threshold"') + "\n    gte: 0.5",
            DiagnosticCode.E_POLICY_PARAMS,
            ("stop", 0, "with"),
        ),
        ("max_iter: 2\n", "", DiagnosticCode.E_SPEC_INVALID, ("max_iter",)),
        (
            '  use: "last"\n',
            '  use: "last"\n  run: "fixture_shop.triage.code:summary_written"\n',
            DiagnosticCode.E_SPEC_INVALID,
            ("select",),
        ),
    ],
    ids=[
        "init_input_unknown",
        "init_node_outside_body",
        "init_literal_type",
        "select_unknown",
        "best_without_path",
        "stop_signature",
        "stop_path_missing",
        "threshold_on_text",
        "without_max_iter",
        "use_and_run",
    ],
)
def test_loop_problem_is_reported(
    shop: Path, old: str, new: str, expected: DiagnosticCode, path: tuple[str | int, ...]
) -> None:
    assert LOOP_NODE.count(old) == 1, old
    with_loop(shop, LOOP_NODE.replace(old, new))

    assert (LOOP_FILE, path) in diagnostics_of(check_project(shop), expected)


PARALLEL_NODE: Final = """apiVersion: "aqven/v1"
kind: "Node"
node: "parallel"
description: "Два черновика краткого содержания"
body:
  billing: "billing"
  delivery: "delivery"
join:
  run: "fixture_shop.triage.code:first_summary"
out:
- name: "summaries"
  type: "Text[]"
  description: "Краткие содержания"
  maxItems: 2
  maxLength: 200
  from: "$ok[*].summary"
- name: "billing"
  type: "Text?"
  description: "Черновик очереди оплаты"
  maxLength: 200
  from: "$branch.billing.summary"
"""
PARALLEL_FILE: Final = "triage/drafts.yaml"
CUSTOM_JOIN: Final = 'join:\n  run: "fixture_shop.triage.code:first_summary"\n'


def with_parallel(root: Path, node: str = PARALLEL_NODE) -> None:
    write(root, PARALLEL_FILE, node)
    write(root, "triage/drafts/billing.yaml", LOOP_BODY)
    write(root, "triage/drafts/delivery.yaml", LOOP_BODY.replace('value: "billing"', 'value: "delivery"'))
    order(root, "drafts")
    generate_types(root)


def test_parallel_with_custom_join_is_clean(shop: Path) -> None:
    with_parallel(shop)

    assert check_project(shop).diagnostics == ()


@pytest.mark.parametrize(
    ("join", "optional", "expected"),
    [
        ('join:\n  use: "all"\n', False, set[DiagnosticCode]()),
        ('join:\n  use: "quorum"\n  with:\n    min_ok: 1\n', False, {DiagnosticCode.E_BINDING_TYPE}),
        ('join:\n  use: "quorum"\n  with:\n    min_ok: 1\n', True, set[DiagnosticCode]()),
    ],
    ids=["all", "quorum_into_required", "quorum_into_optional"],
)
def test_branch_is_optional_unless_join_waits_for_all(
    shop: Path, join: str, optional: bool, expected: set[DiagnosticCode]
) -> None:
    node = PARALLEL_NODE.replace(CUSTOM_JOIN, join)
    with_parallel(shop, node if optional else node.replace('type: "Text?"', 'type: "Text"'))

    assert found(check_project(shop)) == expected


@pytest.mark.parametrize(
    ("file", "old", "new", "expected", "path"),
    [
        (
            CODE,
            "state: JoinState[TriageSummarizeOut]",
            "state: JoinState[ClassifyOut]",
            DiagnosticCode.E_CODE_SIGNATURE_MISMATCH,
            ("join", "run"),
        ),
        (
            PARALLEL_FILE,
            CUSTOM_JOIN,
            'join:\n  use: "quorum"\n  with:\n    min_ok: 3\n',
            DiagnosticCode.E_POLICY_PARAMS,
            ("join", "with"),
        ),
        (
            PARALLEL_FILE,
            CUSTOM_JOIN,
            'join:\n  use: "quorum"\n  with:\n    min_ok: 1\n    on_error: "retry"\n',
            DiagnosticCode.E_POLICY_PARAMS,
            ("join", "with"),
        ),
        (
            PARALLEL_FILE,
            CUSTOM_JOIN,
            'join:\n  use: "all"\n  with:\n    min_ok: 1\n',
            DiagnosticCode.E_POLICY_PARAMS,
            ("join", "with"),
        ),
        (PARALLEL_FILE, CUSTOM_JOIN, 'join: "quorum"\n', DiagnosticCode.E_SPEC_INVALID, ("join",)),
    ],
    ids=["custom_join_type", "quorum_above_branches", "quorum_unknown_error_policy", "params_for_all", "string_join"],
)
def test_parallel_problem_is_reported(
    shop: Path, file: str, old: str, new: str, expected: DiagnosticCode, path: tuple[str | int, ...]
) -> None:
    with_parallel(shop)
    replace(shop, file, old, new)

    assert (PARALLEL_FILE, path) in diagnostics_of(check_project(shop), expected)


def test_node_without_container_reference_is_top_level(shop: Path) -> None:
    write(shop, "triage/route/extra.yaml", (shop / CONFIRM).read_text(encoding="utf-8"))

    assert diagnostics_of(check_project(shop), DiagnosticCode.E_NODE_UNORDERED) == [("triage/route/extra.yaml", ())]


def test_inner_node_is_found_by_reference_anywhere_under_the_flow(shop: Path) -> None:
    write(shop, "triage/operators/confirm.yaml", (shop / CONFIRM).read_text(encoding="utf-8"))
    (shop / CONFIRM).unlink()

    report = check_project(shop)

    assert report.diagnostics == ()
    assert report.project is not None
    assert NodeId("route__confirm") in report.project.flows[FlowId("triage")].nodes


def test_builder_flow_failures_are_reported(shop: Path) -> None:
    write(shop, "built/flow.py", "def build() -> object:\n    raise RuntimeError('broken')\n")

    (problem,) = check_project(shop).diagnostics

    assert (problem.code, problem.file) == (DiagnosticCode.E_BUILDER_FAILED, "built/flow.py")


QUICK_INFERENCE: Final = """from aqven.spec import In, Inference, InferenceSpec, Out, inference_spec
from fixture_shop.triage.code import TriageCategory, TriageTicket


class Quick(Inference):
    ticket: TriageTicket = In(description="Обращение")
    rationale: str = Out(description="Обоснование выбора", max_length=300)
    category: TriageCategory = Out(description="Очередь")


def build() -> InferenceSpec:
    return inference_spec(Quick, description="Быстрая сортировка")
"""

QUICK_FLOW: Final = """from aqven.spec import Flow, flow, llm
from fixture_shop.triage.code import TriageTicket
from pydantic import BaseModel, ConfigDict

from fixture_shop.triage.code import TriageCategory


class TriageReview(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True, revalidate_instances="always")
    category: TriageCategory


def build() -> Flow:
    quick = llm("quick", inference="quick", agent="writer", bind={"ticket": "$input"}, description="Выбор очереди")
    return flow(
        description="Быстрая сортировка",
        input=TriageTicket,
        output=TriageReview,
        returns={"category": "$quick.out.category"},
        nodes=[quick],
    )
"""


def test_python_builders_materialize_inference_and_flow(shop: Path) -> None:
    write(shop, "shared/quick.inference.py", QUICK_INFERENCE)
    write(shop, "shared/quick.prompt.md", "Выбери очередь обращения.\n")
    write(shop, "quick/flow.py", QUICK_FLOW)

    report = check_project(shop)

    assert report.diagnostics == ()
    assert report.project is not None
    assert report.project.inferences[InferenceId("quick")].source is not None


def test_check_restores_imports_and_search_path(shop: Path) -> None:
    before_path = list(sys.path)
    replace(
        shop, CODE, "category: TriageCategory) -> TriageSummarizeOut", "queue: TriageCategory) -> TriageSummarizeOut"
    )

    check_project(shop)
    clean = check_project(FIXTURE)

    assert clean.diagnostics == ()
    assert sys.path == before_path
    assert not any(name == PACKAGE or name.startswith(f"{PACKAGE}.") for name in sys.modules)


RECORD_TOOL: Final = """apiVersion: "aqven/v1"
kind: "Tool"
description: "Запись очереди обращения в хелпдеск"
run: "fixture_shop.triage.helpdesk:record_category"
effect: "write"
idempotency_key:
- "subject"
secrets:
- name: "helpdesk_token"
  ref: "ref:env/HELPDESK_TOKEN"
in:
- name: "subject"
  type: "Text"
  description: "Тема обращения"
  maxLength: 200
- name: "category"
  type: "TriageCategory"
  description: "Очередь"
out:
- name: "receipt"
  type: "Text"
  description: "Квитанция хелпдеска"
  maxLength: 64
"""

RECORD_NODE: Final = """apiVersion: "aqven/v1"
kind: "Node"
node: "tool"
description: "Запись очереди в хелпдеск"
tool: "record_category"
in:
- name: "subject"
  from: "$input.subject"
- name: "category"
  from: "$route.out.category"
"""

HELPDESK: Final = """apiVersion: "aqven/v1"
kind: "McpServer"
description: "Хелпдеск магазина"
transport: "streamable_http"
url: "https://helpdesk.shop.example/mcp"
headers:
- name: "Authorization"
  value: "ref:env/HELPDESK_TOKEN"
"""

FIND_TICKETS: Final = """apiVersion: "aqven/v1"
kind: "Tool"
description: "Поиск прошлых обращений"
mcp:
  server: "helpdesk"
  tool: "search_tickets"
effect: "read"
"""

RESEARCHER: Final = """apiVersion: "aqven/v1"
kind: "Agent"
description: "Исследует историю обращений"
model: "openai:gpt-5.4-mini"
mcp_servers:
- "helpdesk"
"""

AGENT_TOOLS: Final = """tools:
- "record_category"
- "find_tickets"
subagents:
- name: "research"
  description: "Исследует историю обращений"
  agent: "researcher"
  inference: "classify"
approval:
  tools:
  - "record_category"
  assignee: "support_lead"
  timeout_seconds: 3600
  on_timeout:
    policy: "fail"
limits:
  tool_calls: 4
instructions: "./writer.md"
"""

HELPDESK_CODE: Final = """from typing import Annotated

from pydantic import StringConstraints

from aqven.runtime import ToolContext
from fixture_shop.types import RecordCategoryOut, TriageCategory


async def record_category(
    ctx: ToolContext, subject: Annotated[str, StringConstraints(max_length=200)], category: TriageCategory
) -> RecordCategoryOut:
    return RecordCategoryOut(receipt=f"{ctx.run_id}:{category}:{subject}"[:64])
"""

RECORD_FILE: Final = "triage/record_category.yaml"
RECORD_NODE_FILE: Final = "triage/record.yaml"
HELPDESK_FILE: Final = "triage/helpdesk.py"


def with_registry(root: Path) -> None:
    write(root, RECORD_FILE, RECORD_TOOL)
    write(root, HELPDESK_FILE, HELPDESK_CODE)
    write(root, RECORD_NODE_FILE, RECORD_NODE)
    write(root, "shared/helpdesk.yaml", HELPDESK)
    write(root, "shared/find_tickets.yaml", FIND_TICKETS)
    write(root, "shared/researcher.yaml", RESEARCHER)
    write(root, "shared/writer.md", "Сначала проверь заказ, потом отвечай.\n")
    append(root, WRITER, AGENT_TOOLS)
    order(root, "record")
    generate_types(root)


def test_registry_with_tools_mcp_subagent_and_approval_is_clean(shop: Path) -> None:
    with_registry(shop)

    assert check_project(shop).diagnostics == ()


@pytest.mark.parametrize(
    "reference", ["./writer.instructions.md", "shared/writer.instructions.md"], ids=["relative", "module_root"]
)
def test_agent_instructions_path_is_relative_to_agent_or_module_root(shop: Path, reference: str) -> None:
    with_registry(shop)
    (shop / "shared/writer.md").rename(shop / "shared/writer.instructions.md")
    replace(shop, WRITER, "./writer.md", reference)

    assert check_project(shop).diagnostics == ()


@pytest.mark.parametrize(
    ("file", "old", "new", "expected"),
    [
        (WRITER, '  - "record_category"\n  assignee', '  - "refund_order"\n  assignee', DiagnosticCode.E_APPROVAL_TOOL),
        (WRITER, 'agent: "researcher"', 'agent: "writer"', DiagnosticCode.E_AGENT_RECURSION),
        (WRITER, 'inference: "classify"', 'inference: "research"', DiagnosticCode.E_INFERENCE_UNKNOWN),
        (
            WRITER,
            '    policy: "fail"',
            '    policy: "default"\n    value: true',
            DiagnosticCode.E_HUMAN_DEFAULT_INVALID,
        ),
        (WRITER, '- "find_tickets"', '- "find_orders"', DiagnosticCode.E_TOOL_UNKNOWN),
        (WRITER, "./writer.md", "./notes.md", DiagnosticCode.E_PROMPT_MISSING),
        (WRITER, "./writer.md", "./writer.txt", DiagnosticCode.E_SPEC_INVALID),
        ("shared/writer.md", "потом отвечай", "потом {{ ticket }}", DiagnosticCode.E_PROMPT_VARIABLE_UNDECLARED),
        ("shared/researcher.yaml", '- "helpdesk"', '- "crm"', DiagnosticCode.E_MCP_SERVER_UNKNOWN),
        ("shared/find_tickets.yaml", 'server: "helpdesk"', 'server: "crm"', DiagnosticCode.E_MCP_SERVER_UNKNOWN),
        (RECORD_FILE, 'idempotency_key:\n- "subject"\n', "", DiagnosticCode.E_TOOL_IDEMPOTENCY),
        (RECORD_FILE, '- "subject"\nsecrets', '- "receipt"\nsecrets', DiagnosticCode.E_TOOL_IDEMPOTENCY),
        (RECORD_FILE, 'effect: "write"', 'effect: "write"\nttl_ms: 1000', DiagnosticCode.E_UNKNOWN_KEY),
        (RECORD_FILE, "ref:env/HELPDESK_TOKEN", "ghp_4f9c2a7e1b3d5f6a8c0e2d4b6a8c", DiagnosticCode.E_SECRET_LITERAL),
        (
            HELPDESK_FILE,
            ") -> RecordCategoryOut:",
            ") -> TriageCategory:",
            DiagnosticCode.E_CODE_SIGNATURE_MISMATCH,
        ),
        (
            RECORD_NODE_FILE,
            'tool: "record_category"',
            'tool: "record_queue"',
            DiagnosticCode.E_TOOL_UNKNOWN,
        ),
        (
            RECORD_NODE_FILE,
            'tool: "record_category"',
            'tool: "find_tickets"',
            DiagnosticCode.E_SPEC_INVALID,
        ),
        (
            RECORD_NODE_FILE,
            '- name: "category"\n  from: "$route.out.category"\n',
            "",
            DiagnosticCode.E_INPUT_UNBOUND,
        ),
    ],
    ids=[
        "approval_tool_outside_tools",
        "agent_recursion",
        "subagent_inference_unknown",
        "approval_default_policy",
        "agent_tool_unknown",
        "instructions_missing",
        "instructions_not_markdown",
        "instructions_with_variable",
        "agent_mcp_server_unknown",
        "tool_mcp_server_unknown",
        "write_tool_without_idempotency_key",
        "idempotency_key_outside_in",
        "tool_ttl_is_not_a_key",
        "tool_secret_literal",
        "tool_out_drift",
        "tool_node_unknown",
        "mcp_tool_as_step",
        "tool_input_unbound",
    ],
)
def test_registry_problem_is_reported(shop: Path, file: str, old: str, new: str, expected: DiagnosticCode) -> None:
    with_registry(shop)
    replace(shop, file, old, new)

    report = check_project(shop)

    assert expected in found(report)


LABELS_FILE: Final = "triage/quality/cases/labels.yaml"
TRIAGE_DATASET: Final = """apiVersion: "aqven/v1"
kind: "Dataset"
cases:
- name: "late_parcel"
  inputs:
    ticket:
      subject: "Где посылка"
      body: "Заказ не пришёл вовремя"
      customer:
        name: "Анна"
        email: null
      photo: null
  metadata:
    split: "train"
  expected_output:
    rationale: "Покупатель спрашивает о доставке"
    category: "delivery"
"""


def test_dataset_id_is_the_file_name_and_name_is_not_a_key(shop: Path) -> None:
    write(shop, LABELS_FILE, TRIAGE_DATASET)

    loaded = check_project(shop)

    assert loaded.project is not None
    assert set(loaded.project.datasets) == {"labels"}

    replace(shop, LABELS_FILE, 'kind: "Dataset"\n', 'kind: "Dataset"\nname: "labels"\n')

    assert diagnostics_of(check_project(shop), DiagnosticCode.E_UNKNOWN_KEY) == [(LABELS_FILE, ("name",))]


FORM_FILE: Final = "triage/form.py"
FORM_CODE: Final = """from aqven.spec import FieldSpec

CATEGORY_FIELD = FieldSpec(name="category", type="TriageCategory", description="Очередь")
CUSTOMER_FIELD = FieldSpec(name="customer", type="Customer?", description="Покупатель")


def ticket_fields() -> list[FieldSpec]:
    subject = FieldSpec(name="subject", type="Text", description="Тема", maxLength=200)
    return [subject, CATEGORY_FIELD, CUSTOMER_FIELD]
"""


def test_field_spec_in_code_names_registry_types(shop: Path) -> None:
    write(shop, FORM_FILE, FORM_CODE)

    assert check_project(shop).diagnostics == ()


@pytest.mark.parametrize(
    ("old", "new", "expected", "line"),
    [
        ('type="TriageCategory"', 'type="TriageQueue"', DiagnosticCode.E_TYPE_UNKNOWN, 3),
        ('type="Customer?"', 'type="TriageTicket?"', DiagnosticCode.E_SPEC_INVALID, 4),
        (
            'description="Очередь")',
            'description="Очередь", enum=["billing"])',
            DiagnosticCode.E_TYPE_CONSTRAINT_MISMATCH,
            3,
        ),
        ('type="Text"', 'type="Text?[]"', DiagnosticCode.E_TYPE_REF_SYNTAX, 8),
    ],
    ids=["unknown_type", "type_with_media", "registry_constraint_copy", "type_ref_syntax"],
)
def test_field_spec_type_in_code_is_resolved(
    shop: Path, old: str, new: str, expected: DiagnosticCode, line: int
) -> None:
    assert FORM_CODE.count(old) == 1, old
    write(shop, FORM_FILE, FORM_CODE.replace(old, new))

    report = check_project(shop)

    assert [(item.file, item.line) for item in report.diagnostics if item.code is expected] == [(FORM_FILE, line)]


def test_step_model_name_taken_by_a_type_is_reported(shop: Path) -> None:
    write(shop, "shared/triage_summarize_out.yaml", (shop / "shared/customer.yaml").read_text(encoding="utf-8"))
    replace(shop, "shared/triage_summarize_out.yaml", 'pii: "pii"\n', "")
    generate_types(shop)

    report = check_project(shop)

    assert diagnostics_of(report, DiagnosticCode.E_ID_DUPLICATE) == [(SUMMARIZE, ())]
    assert DiagnosticCode.W_GENERATED_STALE not in found(report)


@pytest.mark.parametrize(
    ("file", "old", "new"),
    [
        (SUMMARIZE, "  maxLength: 200\n", "  maxLength: 20\n"),
        (RECORD_FILE, "  maxLength: 64\n", "  maxLength: 128\n"),
    ],
    ids=["step", "tool"],
)
def test_changed_step_or_tool_makes_generated_types_stale_until_generate(
    shop: Path, file: str, old: str, new: str
) -> None:
    with_registry(shop)
    replace(shop, file, old, new)

    stale = check_project(shop)

    assert diagnostics_of(stale, DiagnosticCode.W_GENERATED_STALE) == [(GENERATED_TYPES, ())]

    generate_types(shop)

    assert check_project(shop).diagnostics == ()


PANEL_REQUEST: Final = """apiVersion: "aqven/v1"
kind: "Type"
type: "record"
description: "Вход панели судей"
fields:
- name: "ticket"
  type: "TriageTicket"
  description: "Обращение"
- name: "category"
  type: "TriageCategory"
  description: "Очередь от классификатора"
"""

PANEL_FLOW: Final = """apiVersion: "aqven/v1"
kind: "Flow"
description: "Панель судей очереди"
input: "PanelRequest"
output: "TriageReview"
returns:
- name: "category"
  from: "$judge.out.category"
order:
- "judge"
requires:
- rule: "families_distinct"
  nodes:
  - "judge"
  min: 1
- rule: "field_before"
  nodes:
  - "judge"
  first: "rationale"
  second: "category"
- rule: "family_disjoint_from_input"
  nodes:
  - "judge"
  input: "ticket"
"""

PANEL_JUDGE: Final = """apiVersion: "aqven/v1"
kind: "Node"
node: "llm"
description: "Судья очереди"
inference: "classify"
agent: "writer"
in:
- name: "ticket"
  from: "$input.ticket"
"""

PANEL_CALL: Final = """apiVersion: "aqven/v1"
kind: "Node"
node: "call"
description: "Панель судей"
flow: "panel"
in:
- name: "ticket"
  from: "$input"
- name: "category"
  from: "$route.out.category"
"""


PANEL_FILE: Final = "shared/panel/flow.yaml"
PANEL_CALL_FILE: Final = "triage/panel.yaml"


def with_panel(root: Path) -> None:
    write(root, "shared/panel/panel_request.yaml", PANEL_REQUEST)
    write(root, PANEL_FILE, PANEL_FLOW)
    write(root, "shared/panel/judge.yaml", PANEL_JUDGE)
    write(root, PANEL_CALL_FILE, PANEL_CALL)
    order(root, "panel")
    generate_types(root)


def test_called_flow_with_contract_is_clean(shop: Path) -> None:
    with_panel(shop)

    report = check_project(shop)

    assert report.diagnostics == ()
    assert report.project is not None
    assert set(report.project.flows) == {FlowId("triage"), FlowId("panel")}


@pytest.mark.parametrize(
    ("old", "new", "expected"),
    [
        ("  min: 1", "  min: 2", (PANEL_FILE, ("requires", 0))),
        (
            'first: "rationale"\n  second: "category"',
            'first: "category"\n  second: "rationale"',
            (PANEL_FILE, ("requires", 1)),
        ),
        ('input: "ticket"', 'input: "category"', (PANEL_CALL_FILE, ("in",))),
    ],
    ids=["families_distinct", "field_before", "family_disjoint_from_input"],
)
def test_flow_contract_problem_is_reported(
    shop: Path, old: str, new: str, expected: tuple[str, tuple[str | int, ...]]
) -> None:
    with_panel(shop)
    replace(shop, PANEL_FILE, old, new)

    violations = diagnostics_of(check_project(shop), DiagnosticCode.E_CONTRACT_VIOLATION)

    assert violations == [expected]


@pytest.mark.parametrize(
    ("file", "old", "new", "expected"),
    [
        (PANEL_CALL_FILE, 'flow: "panel"', 'flow: "jury"', (DiagnosticCode.E_FLOW_UNKNOWN, PANEL_CALL_FILE, ("flow",))),
        (
            PANEL_FILE,
            'input: "PanelRequest"',
            'input: "TriageCategory"',
            (DiagnosticCode.E_BINDING_TYPE, PANEL_CALL_FILE, ("flow",)),
        ),
        (
            PANEL_CALL_FILE,
            '- name: "category"\n  from: "$route.out.category"\n',
            "",
            (DiagnosticCode.E_INPUT_UNBOUND, PANEL_CALL_FILE, ("in",)),
        ),
        (
            PANEL_CALL_FILE,
            'from: "$route.out.category"',
            'from: "$classify.out.rationale"',
            (DiagnosticCode.E_BINDING_TYPE, PANEL_CALL_FILE, ("in", 1, "from")),
        ),
    ],
    ids=["flow_unknown", "input_not_record", "input_unbound", "input_type"],
)
def test_call_problem_is_reported(
    shop: Path, file: str, old: str, new: str, expected: tuple[DiagnosticCode, str, tuple[str | int, ...]]
) -> None:
    with_panel(shop)
    replace(shop, file, old, new)

    report = check_project(shop)

    assert expected in [(item.code, item.file, item.path) for item in report.errors]


def test_call_output_is_the_called_flow_output(shop: Path) -> None:
    with_panel(shop)
    replace(shop, SUMMARIZE, 'from: "$route.out.category"', 'from: "$panel.out.category"')

    assert check_project(shop).diagnostics == ()


def test_flow_calling_itself_is_reported(shop: Path) -> None:
    with_panel(shop)
    write(
        shop,
        "shared/panel/again.yaml",
        PANEL_CALL.replace('from: "$route.out.category"', 'from: "$judge.out.category"').replace(
            'from: "$input"', 'from: "$input.ticket"'
        ),
    )
    replace(shop, PANEL_FILE, '- "judge"\nrequires:', '- "judge"\n- "again"\nrequires:')

    assert (PANEL_FILE, ()) in diagnostics_of(check_project(shop), DiagnosticCode.E_FLOW_RECURSION)


BATCH_TYPE: Final = """apiVersion: "aqven/v1"
kind: "Type"
type: "record"
description: "Пачка обращений"
fields:
- name: "tickets"
  type: "TriageTicket[]"
  description: "Обращения пачки"
  maxItems: 20
"""

BATCH_RESULT_TYPE: Final = """apiVersion: "aqven/v1"
kind: "Type"
type: "record"
description: "Итог пачки"
fields:
- name: "summaries"
  type: "Text[]"
  description: "Краткие содержания по порядку"
  maxItems: 20
  maxLength: 200
- name: "failures"
  type: "MapItemError[]"
  description: "Упавшие обращения"
  maxItems: 20
"""

BATCH_FLOW: Final = """apiVersion: "aqven/v1"
kind: "Flow"
description: "Краткие содержания пачки обращений"
input: "TriageBatch"
output: "TriageBatchResult"
returns:
- name: "summaries"
  from: "$each.out.summaries"
- name: "failures"
  from: "$each.out.failures"
order:
- "each"
"""

BATCH_MAP: Final = """apiVersion: "aqven/v1"
kind: "Node"
node: "map"
description: "Краткое содержание каждого обращения"
over: "$input.tickets"
body: "summarize"
concurrency: 4
on_item_error:
  use: "skip"
out:
- name: "summaries"
  type: "Text[]"
  description: "Краткие содержания"
  maxItems: 20
  maxLength: 200
  from: "$ok[*].summary"
- name: "failures"
  type: "MapItemError[]"
  description: "Упавшие обращения"
  maxItems: 20
  from: "$failed"
"""

BATCH_BODY: Final = LOOP_BODY.replace('from: "$input"', 'from: "$item"')
BATCH_MAP_FILE: Final = "batch/each.yaml"


def with_batch(root: Path) -> None:
    write(root, "batch/types/triage_batch.yaml", BATCH_TYPE)
    write(root, "batch/types/triage_batch_result.yaml", BATCH_RESULT_TYPE)
    write(root, "batch/flow.yaml", BATCH_FLOW)
    write(root, BATCH_MAP_FILE, BATCH_MAP)
    write(root, "batch/summarize.yaml", BATCH_BODY)
    generate_types(root)


def test_batch_map_takes_its_bound_from_over(shop: Path) -> None:
    with_batch(shop)

    assert check_project(shop).diagnostics == ()


@pytest.mark.parametrize(
    ("value", "expected"),
    [('"—"', set[DiagnosticCode]()), ("5", {DiagnosticCode.E_POLICY_PARAMS})],
    ids=["text", "number"],
)
def test_map_default_value_follows_body_output(shop: Path, value: str, expected: set[DiagnosticCode]) -> None:
    with_batch(shop)
    replace(shop, BATCH_MAP_FILE, '  use: "skip"\n', f'  use: "default"\n  with:\n    value:\n      summary: {value}\n')

    assert found(check_project(shop)) == expected


def test_binding_mismatch_names_the_first_differing_keyword(shop: Path) -> None:
    with_batch(shop)
    replace(shop, BATCH_MAP_FILE, "  maxItems: 20\n  maxLength: 200\n", "  maxItems: 20\n  maxLength: 80\n")

    (problem,) = [item for item in check_project(shop).diagnostics if item.code is DiagnosticCode.E_BINDING_TYPE]

    assert problem.path == ("out", 0, "from")
    assert "#/items/maxLength: slot 80 ≠ source 200" in problem.message


@pytest.mark.parametrize(
    ("slot", "source", "expected"),
    [
        ({"type": "string", "maxLength": 200}, {"type": "string", "maxLength": 80}, True),
        ({"type": "string", "maxLength": 80}, {"type": "string", "maxLength": 200}, False),
        ({"type": "string", "maxLength": 80}, {"type": "string"}, False),
        ({"type": "string", "maxLength": 10}, {"enum": ["a", "bb"], "type": "string"}, True),
        ({"anyOf": [{"type": "string"}, {"type": "null"}]}, {"type": "string"}, True),
        ({"type": "string"}, {"anyOf": [{"type": "string"}, {"type": "null"}]}, False),
        ({"type": "number", "minimum": 0}, {"type": "integer", "minimum": 1, "maximum": 3}, True),
        (
            {"items": {"type": "string"}, "maxItems": 5, "type": "array"},
            {"items": {"type": "string"}, "type": "array"},
            False,
        ),
        ({"format": "date", "type": "string"}, {"type": "string"}, False),
    ],
    ids=[
        "tighter_text",
        "looser_text",
        "unbounded_text",
        "enum_into_text",
        "into_optional",
        "optional_into_required",
        "integer_into_number",
        "list_without_max_items",
        "text_into_date",
    ],
)
def test_schema_compatibility(slot: JsonValue, source: JsonValue, expected: bool) -> None:
    assert accepts(slot, source) is expected


@pytest.mark.parametrize(
    ("slot", "source", "pointer"),
    [
        ({"type": "string", "maxLength": 80}, {"type": "string", "maxLength": 200}, "/maxLength"),
        (
            {"type": "object", "properties": {"a": {"type": "string", "maxLength": 5}}},
            {"type": "object", "properties": {"a": {"type": "string"}}},
            "/properties/a/maxLength",
        ),
        (
            {"type": "object", "properties": {"a/b": {"type": "integer"}}},
            {"type": "object", "properties": {"a/b": {"type": "string"}}},
            "/properties/a~1b/type",
        ),
        (
            {"type": "object", "properties": {"a": {"type": "string"}}},
            {"type": "object", "properties": {"b": {"type": "string"}}},
            "/properties",
        ),
    ],
    ids=["keyword", "nested_property", "escaped_name", "property_names"],
)
def test_schema_rejection_points_at_first_difference(slot: JsonValue, source: JsonValue, pointer: str) -> None:
    rejected = rejection(slot, source)

    assert rejected is not None
    assert rejected.pointer == pointer


PHOTO_CONDITION: Final = "{% if ticket.photo %}"


@dataclass(frozen=True, slots=True)
class TemplateMutation:
    old: str
    new: str
    rule: str


TEMPLATE_MUTATIONS: Final[Mapping[str, TemplateMutation]] = {
    "condition_on_text": TemplateMutation(PHOTO_CONDITION, "{% if ticket.subject %}", "R-T3"),
    "string_compare_on_text": TemplateMutation(PHOTO_CONDITION, '{% if ticket.subject == "срочно" %}', "R-T3"),
    "greater_than": TemplateMutation(PHOTO_CONDITION, "{% if ticket.subject.size > 3 %}", "R-T3"),
    "contains": TemplateMutation(PHOTO_CONDITION, '{% if ticket.subject contains "заказ" %}', "R-T3"),
    "constant_condition": TemplateMutation(PHOTO_CONDITION, "{% if true %}", "R-T3"),
    "elsif_on_text": TemplateMutation(
        "{% if ticket.photo %}К обращению приложено фото товара.",
        "{% if ticket.photo %}К обращению приложено фото товара.{% elsif ticket.body %}Фото нет.",
        "R-T3",
    ),
    "for_over_record": TemplateMutation(
        "{% if ticket.photo %}К обращению приложено фото товара.{% endif %}",
        "{% for item in ticket.customer %}{{ item }}{% endfor %}{% if ticket.photo %}Фото.{% endif %}",
        "R-T5",
    ),
    "for_over_range": TemplateMutation(
        "{% if ticket.photo %}К обращению приложено фото товара.{% endif %}",
        "{% for item in (1..3) %}{{ item }}{% endfor %}{% if ticket.photo %}Фото.{% endif %}",
        "R-T5",
    ),
}


@pytest.mark.parametrize("name", list(TEMPLATE_MUTATIONS), ids=list(TEMPLATE_MUTATIONS))
def test_condition_and_loop_rules_are_reported(shop: Path, name: str) -> None:
    mutation = TEMPLATE_MUTATIONS[name]
    replace(shop, PROMPT, mutation.old, mutation.new)

    rules = {
        item.rule for item in check_project(shop).diagnostics if item.code is DiagnosticCode.E_PROMPT_TAG_FORBIDDEN
    }

    assert mutation.rule in rules


def test_allowed_conditions_pass(shop: Path) -> None:
    replace(
        shop,
        PROMPT,
        PHOTO_CONDITION,
        "{% if ticket.photo == nil or ticket.customer.email and ticket.photo != nil %}{% endif %}" + PHOTO_CONDITION,
    )

    assert check_project(shop).diagnostics == ()


TAGS_INPUT: Final = """- name: "tags"
  type: "Text[]"
  description: "Метки обращения"
  maxItems: 3
  maxLength: 20
out:
"""

TAGS_BINDING: Final = """- name: "tags"
  value:
  - "срочно"
"""


def with_tags(root: Path, loop: str, input_decl: str = TAGS_INPUT, binding: str = TAGS_BINDING) -> None:
    replace(root, INFERENCE, "\nout:\n", f"\n{input_decl}")
    replace(root, INFERENCE, '- run: "fixture_shop.triage.classify:rationale_is_short"\n  on_fail: "flag"\n', "")
    replace(root, INFERENCE, "      photo: null\n  out:", '      photo: null\n    tags:\n    - "срочно"\n  out:')
    append(root, CLASSIFY, binding)
    replace(root, PROMPT, "{{ ticket.body }}", "{{ ticket.body }}\n" + loop)
    generate_types(root)


def test_loop_over_bounded_list_passes(shop: Path) -> None:
    with_tags(shop, "{% for tag in tags %}{{ tag }}{% endfor %}")

    assert check_project(shop).diagnostics == ()


def test_nested_loop_is_reported(shop: Path) -> None:
    with_tags(shop, "{% for tag in tags %}{% for other in tags %}{{ other }}{% endfor %}{{ tag }}{% endfor %}")

    (problem,) = check_project(shop).diagnostics

    assert (problem.code, problem.rule, problem.file) == (DiagnosticCode.E_PROMPT_TAG_FORBIDDEN, "R-T5", PROMPT)


def test_literal_binding_is_checked_against_inference_input(shop: Path) -> None:
    with_tags(
        shop,
        "{% for tag in tags %}{{ tag }}{% endfor %}",
        binding=TAGS_BINDING.replace('"срочно"', '"' + "я" * 30 + '"'),
    )

    assert diagnostics_of(check_project(shop), DiagnosticCode.E_BINDING_TYPE) == [(CLASSIFY, ("in", 1, "value"))]


def test_condition_on_enum_value_outside_enum_is_reported(shop: Path) -> None:
    with_tags(
        shop,
        '{% if tags == "returns" %}Возврат.{% endif %}',
        TAGS_INPUT.replace('"Text[]"', '"TriageCategory"').replace("  maxItems: 3\n  maxLength: 20\n", ""),
        TAGS_BINDING.replace('  value:\n  - "срочно"\n', '  value: "billing"\n'),
    )
    replace(shop, INFERENCE, '    tags:\n    - "срочно"\n', '    tags: "billing"\n')

    (problem,) = check_project(shop).diagnostics

    assert (problem.code, problem.rule) == (DiagnosticCode.E_PROMPT_TAG_FORBIDDEN, "R-T3")
    assert "returns" in problem.message


def test_cli_check_passes_on_clean_project(capsys: pytest.CaptureFixture[str]) -> None:
    code = main(["check", "--static", str(FIXTURE / "triage" / "types")])

    assert code == 0
    assert "errors: 0, warnings: 0" in capsys.readouterr().out


def test_cli_check_fails_with_readable_diagnostics(shop: Path, capsys: pytest.CaptureFixture[str]) -> None:
    replace(shop, SUMMARIZE, "$route.out.category", "$routing.out.category")

    code = main(["check", str(shop)])

    output = capsys.readouterr().out
    assert code == 1
    assert f"{SUMMARIZE}:14:3: error E_REF_MISSING in[1].from:" in output
    assert "errors: 1, warnings: 0" in output


def test_cli_check_json(shop: Path, capsys: pytest.CaptureFixture[str]) -> None:
    replace(shop, SUMMARIZE, "in:\n", "ttl_ms: 1000\nin:\n")

    code = main(["check", str(shop), "--format", "json"])

    document = json.loads(capsys.readouterr().out)
    assert code == 1
    assert (document["ok"], document["errors"]) == (False, 1)
    assert document["diagnostics"][0]["code"] == "E_UNKNOWN_KEY"


def test_cli_check_outside_project(tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    assert main(["check", str(tmp_path)]) == 1
    assert "E_PROJECT_NOT_FOUND" in capsys.readouterr().out


@pytest.mark.parametrize("argv", [[], ["check"], ["check", ".", "--format", "yaml"], ["deploy", "."]])
def test_cli_usage_errors(argv: list[str]) -> None:
    assert main(argv) == 2


@pytest.mark.parametrize("command", PENDING)
def test_cli_engine_commands_are_not_implemented(shop: Path, command: str, capsys: pytest.CaptureFixture[str]) -> None:
    code = main([command, str(shop)])

    assert code == 2
    assert f"aqven {command}: {NOT_IMPLEMENTED}" in capsys.readouterr().err


def test_cli_schema_writes_one_schema_per_kind(shop: Path) -> None:
    assert main(["schema", str(shop)]) == 0

    written = {path.name for path in (shop / ".aqven" / "schema").glob("*.schema.json")}
    assert written == {f"{kind.value.lower()}.schema.json" for kind in SpecKind}


def test_stale_generated_types_are_a_warning_until_generate(shop: Path, capsys: pytest.CaptureFixture[str]) -> None:
    replace(shop, TICKET, "  maxLength: 2000\n", "  maxLength: 1000\n")

    stale = check_project(shop)

    assert diagnostics_of(stale, DiagnosticCode.W_GENERATED_STALE) == [(GENERATED_TYPES, ())]
    assert DiagnosticCode.E_CODE_SIGNATURE_MISMATCH in found(stale)

    assert main(["generate", str(shop)]) == 0

    assert capsys.readouterr().out.strip() == GENERATED_TYPES
    assert "max_length=1000" in (shop / GENERATED_TYPES).read_text(encoding="utf-8")
    assert check_project(shop).diagnostics == ()


def test_cli_check_regenerates_types_first(shop: Path, capsys: pytest.CaptureFixture[str]) -> None:
    (shop / GENERATED_TYPES).unlink()

    assert DiagnosticCode.W_GENERATED_STALE in found(check_project(shop))
    assert main(["check", "--static", str(shop)]) == 0
    assert "errors: 0, warnings: 0" in capsys.readouterr().out
    assert (shop / GENERATED_TYPES).is_file()


def test_cli_generate_outside_project(tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    assert main(["generate", str(tmp_path)]) == 1
    assert "E_PROJECT_NOT_FOUND" in capsys.readouterr().out


def test_cli_command_table_is_complete() -> None:
    assert set(COMMANDS) == {
        "new",
        "models",
        "prompt",
        "check",
        "generate",
        "schema",
        "secrets",
        "tree",
        "refs",
        "run",
        "studio",
        "serve",
        "dev",
        "mcp",
        "series",
        *PENDING,
    }


@pytest.mark.parametrize("broken", [False, True], ids=["clean", "broken"])
def test_python_module_entry_point_matches_main(shop: Path, broken: bool, capsys: pytest.CaptureFixture[str]) -> None:
    if broken:
        replace(shop, SUMMARIZE, "$route.out.category", "$routing.out.category")
    expected = main(["check", str(shop)])
    capsys.readouterr()

    completed = subprocess.run(
        [sys.executable, "-m", "aqven", "check", str(shop)], capture_output=True, text=True, check=False, timeout=120
    )

    assert completed.returncode == expected
    assert "errors:" in completed.stdout


def test_package_ships_typing_marker() -> None:
    assert resources.files("aqven").joinpath("py.typed").is_file()
