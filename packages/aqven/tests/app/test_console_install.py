import asyncio
import io
import json
import logging
from collections.abc import AsyncIterator, Iterator, Sequence
from decimal import Decimal
from pathlib import Path
from typing import Final, NoReturn

import pytest
from console_log_support import RUN_ID, STUDIO, address, preserved_loggers, run_event
from local_stubs import UnusedEngineFacade

from aqven.app.console_log.events import ConsoleEvent, publish
from aqven.app.console_log.install import ConsoleSetup, InstalledConsole, dev_console_setup, install_console
from aqven.app.console_log.levels import AQVEN_LOG_LEVEL, ConsoleLevel, arguments_level, console_level
from aqven.app.console_log.observers import (
    Followers,
    NoAgentFiles,
    ObservedEngineFacade,
    ObservedSeriesJobs,
    RunWatch,
    SeriesWatch,
    print_spec_changes,
)
from aqven.app.environment import InvalidRuntimeSetting
from aqven.app.options import server_options
from aqven.cli import EXIT_USAGE, build_parser, main
from aqven.runtime.events import RunEvent
from aqven.runtime.runs import Page, RunStarted, RunStartRequest
from aqven.series.model import SeriesEstimate, SeriesId, SeriesStatus
from aqven.series.views import (
    LaunchRequest,
    SeriesCancelRequest,
    SeriesCaseRow,
    SeriesCasesQuery,
    SeriesEvent,
    SeriesGetRequest,
    SeriesGetResult,
    SeriesListQuery,
    SeriesProgress,
    SeriesStarted,
    SeriesStartRequest,
    SeriesSummaryView,
)
from aqven.server.spec_channel import FileChange, FilesChanged, SpecActor, SpecEventHub
from aqven.server.workspace import ProjectWorkspace
from aqven.spec import ExperimentId, FlowId, VariantId
from aqven.write.model import WriteActor

LEVEL_FLAGS: Final = (
    (["dev"], ConsoleLevel.INFO),
    (["dev", "-v"], ConsoleLevel.DEBUG),
    (["serve", "--quiet"], ConsoleLevel.WARNING),
    (["studio", "--verbose"], ConsoleLevel.DEBUG),
    (["run", "flow", "--input", "in.json", "-q"], ConsoleLevel.WARNING),
)
SERIES_ID: Final = SeriesId("01a0d355-aaaa-7bbb-8ccc-00005e71e5a1")


@pytest.fixture
def stream() -> Iterator[io.StringIO]:
    with preserved_loggers("dbos", "aqven", "py.warnings"):
        yield io.StringIO()


def test_flags_win_over_the_environment_and_info_is_the_default() -> None:
    assert console_level(verbose=False, quiet=False, environ={}) is ConsoleLevel.INFO
    assert console_level(verbose=False, quiet=False, environ={AQVEN_LOG_LEVEL: " Debug "}) is ConsoleLevel.DEBUG
    assert console_level(verbose=False, quiet=True, environ={AQVEN_LOG_LEVEL: "debug"}) is ConsoleLevel.WARNING
    assert console_level(verbose=True, quiet=False, environ={AQVEN_LOG_LEVEL: "error"}) is ConsoleLevel.DEBUG


def test_unknown_log_level_in_the_environment_is_a_usage_error() -> None:
    with pytest.raises(InvalidRuntimeSetting, match="AQVEN_LOG_LEVEL='loud'"):
        console_level(verbose=False, quiet=False, environ={AQVEN_LOG_LEVEL: "loud"})


@pytest.mark.parametrize(("argv", "expected"), LEVEL_FLAGS)
def test_dev_serve_and_run_take_verbose_and_quiet(argv: list[str], expected: ConsoleLevel) -> None:
    assert arguments_level(build_parser().parse_args(argv), {}) is expected


def test_verbose_and_quiet_together_are_rejected() -> None:
    assert main(["dev", "-v", "-q"]) == EXIT_USAGE


def test_server_options_carry_the_console_level(tmp_path: Path) -> None:
    (tmp_path / "aqven.yaml").write_text("", encoding="utf-8")
    arguments = build_parser().parse_args(["dev", "--root", str(tmp_path)])

    options = server_options(arguments, tmp_path, environ={AQVEN_LOG_LEVEL: "warning"})

    assert options.console_level is ConsoleLevel.WARNING


