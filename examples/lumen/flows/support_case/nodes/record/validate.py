import json
from collections.abc import Callable, Mapping, Sequence
from datetime import date
from typing import Annotated, Final

from pydantic import Field, JsonValue

from aqven.spec import DynamicValue, FieldSpec
from lumen.types import Issue, SupportCaseValidateOut

type RecordValues = Mapping[str, JsonValue]
type RecordRule = Callable[[RecordValues, Sequence[FieldSpec], date], tuple[Issue, ...]]

ISSUE_LIMIT: Final = 10


def validate_record(
    record: DynamicValue, fields: Annotated[list[FieldSpec], Field(max_length=30)], today: date
) -> SupportCaseValidateOut:
    values = record.value if isinstance(record.value, dict) else {}
    issues = [issue for rule in RECORD_RULES for issue in rule(values, fields, today)]
    return SupportCaseValidateOut(issues=issues[:ISSUE_LIMIT])


def _issue(field: str, code: str, message: str, expected: str, observed: str | None, hint: str) -> Issue:
    return Issue(
        path=[field],
        code=code,
        message=message,
        severity="assert",
        expected=expected,
        observed=observed,
        repair_hint=hint,
    )


def _required_present(values: RecordValues, fields: Sequence[FieldSpec], today: date) -> tuple[Issue, ...]:
    return tuple(
        _issue(
            field.name,
            "required_missing",
            f"The required field {field.name} is empty",
            field.type,
            None,
            "Fill the field from the case text and the attachments",
        )
        for field in fields
        if not field.type.endswith("?") and values.get(field.name) is None
    )


def _purchase_not_in_future(values: RecordValues, fields: Sequence[FieldSpec], today: date) -> tuple[Issue, ...]:
    purchased = values.get("purchased_on")
    if not isinstance(purchased, str) or date.fromisoformat(purchased) <= today:
        return ()
    issue = _issue(
        "purchased_on",
        "purchase_in_future",
        "The purchase date is later than the case date",
        f"no later than {today.isoformat()}",
        purchased,
        "The purchase date cannot be later than the case date: it is a typo, return null",
    )
    return (issue,)


def _overheating_is_risk(values: RecordValues, fields: Sequence[FieldSpec], today: date) -> tuple[Issue, ...]:
    if values.get("symptom") != "overheating" or values.get("safety_risk") is True:
        return ()
    issue = _issue(
        "safety_risk",
        "overheating_without_risk",
        "Overheating always means a safety risk",
        "true",
        json.dumps(values.get("safety_risk")),
        "Set safety_risk to true",
    )
    return (issue,)


def _missing_item_has_carrier(values: RecordValues, fields: Sequence[FieldSpec], today: date) -> tuple[Issue, ...]:
    if values.get("damage") != "missing_item" or values.get("carrier_ref"):
        return ()
    issue = _issue(
        "carrier_ref",
        "carrier_ref_required",
        "A missing item needs the carrier tracking number",
        "tracking number",
        None,
        "Find the tracking number in the case text or in the invoice",
    )
    return (issue,)


RECORD_RULES: Final[tuple[RecordRule, ...]] = (
    _required_present,
    _purchase_not_in_future,
    _overheating_is_risk,
    _missing_item_has_carrier,
)
