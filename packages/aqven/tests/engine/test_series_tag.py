from typing import Final

from aqven.engine import RunSpec, SeriesTag

TAG: Final = {
    "series_id": "series-1",
    "attempt_id": "attempt-1",
    "role": "subject",
    "variant_id": "writer",
    "case_name": "bulb",
    "repeat": 1,
    "experiment_id": "triage_solo",
}


def test_a_tag_stored_before_the_factor_names_the_experiment_that_owns_its_arm_flow() -> None:
    stored = {"flow_id": "solo", "series": {**TAG, "arm_id": "solo"}}

    tag = RunSpec.model_validate(stored).series

    assert tag is not None
    assert tag.flow_experiment_id == "triage_solo"
    assert "arm_id" not in tag.model_dump()


def test_a_tag_stored_before_the_factor_without_an_arm_owns_no_flow() -> None:
    tag = SeriesTag.model_validate({**TAG, "arm_id": None})

    assert tag.flow_experiment_id is None
    assert tag == SeriesTag.model_validate(TAG)
