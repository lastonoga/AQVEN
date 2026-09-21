import argparse
import asyncio
import sys
from collections.abc import Callable, Generator, Sequence
from contextlib import AbstractContextManager, contextmanager
from dataclasses import dataclass
from pathlib import Path
from typing import TYPE_CHECKING, Final, TextIO

from aqven.console.command import EXIT_FAILED, EXIT_OK, EXIT_USAGE, PATH_HELP, OutputFormat
from aqven.console.project_env import open_project
from aqven.diagnostics import format_text

if TYPE_CHECKING:
    from aqven.evals.records import EvalRunRecord, ScorerDelta, ScorerSummary

PROGRAM: Final = "aqven eval"
CURRENT_FOLDER: Final = "."
EVAL_HELP: Final = "eval id, the file name under evals/<flow>/"
DATASET_HELP: Final = "dataset id; the dataset named by the eval is used without it"
BASELINE_HELP: Final = "eval run id to compare against and to feed the release gate"
REPEATS_HELP: Final = "how many times every case runs; the gate repeats value is used without it"
SCORER_HEADER: Final = f"{'scorer':<16}{'kind':<12}{'n':>4}{'mean':>9}{'pass':>8}{'min':>9}{'max':>9}"
DELTA_HEADER: Final = f"{'scorer':<16}{'n':>4}{'baseline':>10}{'candidate':>11}{'delta':>9}{'w/l/t':>12}"
PERCENT: Final = 100

type EngineBoot = Callable[[Path, Path | None], AbstractContextManager[Path]]


@dataclass(frozen=True, slots=True)
class EvalCliRequest:
    root: Path
    eval_id: str
    dataset_id: str | None = None
    baseline_run_id: str | None = None
    repeats: int | None = None
    data_dir: Path | None = None
    output: OutputFormat = OutputFormat.TEXT


def scorer_line(row: ScorerSummary) -> str:
    rate = "—" if row.pass_rate is None else f"{row.pass_rate * PERCENT:.0f}%"
    return (
        f"{row.scorer_id:<16}{row.kind.value:<12}{row.n:>4}"
        f"{row.mean:>9.3f}{rate:>8}{row.minimum:>9.3f}{row.maximum:>9.3f}"
    )


def delta_line(row: ScorerDelta) -> str:
    counts = f"{row.wins}/{row.losses}/{row.ties}"
    return (
        f"{row.scorer_id:<16}{row.n:>4}{row.baseline_mean:>10.3f}"
        f"{row.candidate_mean:>11.3f}{row.delta:>+9.3f}{counts:>12}"
    )


def head_lines(record: EvalRunRecord) -> tuple[str, ...]:
    return (
        f"eval {record.eval_id} on dataset {record.dataset_id}: inference {record.inference}, agent {record.agent}",
        f"run {record.eval_run_id} {record.status}: "
        f"{record.cases_ok}/{record.cases_total} cases, repeats {record.repeats}, "
        f"cost ${record.cost_usd}, tokens {record.tokens_in}/{record.tokens_out}",
    )


def gate_lines(record: EvalRunRecord) -> tuple[str, ...]:
    report = record.gate
    if report is None:
        return ("gate: not computed (pass --baseline to compare two runs)",)
    reason = f" ({report.reason_code})" if report.reason_code else ""
    rows = tuple(
        f"  {row.scorer_id:<16}{row.family:<11}{row.delta:>+9.3f}"
        f"  CI [{row.ci_lo:+.3f}, {row.ci_hi:+.3f}]  {row.verdict.value}"
        for row in report.per_test
    )
    return (f"gate: {report.decision.value}{reason}", *rows)


def failure_lines(record: EvalRunRecord) -> tuple[str, ...]:
    return () if record.error is None else (f"error: {record.error}",)


def render_text(record: EvalRunRecord) -> str:
    scorers = (SCORER_HEADER, *(scorer_line(row) for row in record.scorers))
    deltas = () if not record.deltas else ("", DELTA_HEADER, *(delta_line(row) for row in record.deltas))
    notes = tuple(f"note: {item}" for item in record.notes)
    dropped = () if not record.dropped_cases else (f"dropped cases: {', '.join(record.dropped_cases)}",)
    lines: Sequence[str] = (
        *head_lines(record),
        "",
        *scorers,
        *deltas,
        "",
        *gate_lines(record),
        *dropped,
        *notes,
        *failure_lines(record),
    )
    return "\n".join(lines)


