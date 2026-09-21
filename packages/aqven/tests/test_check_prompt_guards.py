from pathlib import Path
from typing import Final

import pytest

from aqven.check import CheckReport, check_project
from aqven.codegen import generate_types
from aqven.diagnostics import Diagnostic, DiagnosticCode
from aqven.testing import copy_project

FIXTURE: Final = Path(__file__).parent / "fixtures" / "fixture_shop"
INFERENCE: Final = "triage/classify.inference.yaml"
PROMPT: Final = "triage/classify.prompt.md"
NODE: Final = "triage/classify.node.yaml"
TICKET: Final = "triage/types/triage_ticket.yaml"
CUSTOMER: Final = "shared/customer.yaml"
WRITER: Final = "shared/writer.yaml"
CREDIT: Final = "shared/credit.yaml"
CREDIT_CODE: Final = "shared/credit.py"
LOOKUP: Final = "shared/lookup.yaml"
LOOKUP_CODE: Final = "shared/lookup.py"
CUSTOMER_ID: Final = "triage/types/customer_id.yaml"
ATTACHMENTS: Final = "triage/types/attachments.yaml"

CUSTOMER_ID_TYPE: Final = """apiVersion: "aqven/v1"
kind: "Type"
type: "id"
description: "Customer identifier"
pattern: "^cus_[a-z0-9]{12}$"
maxLength: 16
"""

ATTACHMENTS_TYPE: Final = """apiVersion: "aqven/v1"
kind: "Type"
type: "record"
description: "Files attached to a ticket"
fields:
- name: "photo"
  type: "Image?"
  description: "Photo of the item"
- name: "thumbnail"
  type: "Image?"
  description: "Preview of the photo"
"""

CREDIT_TOOL: Final = """apiVersion: "aqven/v1"
kind: "Tool"
description: "Issues store credit to a customer"
run: "fixture_shop.shared.credit:issue_credit"
effect: "write"
idempotency_key:
- "customer_id"
in:
- name: "customer_id"
  type: "CustomerId"
  description: "Customer that receives the credit"
out:
- name: "credit_id"
  type: "Text"
  description: "Identifier of the credit"
  maxLength: 20
"""

CREDIT_FUNCTION: Final = """from aqven.runtime.steps import ToolContext
from fixture_shop.types import CreditOut, CustomerIdField


async def issue_credit(ctx: ToolContext, customer_id: CustomerIdField) -> CreditOut:
    return CreditOut(credit_id=customer_id)
"""

LOOKUP_TOOL: Final = """apiVersion: "aqven/v1"
kind: "Tool"
description: "Finds the customer behind a ticket"
run: "fixture_shop.shared.lookup:lookup_customer"
effect: "read"
in:
- name: "subject"
  type: "Text"
  description: "Subject of the ticket"
  maxLength: 200
out:
- name: "customer_id"
  type: "CustomerId"
  description: "Identifier of the found customer"
"""

LOOKUP_FUNCTION: Final = """from aqven.runtime.steps import ToolContext
from fixture_shop.types import LookupOut


async def lookup_customer(ctx: ToolContext, subject: str) -> LookupOut:
    return LookupOut(customer_id=subject)
"""

CUSTOMER_FIELD: Final = """- name: "customer_id"
  type: "CustomerId"
  description: "Identifier of the customer"
"""

CUSTOMER_RENDERED: Final = "Тема: {{ ticket.subject }}"
CUSTOMER_ID_RENDERED: Final = "Тема: {{ ticket.subject }}\nПокупатель: {{ ticket.customer.customer_id }}"
RECORD_RENDERED: Final = "Тема: {{ ticket.subject }}\nПокупатель:\n{{ ticket.customer }}"


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


def of(report: CheckReport, code: DiagnosticCode) -> tuple[Diagnostic, ...]:
    return tuple(item for item in report.diagnostics if item.code is code)


def codes(report: CheckReport) -> set[DiagnosticCode]:
    return {item.code for item in report.diagnostics}


@pytest.fixture
def shop(tmp_path: Path) -> Path:
    return copy_project(FIXTURE, tmp_path)


