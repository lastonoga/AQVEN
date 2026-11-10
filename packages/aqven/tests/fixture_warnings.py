from collections.abc import Iterable
from typing import Final

from aqven.check import CheckReport
from aqven.diagnostics import Diagnostic, DiagnosticCode, diagnostic

TRIAGE_NESTED_MEDIA: Final = diagnostic(
    DiagnosticCode.W_NESTED_MEDIA_NOT_ATTACHED,
    "triage/classify.inference.yaml",
    ("in", 0, "type"),
    "Input `ticket` contains nested media at `ticket.photo: Image`; nested media is never attached to the model. "
    "Hoist it to a top-level inference input if the model must read it.",
    line=6,
    column=3,
    hint="hoist the media to a top-level input, or retain it only as metadata when model access is not intended",
)
SHARED_CLASSIFY_NESTED_MEDIA: Final = TRIAGE_NESTED_MEDIA.model_copy(update={"file": "shared/classify.inference.yaml"})
QUICK_NESTED_MEDIA: Final = diagnostic(
    DiagnosticCode.W_NESTED_MEDIA_NOT_ATTACHED,
    "shared/quick.inference.py",
    ("in", 0, "type"),
    "Input `ticket` contains nested media at `ticket.photo: Image`; nested media is never attached to the model. "
    "Hoist it to a top-level inference input if the model must read it.",
    hint="hoist the media to a top-level input, or retain it only as metadata when model access is not intended",
)
CREDIT_TEXT_IDENTIFIER: Final = diagnostic(
    DiagnosticCode.W_TEXT_IDENTIFIER_TYPE,
    "shared/credit.yaml",
    ("out", 0, "type"),
    "Field `credit_id` self-declares an identifier but uses `Text`; use an `IdType` for an entity ID, or an enum "
    "for a genuinely closed codebook.",
    line=14,
    column=3,
    hint=(
        "use an IdType for an entity ID, or an enum for a genuinely closed codebook; "
        "selecting existing entities also requires an appropriate allowed set after the type correction"
    ),
)


def without_accepted_diagnostics(report: CheckReport, *accepted: Diagnostic) -> tuple[Diagnostic, ...]:
    remaining = list(report.diagnostics)
    for expected in accepted:
        assert remaining.count(expected) == 1, (expected, remaining)
        remaining.remove(expected)
    return tuple(remaining)


def codes_of(diagnostics: Iterable[Diagnostic]) -> set[DiagnosticCode]:
    return {item.code for item in diagnostics}