def rendered(record: EvalRunRecord, output: OutputFormat) -> str:
    return record.model_dump_json(indent=2) if output is OutputFormat.JSON else render_text(record)


def exit_code(record: EvalRunRecord) -> int:
    if record.status != "completed":
        return EXIT_FAILED
    report = record.gate
    return EXIT_OK if report is None or report.decision.value == "PASS" else EXIT_FAILED


@contextmanager
def project_engines(root: Path, data_dir: Path | None) -> Generator[Path]:
    from aqven.app.locations import ProjectState, StudioState, studio_data_dir
    from aqven.app.settings_store import open_settings_store
    from aqven.engine import configure_local_engines, shutdown_local_engines
    from aqven.engine.assembly import standard_engine_setup

    studio = StudioState(studio_data_dir(data_dir))
    studio.ensure()
    state = ProjectState(root)
    state.ensure()
    configure_local_engines(standard_engine_setup(settings=open_settings_store(state, studio)))
    try:
        yield state.database
    finally:
        shutdown_local_engines()


@contextmanager
def configured_engines(root: Path, data_dir: Path | None) -> Generator[Path]:
    from aqven.app.locations import ProjectState

    state = ProjectState(root)
    state.ensure()
    yield state.database


def run_eval_command(
    request: EvalCliRequest,
    out: TextIO = sys.stdout,
    err: TextIO = sys.stderr,
    engines: EngineBoot = project_engines,
) -> int:
    from aqven.evals import DatasetNotFound, EvalNotFound, EvalOptions, SqliteEvalStore, run_eval
    from aqven.runtime import Project, ProjectInvalid

    try:
        project = Project.load(request.root)
    except ProjectInvalid as invalid:
        print(f"{PROGRAM}: the project does not compile, run aqven check", file=err)
        print(format_text(invalid.report.diagnostics), file=err)
        return EXIT_FAILED
    try:
        with engines(request.root, request.data_dir) as database:
            options = EvalOptions(
                dataset_id=request.dataset_id,
                baseline_run_id=request.baseline_run_id,
                repeats=request.repeats,
                store=SqliteEvalStore.open(database),
            )
            record = asyncio.run(run_eval(project, request.eval_id, options))
    except (EvalNotFound, DatasetNotFound) as missing:
        print(f"{PROGRAM}: {missing}", file=err)
        return EXIT_USAGE
    print(rendered(record, request.output), file=out)
    return exit_code(record)


@dataclass(frozen=True, slots=True)
class EvalCommand:
    help: str = "run an eval over its dataset, score every case and compare with a baseline run"

    def configure(self, parser: argparse.ArgumentParser) -> None:
        parser.add_argument("path", nargs="?", default=CURRENT_FOLDER, help=PATH_HELP)
        parser.add_argument("--eval", required=True, metavar="EVAL_ID", help=EVAL_HELP)
        parser.add_argument("--dataset", default=None, metavar="DATASET_ID", help=DATASET_HELP)
        parser.add_argument("--baseline", default=None, metavar="EVAL_RUN_ID", help=BASELINE_HELP)
        parser.add_argument("--repeats", type=int, default=None, metavar="N", help=REPEATS_HELP)
        parser.add_argument("--data-dir", type=Path, default=None, help="Studio data directory")
        parser.add_argument("--json", action="store_true", help="print the run record as JSON")

    def execute(self, arguments: argparse.Namespace) -> int:
        output = OutputFormat.JSON if bool(arguments.json) else OutputFormat.TEXT
        root = open_project(Path(str(arguments.path)), output)
        if root is None:
            return EXIT_FAILED
        request = EvalCliRequest(
            root=root,
            eval_id=str(arguments.eval),
            dataset_id=_text(arguments.dataset),
            baseline_run_id=_text(arguments.baseline),
            repeats=arguments.repeats if isinstance(arguments.repeats, int) else None,
            data_dir=arguments.data_dir if isinstance(arguments.data_dir, Path) else None,
            output=output,
        )
        return run_eval_command(request)


def _text(value: object) -> str | None:
    return value if isinstance(value, str) and value else None