def with_credit_tool(root: Path) -> None:
    write(root, CUSTOMER_ID, CUSTOMER_ID_TYPE)
    write(root, CREDIT, CREDIT_TOOL)
    write(root, CREDIT_CODE, CREDIT_FUNCTION)
    append(root, CUSTOMER, CUSTOMER_FIELD)
    replace(
        root, INFERENCE, '        name: "Анна"\n', '        name: "Анна"\n        customer_id: "cus_7k2m9p4q1x8z"\n'
    )
    replace(root, WRITER, "settings:", 'tools:\n- "credit"\nsettings:')
    generate_types(root)


def test_prompt_that_never_renders_the_tool_id_is_reported(shop: Path) -> None:
    with_credit_tool(shop)

    report = check_project(shop)

    (problem,) = of(report, DiagnosticCode.W_TOOL_ARG_UNREACHABLE)
    assert (problem.file, problem.path) == (NODE, ("agent",))
    assert "tool credit of agent writer requires customer_id of type CustomerId" in problem.message
    assert "$in.ticket.customer.customer_id" in problem.message
    assert problem.hint == "render {{ ticket.customer.customer_id }} in the prompt of inference classify"
    assert report.ok


def test_rendering_the_tool_id_clears_the_warning(shop: Path) -> None:
    with_credit_tool(shop)
    replace(shop, PROMPT, CUSTOMER_RENDERED, CUSTOMER_ID_RENDERED)

    report = check_project(shop)

    assert report.diagnostics == ()


def test_rendering_the_whole_record_clears_the_warning(shop: Path) -> None:
    with_credit_tool(shop)
    replace(shop, PROMPT, CUSTOMER_RENDERED, RECORD_RENDERED)

    report = check_project(shop)

    assert report.diagnostics == ()


def test_inference_without_an_input_of_the_tool_type_is_reported(shop: Path) -> None:
    with_credit_tool(shop)
    replace(shop, CUSTOMER, CUSTOMER_FIELD, "")
    replace(shop, INFERENCE, '        customer_id: "cus_7k2m9p4q1x8z"\n', "")
    generate_types(shop)

    report = check_project(shop)

    (problem,) = of(report, DiagnosticCode.W_TOOL_ARG_UNREACHABLE)
    assert "no input of inference classify (triage/classify.inference.yaml) carries CustomerId" in problem.message
    assert problem.hint == (
        "add an input of type CustomerId to triage/classify.inference.yaml and render it in the prompt"
    )


def test_a_tool_that_returns_the_type_makes_it_reachable(shop: Path) -> None:
    with_credit_tool(shop)
    replace(shop, CUSTOMER, CUSTOMER_FIELD, "")
    replace(shop, INFERENCE, '        customer_id: "cus_7k2m9p4q1x8z"\n', "")
    write(shop, LOOKUP, LOOKUP_TOOL)
    write(shop, LOOKUP_CODE, LOOKUP_FUNCTION)
    replace(shop, WRITER, '- "credit"', '- "credit"\n- "lookup"')
    generate_types(shop)

    report = check_project(shop)

    assert of(report, DiagnosticCode.W_TOOL_ARG_UNREACHABLE) == ()


def test_value_whose_fields_are_all_media_is_reported_as_unreadable(shop: Path) -> None:
    write(shop, ATTACHMENTS, ATTACHMENTS_TYPE)
    append(shop, TICKET, '- name: "attachments"\n  type: "Attachments?"\n  description: "Attached files"\n')
    replace(shop, INFERENCE, "      photo: null\n", "      photo: null\n      attachments: null\n")
    replace(shop, PROMPT, CUSTOMER_RENDERED, "Тема: {{ ticket.subject }}\nФайлы: {{ ticket.attachments }}")
    generate_types(shop)

    report = check_project(shop)

    (problem,) = of(report, DiagnosticCode.W_PROMPT_VALUE_UNREADABLE)
    assert problem.file == PROMPT
    assert "value ticket.attachments has no text form" in problem.message
    assert problem.hint == "remove {{ ticket.attachments }} from the prompt, or render a text field of the value"
    assert report.ok