def test_install_sets_the_profile_levels_and_close_restores_them(stream: io.StringIO) -> None:
    root = logging.getLogger()
    before = (root.level, logging.getLogger("aqven").level, logging.getLogger("dbos").level)

    installed = install_console(ConsoleSetup(level=ConsoleLevel.WARNING, stream=stream))
    during = (root.level, logging.getLogger("aqven").level, logging.getLogger("dbos").level)
    installed.close()

    assert during == (logging.WARNING, logging.INFO, logging.WARNING)
    assert installed.handlers[0].level == logging.WARNING
    assert (root.level, logging.getLogger("aqven").level, logging.getLogger("dbos").level) == before
    assert not set(installed.handlers) & set(root.handlers)


def test_installing_twice_keeps_one_console(stream: io.StringIO) -> None:
    first = install_console(ConsoleSetup(stream=stream))
    second = install_console(ConsoleSetup(stream=stream))
    logging.getLogger("aqven.dev").warning("once")
    second.close()
    first.close()

    assert stream.getvalue().count("once") == 1


def test_every_record_also_goes_to_the_jsonl_file(stream: io.StringIO, tmp_path: Path) -> None:
    log_file = dev_console_setup(tmp_path, ConsoleLevel.INFO).log_file
    assert log_file == tmp_path / ".aqven" / "logs" / "dev.jsonl"
    assert log_file is not None
    with install_console(ConsoleSetup(stream=stream, log_file=log_file)):
        publish(
            ConsoleEvent(
                kind="step_finished",
                glyph="✓",
                tone="good",
                text="reply · looker_nano",
                fields={"run_id": RUN_ID, "node": "reply", "tokens_in": 12, "cost_usd": "0.0012"},
            )
        )
        logging.getLogger("aqven.engine.llm").warning(
            "MODEL_INVALID_JSON: bad; hint: fix it",
            extra={"aqven.error.code": "MODEL_INVALID_JSON", "aqven.error.hint": "fix it", "gen_ai.request.model": "m"},
        )
        logging.getLogger("aqven.dev").debug("hidden at info")

    lines = [json.loads(line) for line in log_file.read_text(encoding="utf-8").splitlines()]

    assert [(line["level"], line["logger"], line["event"]) for line in lines] == [
        ("info", "aqven.dev", "step_finished"),
        ("warning", "aqven.engine.llm", "log"),
    ]
    assert {key: lines[0][key] for key in ("run_id", "node", "tokens_in", "cost_usd")} == {
        "run_id": RUN_ID,
        "node": "reply",
        "tokens_in": 12,
        "cost_usd": "0.0012",
    }
    assert (lines[1]["code"], lines[1]["hint"], lines[1]["model"]) == ("MODEL_INVALID_JSON", "fix it", "m")
    assert all(line["ts"].startswith("20") and "message" in line for line in lines)


class ScriptedEngine(UnusedEngineFacade):
    def __init__(self, events: Sequence[RunEvent]) -> None:
        self.events = tuple(events)

    async def start_run(self, request: RunStartRequest, *, dataset_item_id: str | None = None) -> RunStarted:
        return RunStarted(
            run_id=RUN_ID, status="running", content_hash="c", spec_version_id="s", last_seq=0, ui_url="/runs/x"
        )

    async def run_events(self, run_id: str, after_seq: int = 0) -> AsyncIterator[RunEvent]:
        for event in self.events:
            yield event


def scripted_run() -> tuple[RunEvent, ...]:
    return (
        run_event("run_started", 1, flow_id="looker", content_hash="c", mode="live", order=["prepare"], input_ref=None),
        run_event(
            "node_finished",
            2,
            address=address("prepare"),
            status="ok",
            attempt=1,
            output_ref=None,
            cost_usd="0",
            tokens_in=0,
            tokens_out=0,
            latency_ms=5,
            model=None,
            cache_hit=False,
            degraded=False,
            checks_failed=0,
        ),
        run_event(
            "run_finished",
            3,
            after_seconds=1,
            status="completed",
            output_ref=None,
            error=None,
            cost_usd="0",
            tokens_in=0,
            tokens_out=0,
        ),
    )


def printed_lines(stream: io.StringIO) -> list[str]:
    return [line.split(" ", 1)[1] for line in stream.getvalue().splitlines()]


