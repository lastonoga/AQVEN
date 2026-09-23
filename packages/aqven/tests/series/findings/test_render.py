import io
from pathlib import Path
from typing import Final, Protocol, cast

import pytest
from finding_fixtures import (
    FindingCase,
    noninferior_case,
    signal_case,
    threshold_case,
)
from pydantic import JsonValue
from ruamel.yaml import YAML

from aqven.loader import read_strict_yaml
from aqven.series import LookOrigin, SeriesId
from aqven.series.findings import (
    FindingUnavailable,
    finding_bytes,
    finding_hash,
    finding_of,
    render_findings_md,
)
from aqven.spec import DatasetId, FindingSpec, FlowId, LookQuestion, SeriesSplit, VerdictState

GOLDEN: Final = Path(__file__).with_name("golden")


class Dumper(Protocol):
    def dump(self, data: object, stream: io.StringIO) -> None: ...


SECOND_LOOK: Final = SeriesId("01999f40-2222-7333-8444-955566667777")


def spec_of(case: FindingCase) -> FindingSpec:
    return finding_of(case.record, case.experiment, case.attempts)


def parsed(data: bytes) -> FindingSpec:
    document, diagnostics = read_strict_yaml(data.decode("utf-8"), "finding.yaml")
    assert document is not None, diagnostics
    return FindingSpec.model_validate(document.data)


def plain_yaml(document: JsonValue) -> bytes:
    stream = io.StringIO()
    emitter = YAML(typ="safe", pure=True)
    emitter.default_flow_style = False
    cast("Dumper", emitter).dump(document, stream)
    return stream.getvalue().encode("utf-8")


def test_the_finding_file_matches_the_golden_file() -> None:
    assert finding_bytes(spec_of(noninferior_case())) == (GOLDEN / "finding.yaml").read_bytes()


def test_findings_md_matches_the_golden_file() -> None:
    findings = (
        spec_of(noninferior_case()),
        spec_of(threshold_case()),
        spec_of(threshold_case(SECOND_LOOK, VerdictState.REFUTED)),
        spec_of(signal_case()),
    )

    assert render_findings_md(findings, {}) == (GOLDEN / "FINDINGS.md").read_text(encoding="utf-8")


def test_the_finding_file_reads_back_to_the_same_model_and_hash() -> None:
    spec = spec_of(noninferior_case())
    back = parsed(finding_bytes(spec))

    assert back == spec
    assert finding_hash(back) == spec.self_sha256


def test_the_hash_does_not_depend_on_the_yaml_formatting() -> None:
    spec = spec_of(noninferior_case())
    document = spec.model_dump(mode="json", by_alias=True)
    shuffled: dict[str, JsonValue] = dict(reversed(document.items()))
    reformatted = plain_yaml(shuffled)

    assert reformatted != finding_bytes(spec)
    assert finding_hash(parsed(reformatted)) == spec.self_sha256


def test_numbers_are_rounded_to_six_digits_before_hashing() -> None:
    cell = spec_of(noninferior_case()).cells[0]

    assert (cell.estimate.value, cell.estimate.low, cell.estimate.high) == (-0.019167, -0.03507, -0.003263)
    assert cell.estimate.p_value == 0.022482


def test_the_finding_names_the_models_that_answered_and_the_spend() -> None:
    spec = spec_of(noninferior_case())

    assert [variant.models for variant in spec.variants] == [
        ["openrouter:openai/gpt-oss-20b"],
        ["openrouter:mistralai/mistral-nemo"],
    ]
    assert str(spec.spend_usd) == "0.288"
    assert (spec.scope.attempts, spec.scope.holdout_looks, spec.scope.split) == (72, 1, "holdout")
    assert [judge.validated_by for judge in spec.judges] == ["critique_planted_defects"]


def test_a_look_writes_no_finding() -> None:
    case = noninferior_case()
    look = case.record.model_copy(
        update={
            "origin": LookOrigin(flow_id=FlowId("support_case"), dataset_id=DatasetId("cases"), case_names=("a",)),
        }
    )
    look_question = case.record.model_copy(
        update={"plan": case.record.plan.model_copy(update={"question": LookQuestion(kind="look")})}
    )

    with pytest.raises(FindingUnavailable):
        finding_of(look, case.experiment, case.attempts)
    with pytest.raises(FindingUnavailable):
        finding_of(look_question, case.experiment, case.attempts)


def test_a_dev_series_writes_no_finding() -> None:
    case = noninferior_case()
    dev = case.record.model_copy(update={"on": SeriesSplit.DEV})

    with pytest.raises(FindingUnavailable):
        finding_of(dev, case.experiment, case.attempts)


def test_no_findings_render_no_file() -> None:
    assert render_findings_md((), {}) == ""


def test_findings_md_links_to_the_given_paths_and_skips_empty_sections() -> None:
    spec = spec_of(threshold_case())
    text = render_findings_md((spec,), {spec.series: "elsewhere/finding.yaml"})

    assert "[finding](elsewhere/finding.yaml)" in text
    assert "### Inconclusive" not in text
    assert "### Signals" not in text
    assert "holdout looks" not in text


def test_a_variant_without_llm_nodes_reads_back_with_empty_mappings() -> None:
    spec = spec_of(noninferior_case())
    bare = spec.variants[0].model_copy(update={"agents": {}, "metrics": {}})
    unhashed = spec.model_copy(update={"variants": [bare, *spec.variants[1:]]})
    rewritten = unhashed.model_copy(update={"self_sha256": finding_hash(unhashed)})

    back = parsed(finding_bytes(rewritten))

    assert back == rewritten
    assert (back.variants[0].agents, back.variants[0].metrics) == ({}, {})
    assert finding_hash(back) == back.self_sha256