def test_record_with_text_fields_renders_without_a_warning(shop: Path) -> None:
    replace(shop, PROMPT, CUSTOMER_RENDERED, RECORD_RENDERED)

    report = check_project(shop)

    assert report.diagnostics == ()


def test_media_input_is_not_reported_as_unused(shop: Path) -> None:
    replace(
        shop,
        INFERENCE,
        '- name: "ticket"\n  type: "TriageTicket"\n  description: "Обращение"\n',
        '- name: "ticket"\n  type: "TriageTicket"\n  description: "Обращение"\n'
        '- name: "scan"\n  type: "Image?"\n  description: "Scan of the receipt"\n',
    )
    replace(shop, INFERENCE, "      photo: null\n", "      photo: null\n    scan: null\n")
    replace(
        shop,
        NODE,
        '- name: "ticket"\n  from: "$input"\n',
        '- name: "ticket"\n  from: "$input"\n- name: "scan"\n  from: "$input.photo"\n',
    )
    generate_types(shop)

    report = check_project(shop)

    assert codes(report) == set()


def test_input_used_only_by_a_check_path_is_not_reported_as_unused(shop: Path) -> None:
    replace(
        shop,
        INFERENCE,
        '- name: "ticket"\n  type: "TriageTicket"\n  description: "Обращение"\n',
        '- name: "ticket"\n  type: "TriageTicket"\n  description: "Обращение"\n'
        '- name: "note"\n  type: "Text"\n  description: "Operator note"\n  maxLength: 200\n',
    )
    replace(shop, INFERENCE, "      photo: null\n", '      photo: null\n    note: "none"\n')
    replace(
        shop,
        INFERENCE,
        '- use: "not_empty"\n  with:\n    field: "$out.rationale"\n  on_fail: "retry"\n',
        '- use: "not_empty"\n  with:\n    field: "$out.rationale"\n  on_fail: "retry"\n'
        '- use: "not_empty"\n  with:\n    field: "$in.note"\n  on_fail: "flag"\n',
    )
    replace(
        shop,
        NODE,
        '- name: "ticket"\n  from: "$input"\n',
        '- name: "ticket"\n  from: "$input"\n- name: "note"\n  from: "$input.subject"\n',
    )
    generate_types(shop)

    report = check_project(shop)

    assert of(report, DiagnosticCode.E_PROMPT_INPUT_UNUSED) == ()


def test_unused_input_still_names_the_missing_placeholder(shop: Path) -> None:
    replace(
        shop,
        INFERENCE,
        '- name: "ticket"\n  type: "TriageTicket"\n  description: "Обращение"\n',
        '- name: "ticket"\n  type: "TriageTicket"\n  description: "Обращение"\n'
        '- name: "note"\n  type: "Text"\n  description: "Operator note"\n  maxLength: 200\n',
    )
    replace(shop, INFERENCE, "      photo: null\n", '      photo: null\n    note: "none"\n')
    replace(
        shop,
        NODE,
        '- name: "ticket"\n  from: "$input"\n',
        '- name: "ticket"\n  from: "$input"\n- name: "note"\n  from: "$input.subject"\n',
    )
    generate_types(shop)

    report = check_project(shop)

    (problem,) = of(report, DiagnosticCode.E_PROMPT_INPUT_UNUSED)
    assert problem.message == "input note is declared, but the template does not use it"
    assert problem.hint == "render {{ note }} in the prompt, or remove the input from in"


def test_variable_that_is_neither_an_input_nor_a_variant_slot_is_reported(shop: Path) -> None:
    replace(shop, PROMPT, CUSTOMER_RENDERED, "Тема: {{ ticket.subject }}\nОтдел: {{ queue.name }}")

    report = check_project(shop)

    (problem,) = of(report, DiagnosticCode.E_PROMPT_VARIABLE_UNDECLARED)
    assert problem.message == "variable queue is not declared in the inference inputs"
    assert problem.file == PROMPT
