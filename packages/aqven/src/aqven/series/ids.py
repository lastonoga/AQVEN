import hashlib
import uuid
from dataclasses import dataclass
from typing import Final

from aqven.runtime.address import RunId
from aqven.series.model import AttemptId, SeriesId
from aqven.spec import VariantId

SERIES_NAMESPACE: Final = uuid.uuid5(uuid.NAMESPACE_URL, "https://aqven.dev/ns/series")
ID_SEPARATOR: Final = "|"
ATTEMPT_PREFIX: Final = "attempt"
RUN_NAME: Final = "run"
JUDGE_PREFIX: Final = "judge"
SEED_BYTES: Final = 8
SEED_ORDER: Final = "big"
FIRST_REPEAT: Final = 1
FIRST_TRY: Final = 1
TRY_NAME: Final = "try"


@dataclass(frozen=True, slots=True)
class AttemptKey:
    case_index: int
    repeat: int
    variant_index: int


def new_series_id(client_op_id: str | None) -> SeriesId:
    if client_op_id is None:
        return SeriesId(str(uuid.uuid7()))
    return SeriesId(str(uuid.uuid5(SERIES_NAMESPACE, client_op_id)))


def attempt_id(series_id: SeriesId, variant_id: VariantId, case_name: str, repeat: int) -> AttemptId:
    name = ID_SEPARATOR.join((ATTEMPT_PREFIX, variant_id, case_name, str(repeat)))
    return AttemptId(str(uuid.uuid5(uuid.UUID(series_id), name)))


def subject_run_id(attempt: AttemptId) -> RunId:
    return RunId(str(uuid.uuid5(uuid.UUID(attempt), RUN_NAME)))


def try_run_id(attempt: AttemptId, tries: int) -> RunId:
    if tries == FIRST_TRY:
        return subject_run_id(attempt)
    return RunId(str(uuid.uuid5(uuid.UUID(attempt), ID_SEPARATOR.join((RUN_NAME, TRY_NAME, str(tries))))))


def try_workflow_id(attempt: AttemptId, tries: int) -> str:
    if tries == FIRST_TRY:
        return attempt
    return ID_SEPARATOR.join((attempt, TRY_NAME, str(tries)))


def judge_run_id(attempt: AttemptId, check_id: str) -> RunId:
    return RunId(str(uuid.uuid5(uuid.UUID(attempt), ID_SEPARATOR.join((JUDGE_PREFIX, check_id)))))


def ordinal_of(key: AttemptKey, repeats: int, variants: int) -> int:
    return (key.case_index * repeats + key.repeat - FIRST_REPEAT) * variants + key.variant_index


def key_of(ordinal: int, repeats: int, variants: int) -> AttemptKey:
    round_index, variant_index = divmod(ordinal, variants)
    case_index, repeat_index = divmod(round_index, repeats)
    return AttemptKey(case_index=case_index, repeat=repeat_index + FIRST_REPEAT, variant_index=variant_index)


def stat_seed(series_id: SeriesId, *parts: str) -> int:
    digest = hashlib.sha256(ID_SEPARATOR.join((series_id, *parts)).encode()).digest()
    return int.from_bytes(digest[:SEED_BYTES], SEED_ORDER)