async def start_and_follow(engine: ScriptedEngine, followers: Followers) -> None:
    observed = ObservedEngineFacade(engine, RunWatch(engine, followers, NoAgentFiles(), STUDIO))
    await observed.start_run(RunStartRequest.model_validate({"flow_id": "looker", "mode": "live", "input": {}}))
    await asyncio.gather(*followers.tasks)


def test_started_runs_are_followed_and_printed(stream: io.StringIO) -> None:
    followers = Followers()
    with install_console(ConsoleSetup(stream=stream)):
        asyncio.run(start_and_follow(ScriptedEngine(scripted_run()), followers))

    assert printed_lines(stream) == [
        f"▶ run bf3c852f started · flow looker · live · {STUDIO}/runs/{RUN_ID}",
        "✓ prepare · 5ms",
        "■ run bf3c852f completed · 1.0s",
    ]
    assert followers.keys == set()


def unused_series() -> NoReturn:
    raise NotImplementedError("not called by the console")


class ScriptedSeries:
    def __init__(self, events: Sequence[SeriesEvent]) -> None:
        self.scripted = tuple(events)

    async def estimate(self, experiment_id: ExperimentId, request: LaunchRequest) -> SeriesEstimate:
        unused_series()

    async def start(self, request: SeriesStartRequest, actor: WriteActor) -> SeriesStarted:
        return SeriesStarted.model_construct(
            series_id=SERIES_ID,
            flow_id=FlowId("looker"),
            progress=SeriesProgress(done=0, total=2),
            variants=(VariantId("nano"),),
            status=SeriesStatus.RUNNING,
        )

    async def get(self, request: SeriesGetRequest) -> SeriesGetResult:
        unused_series()

    async def list(self, query: SeriesListQuery) -> Page[SeriesSummaryView]:
        unused_series()

    async def cases(self, series_id: SeriesId, query: SeriesCasesQuery) -> tuple[SeriesCaseRow, ...]:
        unused_series()

    async def approve(
        self, series_id: SeriesId, actor: WriteActor, cap_usd: Decimal | None = None
    ) -> SeriesSummaryView:
        unused_series()

    async def cancel(self, request: SeriesCancelRequest) -> SeriesSummaryView:
        unused_series()

    async def events(self, series_id: SeriesId, after_seq: int) -> AsyncIterator[SeriesEvent]:
        for event in self.scripted:
            yield event


async def start_series(jobs: ScriptedSeries, followers: Followers) -> None:
    observed = ObservedSeriesJobs(jobs, SeriesWatch(jobs, followers, STUDIO))
    request = SeriesStartRequest.model_validate({"experiment_id": "looks", "on": "dev"})
    await observed.start(request, WriteActor(kind="human", id="tester"))
    await asyncio.gather(*followers.tasks)


def test_started_series_are_announced(stream: io.StringIO) -> None:
    with install_console(ConsoleSetup(stream=stream)):
        asyncio.run(start_series(ScriptedSeries(()), Followers()))

    assert printed_lines(stream) == [
        f"◆ series 5e71e5a1 started · flow looker · 2 attempts · 1 variant · {STUDIO}/research/series/{SERIES_ID}"
    ]


async def publish_one_change(hub: SpecEventHub) -> None:
    follower = asyncio.create_task(print_spec_changes(hub))
    await asyncio.sleep(0)
    change = FileChange(path="agents/a.yaml", change="added", file_hash_before=None, file_hash_after="h")
    hub.seq = 1
    hub.events.append(
        FilesChanged(
            seq=1,
            at=hub.clock(),
            tree_hash="t",
            changes=(change,),
            actor=SpecActor(kind="fs", id="watchfiles"),
            client_op_id=None,
            ops=None,
            summary="added: 1",
        )
    )
    await hub.close()
    await follower


def test_spec_changes_are_printed(stream: io.StringIO, tmp_path: Path) -> None:
    with install_console(ConsoleSetup(stream=stream)):
        asyncio.run(publish_one_change(SpecEventHub(ProjectWorkspace(tmp_path))))

    assert printed_lines(stream) == ["✎ agents/a.yaml added · reindexed"]


def test_installed_console_is_a_context_manager(stream: io.StringIO) -> None:
    with install_console(ConsoleSetup(stream=stream)) as installed:
        assert isinstance(installed, InstalledConsole)
    assert installed.closed
