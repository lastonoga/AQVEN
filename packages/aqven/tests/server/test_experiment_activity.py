from datetime import UTC, datetime, timedelta
from typing import Final

from series_fakes import DONE_ID, SERIES_ID, detail, summary

from aqven.series import SeriesId, SeriesStatus, SeriesSummaryView, SeriesVerdict
from aqven.server.views.experiment_activity import (
    UNSEEN_FOLDER,
    ActivityFacts,
    FolderTimes,
    SeriesLedger,
    experiment_activity,
    folder_times,
)
from aqven.server.workspace import FileStat, TreeSnapshot
from aqven.spec import VerdictState

FOLDER: Final = "experiments/reply_quality"
OTHER: Final = "experiments/reply_tone"
BASE: Final = datetime(2026, 9, 24, 10, 0, tzinfo=UTC)
NANOSECONDS: Final = 1_000_000_000


def at(minutes: int) -> datetime:
    return BASE + timedelta(minutes=minutes)


def stat(path: str, minutes: int) -> FileStat:
    return FileStat(path=path, file_hash="sha256-x", size_bytes=1, mtime_ns=int(at(minutes).timestamp()) * NANOSECONDS)


def snapshot(*stats: FileStat) -> TreeSnapshot:
    return TreeSnapshot(files={item.path: item for item in stats}, tree_hash="sha256-tree")


def series(
    status: SeriesStatus,
    started: int,
    finished: int | None = None,
    verdict: VerdictState | None = None,
    series_id: SeriesId = SERIES_ID,
) -> SeriesSummaryView:
    row = summary(detail(series_id, status))
    shown = None if verdict is None else SeriesVerdict(state=verdict, reason=None, text="verdict")
    return row.model_copy(
        update={
            "started_at": at(started),
            "finished_at": None if finished is None else at(finished),
            "verdict": shown,
        }
    )


def facts(*rows: SeriesSummaryView, times: FolderTimes = UNSEEN_FOLDER, errors: int = 0) -> ActivityFacts:
    return ActivityFacts(ledger=SeriesLedger(rows=rows), times=times, errors=errors)


def files_changed(minutes: int, inputs: int | None = None) -> FolderTimes:
    return FolderTimes(created=at(0), changed=at(minutes), inputs_changed=at(minutes if inputs is None else inputs))


def test_folder_times_read_the_experiment_files_and_leave_out_findings() -> None:
    tree = snapshot(
        stat(f"{FOLDER}/experiment.yaml", 5),
        stat(f"{FOLDER}/prompts/terse.md", 2),
        stat(f"{FOLDER}/nodes/reply_short/reply_short.node.yaml", 9),
        stat(f"{FOLDER}/experiment.md", 30),
        stat(f"{FOLDER}/findings/01999f2f.yaml", 90),
        stat(f"{OTHER}/experiment.yaml", 60),
        stat("flows/intake/flow.yaml", 120),
    )

    times = folder_times(tree, (FOLDER,))

    assert times == {FOLDER: FolderTimes(created=at(2), changed=at(30), inputs_changed=at(9))}


def test_folder_times_keep_each_folder_apart_and_know_a_folder_without_files() -> None:
    tree = snapshot(stat(f"{FOLDER}/experiment.yaml", 5), stat(f"{OTHER}/experiment.yaml", 60))

    times = folder_times(tree, (FOLDER, OTHER, "experiments/empty"))

    assert times[OTHER] == FolderTimes(created=at(60), changed=at(60), inputs_changed=at(60))
    assert times["experiments/empty"] == UNSEEN_FOLDER


def test_an_experiment_without_series_was_last_active_when_its_files_changed() -> None:
    activity = experiment_activity(facts(times=files_changed(30)))

    assert (activity.created, activity.last_activity, activity.activity_source) == (at(0), at(30), "files")
    assert (activity.running, activity.attention) == (False, ())


def test_the_last_series_wins_when_it_started_or_finished_after_the_files_changed() -> None:
    activity = experiment_activity(facts(series(SeriesStatus.DONE, started=10, finished=45), times=files_changed(30)))

    assert (activity.last_activity, activity.activity_source) == (at(45), "series")


def test_an_experiment_nobody_has_seen_has_no_activity() -> None:
    activity = experiment_activity(facts())

    assert (activity.created, activity.last_activity, activity.activity_source) == (None, None, None)


def test_a_running_or_human_paused_series_keeps_the_experiment_running() -> None:
    assert experiment_activity(facts(series(SeriesStatus.RUNNING, started=10))).running
    assert experiment_activity(facts(series(SeriesStatus.WAITING_HUMAN, started=10))).running
    assert not experiment_activity(facts(series(SeriesStatus.AWAITING_APPROVAL, started=10))).running


def test_a_series_waiting_for_spend_approval_needs_the_owner() -> None:
    older = series(SeriesStatus.AWAITING_APPROVAL, started=10, series_id=DONE_ID)
    newer = series(SeriesStatus.DONE, started=20, finished=25, verdict=VerdictState.SIGNAL)

    assert experiment_activity(facts(older, newer, times=files_changed(5))).attention == ("spend_cap_pause",)


def test_only_an_invalid_latest_series_needs_the_owner() -> None:
    invalid = series(SeriesStatus.DONE, started=10, finished=15, verdict=VerdictState.INVALID, series_id=DONE_ID)
    valid = series(SeriesStatus.DONE, started=20, finished=25, verdict=VerdictState.CONFIRMED)

    assert experiment_activity(facts(invalid, times=files_changed(5))).attention == ("series_invalid",)
    assert experiment_activity(facts(invalid, valid, times=files_changed(5))).attention == ()


def test_results_go_stale_when_an_input_file_changes_after_the_last_finished_series_started() -> None:
    done = series(SeriesStatus.DONE, started=10, finished=40, verdict=VerdictState.SIGNAL)
    failed = series(SeriesStatus.FAILED, started=10, finished=40)

    assert experiment_activity(facts(done, times=files_changed(20))).attention == ("results_stale",)
    assert experiment_activity(facts(done, times=files_changed(20, inputs=5))).attention == ()
    assert experiment_activity(facts(failed, times=files_changed(20))).attention == ()


def test_check_errors_in_the_experiment_files_need_the_owner_and_reasons_keep_their_order() -> None:
    paused = series(SeriesStatus.AWAITING_APPROVAL, started=10)

    assert experiment_activity(facts(paused, times=files_changed(5), errors=2)).attention == (
        "spend_cap_pause",
        "check_errors",
    )


def test_the_ledger_counts_spend_and_names_the_newest_series() -> None:
    older = series(SeriesStatus.DONE, started=10, finished=90, verdict=VerdictState.REFUTED, series_id=DONE_ID)
    newer = series(SeriesStatus.RUNNING, started=20)
    ledger = SeriesLedger(rows=(older, newer))

    assert ledger.latest is not None
    assert (ledger.latest.series_id, ledger.latest.status, ledger.latest.verdict) == (SERIES_ID, "running", None)
    assert (ledger.count, ledger.touched_at) == (2, at(90))
