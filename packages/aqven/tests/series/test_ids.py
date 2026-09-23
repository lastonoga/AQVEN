import uuid
from typing import Final

import pytest

from aqven.series import (
    SERIES_NAMESPACE,
    AttemptKey,
    SeriesId,
    attempt_id,
    judge_run_id,
    key_of,
    new_series_id,
    ordinal_of,
    stat_seed,
    subject_run_id,
)
from aqven.spec import VariantId

SERIES: Final = SeriesId("01999f2e-4b1c-7a3d-9e21-5c7d8f0a1b2c")
ATTEMPT: Final = "0cf98137-2d99-5695-8fe4-983a861383ab"


def test_series_namespace_is_fixed() -> None:
    assert str(SERIES_NAMESPACE) == "3dd2224d-d371-5318-b6fd-6b0f06a5891b"


def test_series_id_from_a_client_op_id_is_stable() -> None:
    assert new_series_id("01J8Z3K4M5N6P7Q8R9S0T1V2W3") == "91fb1e15-c48e-56df-adc0-f5152cf6a466"


def test_series_id_without_a_client_op_id_is_a_fresh_uuid7() -> None:
    first, second = new_series_id(None), new_series_id(None)

    assert first != second
    assert uuid.UUID(first).version == 7


def test_attempt_and_run_ids_match_the_reference() -> None:
    attempt = attempt_id(SERIES, VariantId("gpt"), "strip_flicker_credit", 1)

    assert attempt == ATTEMPT
    assert subject_run_id(attempt) == "689d28f5-41a5-5e36-9978-fb028ec88b4f"
    assert judge_run_id(attempt, "critique") == "27aeab8a-fc87-58aa-a099-4f6c09cc394e"
    assert "::" not in attempt


def test_ordinals_go_round_robin_case_then_repeat_then_variant() -> None:
    repeats, variants = 3, 2
    keys = [key_of(ordinal, repeats, variants) for ordinal in range(8)]

    assert keys[:4] == [
        AttemptKey(case_index=0, repeat=1, variant_index=0),
        AttemptKey(case_index=0, repeat=1, variant_index=1),
        AttemptKey(case_index=0, repeat=2, variant_index=0),
        AttemptKey(case_index=0, repeat=2, variant_index=1),
    ]
    assert keys[6] == AttemptKey(case_index=1, repeat=1, variant_index=0)


@pytest.mark.parametrize(("repeats", "variants"), [(1, 1), (3, 2), (5, 4), (20, 3)])
def test_key_of_inverts_ordinal_of(repeats: int, variants: int) -> None:
    ordinals = range(4 * repeats * variants)

    assert [ordinal_of(key_of(ordinal, repeats, variants), repeats, variants) for ordinal in ordinals] == list(ordinals)


def test_stat_seed_depends_on_every_part() -> None:
    seed = stat_seed(SERIES, "success_rate", "gpt")

    assert seed == 12408416466764730065
    assert seed != stat_seed(SERIES, "success_rate", "mistral")
    assert 0 <= seed < 2**64
