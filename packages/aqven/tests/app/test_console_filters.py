import io
import logging
import re
import warnings
from collections.abc import Iterator
from dataclasses import dataclass
from typing import Final

import pytest
from console_log_support import CLOCK, RUN_ID, at_fixed_time, preserved_loggers, rendered
from dbos import error as dbos_errors
from pydantic_ai.models.test import TestModel

from aqven.app.console_log.install import ConsoleSetup, install_console
from aqven.app.console_log.levels import ConsoleLevel
from aqven.app.console_log.python_warnings import WarningsBridge
from aqven.app.console_log.render import DETAIL_INDENT
from aqven.app.console_log.rules import AccessLineRule, DemoteRule, ShutdownInterruptionRule
from aqven.diagnostics import DIAGNOSTIC_TEXTS, DiagnosticCode
from aqven.engine.addressing import child_workflow_id
from aqven.engine.dbos_logs import CancelledBranchFilter, route_dbos_logs
from aqven.ir import CompiledAgent, CompiledLlmNode, CompiledProject
from aqven.log_support import RuleChain
from aqven.models import LimiterModel, call_site
from aqven.runtime.address import node_address
from aqven.server.mcp.endpoint import build_mcp_server
from aqven.spec import AgentId

SAMPLING_TEXT: Final = (
    "Sampling parameters ['temperature'] are not supported when reasoning is enabled. These settings will be ignored."
)
SERIALIZER_TEXT: Final = (
    "Pydantic serializer warnings:\n"
    "  PydanticSerializationUnexpectedValue(Expected `tuple[Union[int, str], ...]` - serialized value may not be "
    "as expected [field_name='loc', input_value=[], input_type=list])\n"
    "  PydanticSerializationUnexpectedValue(Expected `str` - serialized value may not be as expected "
    "[field_name='content', input_value=[{'type': 'json_invalid'}], input_type=list])"
)
MODEL_REF: Final = "openrouter:openai/gpt-5-nano"
AGENT: Final = AgentId("looker_nano")
AGENT_FILE: Final = "agents/looker_nano.yaml"
CLOCK_PREFIX: Final = re.compile(r"^\d{2}:\d{2}:\d{2} ")
SAMPLING_HINT: Final = DIAGNOSTIC_TEXTS[DiagnosticCode.W_SAMPLING_IGNORED].hint
BRANCH: Final = child_workflow_id(RUN_ID, node_address("drafts", branch_key="gpt"))


def fresh_dbos_logger() -> None:
    logger = logging.getLogger("dbos")
    logger.handlers[:] = []
    logger.filters[:] = []
    logger.propagate = True


@pytest.fixture
def console() -> Iterator[io.StringIO]:
    stream = io.StringIO()
    with preserved_loggers("dbos", "aqven", "py.warnings"), warnings.catch_warnings():
        warnings.simplefilter("always")
        fresh_dbos_logger()
        with install_console(ConsoleSetup(level=ConsoleLevel.INFO, stream=stream)):
            yield stream


@pytest.fixture
def verbose_console() -> Iterator[io.StringIO]:
    stream = io.StringIO()
    with preserved_loggers("dbos", "aqven", "py.warnings"):
        fresh_dbos_logger()
        with install_console(ConsoleSetup(level=ConsoleLevel.DEBUG, stream=stream)):
            yield stream


def cancellation_error() -> dbos_errors.DBOSAwaitedWorkflowCancelledError:
    try:
        raise dbos_errors.DBOSAwaitedWorkflowCancelledError(BRANCH)
    except dbos_errors.DBOSAwaitedWorkflowCancelledError as error:
        return error


def log_cancelled_pair() -> None:
    logger = logging.getLogger("dbos")
    logger.warning(f"Workflow {BRANCH} was cancelled during execution. Waiting for the recorded outcome")
    logger.error("Exception encountered in asynchronous workflow:", exc_info=cancellation_error())


def test_cancelled_branch_pair_is_dropped_at_the_default_level(console: io.StringIO) -> None:
    route_dbos_logs()
    log_cancelled_pair()

    assert console.getvalue() == ""


def test_cancelled_branch_pair_becomes_one_debug_line_in_verbose(verbose_console: io.StringIO) -> None:
    route_dbos_logs()
    log_cancelled_pair()

    [line] = verbose_console.getvalue().splitlines()
    assert line.endswith("· dbos  branch drafts[branch=gpt] of run bf3c852f cancelled")


def test_cancelled_branch_that_finishes_late_is_one_debug_line_in_verbose(verbose_console: io.StringIO) -> None:
    route_dbos_logs()
    logging.getLogger("dbos").warning(
        f"Workflow {BRANCH} outcome was not recorded: the workflow is no longer owned by this execution. "
        "Waiting for the recorded outcome"
    )
    logging.getLogger("dbos").error("Exception encountered in asynchronous workflow:", exc_info=cancellation_error())

    [line] = verbose_console.getvalue().splitlines()
    assert line.endswith(
        "· dbos  branch drafts[branch=gpt] of run bf3c852f finished after it was cancelled; its result was dropped"
    )


def test_cancelled_branch_that_finishes_late_is_hidden_at_the_default_level(console: io.StringIO) -> None:
    route_dbos_logs()
    logging.getLogger("dbos").warning(
        f"Workflow {BRANCH} outcome was not recorded: the workflow is no longer owned by this execution. "
        "Waiting for the recorded outcome"
    )

    assert console.getvalue() == ""


def test_cancelled_run_is_named_as_a_run(verbose_console: io.StringIO) -> None:
    route_dbos_logs()
    logging.getLogger("dbos").warning(
        f"Workflow {RUN_ID} was cancelled during execution. Waiting for the recorded outcome"
    )

    [line] = verbose_console.getvalue().splitlines()
    assert line.endswith("· dbos  run bf3c852f cancelled")


def test_cancelled_branch_filter_keeps_other_dbos_records() -> None:
    chain = CancelledBranchFilter()
    other = logging.LogRecord(
        "dbos", logging.WARNING, __file__, 1, "Aborting duplicate execution of workflow w.", (), None
    )

    assert chain.filter(other) is other


def test_route_dbos_logs_installs_the_filter_once() -> None:
    with preserved_loggers("dbos"):
        route_dbos_logs()
        route_dbos_logs()

        filters = [item for item in logging.getLogger("dbos").filters if isinstance(item, CancelledBranchFilter)]
        assert len(filters) == 1


def test_warnings_are_printed_once_per_category_and_message(console: io.StringIO) -> None:
    for _ in range(3):
        warnings.warn("a deprecated knob", DeprecationWarning, stacklevel=1)
        warnings.warn("another knob", UserWarning, stacklevel=1)

    lines = [line.split(" ", 1)[1] for line in console.getvalue().splitlines()]
    assert lines == ["▲ DeprecationWarning: a deprecated knob", "▲ UserWarning: another knob"]


class WarningLimiter(LimiterModel):
    def request_with_temperature(self) -> None:
        warnings.warn(SAMPLING_TEXT, UserWarning, stacklevel=1)


@dataclass(frozen=True, slots=True)
class ProjectScope:
    project: CompiledProject


def call_agent(node: CompiledLlmNode, scope: ProjectScope | None, model: WarningLimiter) -> None:
    with call_site(node_address("reply", item_index=0)):
        model.request_with_temperature()


def sampling_hint(setting: str) -> str:
    assert SAMPLING_HINT is not None
    return f"hint: {SAMPLING_HINT.format(setting=setting)}"


def warning_lines(console: io.StringIO) -> list[str]:
    return [CLOCK_PREFIX.sub("", line) for line in console.getvalue().splitlines()]


def test_temperature_warning_reads_like_the_check_and_names_the_agent_once(console: io.StringIO) -> None:
    node = CompiledLlmNode.model_construct(agent=AGENT)
    model = WarningLimiter(TestModel(), model_ref=MODEL_REF)

    for _ in range(5):
        call_agent(node, None, model)

    assert warning_lines(console) == [
        f"▲ W_SAMPLING_IGNORED: temperature is ignored by {MODEL_REF} (reasoning model); remove it",
        f"{DETAIL_INDENT}{sampling_hint('temperature')}",
        f"{DETAIL_INDENT}agent looker_nano",
    ]


def test_temperature_warning_names_the_agent_file_from_the_running_project(console: io.StringIO) -> None:
    node = CompiledLlmNode.model_construct(agent=AGENT)
    agent = CompiledAgent.model_construct(agent_id=AGENT, file=AGENT_FILE)
    scope = ProjectScope(CompiledProject.model_construct(agents={AGENT: agent}))

    call_agent(node, scope, WarningLimiter(TestModel(), model_ref=MODEL_REF))

    assert warning_lines(console)[-1] == f"{DETAIL_INDENT}agent looker_nano ({AGENT_FILE})"


def test_temperature_warning_without_context_is_printed_once(console: io.StringIO) -> None:
    for _ in range(2):
        warnings.warn(SAMPLING_TEXT, UserWarning, stacklevel=1)

    assert warning_lines(console) == [
        "▲ W_SAMPLING_IGNORED: temperature is ignored by the model (reasoning model); remove it",
        f"{DETAIL_INDENT}{sampling_hint('temperature')}",
        f"{DETAIL_INDENT}aqven check names every agent that sets it",
    ]


def test_several_sampling_parameters_get_one_message_each(console: io.StringIO) -> None:
    warnings.warn(SAMPLING_TEXT.replace("['temperature']", "['temperature', 'top_p']"), UserWarning, stacklevel=1)

    head, hint, _owner = warning_lines(console)
    assert head == (
        "▲ W_SAMPLING_IGNORED: temperature is ignored by the model (reasoning model); remove it; "
        "top_p is ignored by the model (reasoning model); remove it"
    )
    assert hint == f"{DETAIL_INDENT}{sampling_hint('temperature and top_p')}"


def test_pydantic_serializer_warning_is_one_short_line(console: io.StringIO) -> None:
    for _ in range(2):
        warnings.warn(SERIALIZER_TEXT, UserWarning, stacklevel=1)

    [line] = console.getvalue().splitlines()
    assert line.endswith(
        "▲ pydantic serialized values that do not match their declared types: "
        "loc is list, expected tuple[Union[int, str], ...]; content is list, expected str"
    )


def test_bridge_restores_the_previous_hook() -> None:
    previous = warnings.showwarning
    bridge = WarningsBridge()
    bridge.install()
    bridge.uninstall()

    assert warnings.showwarning is previous


def test_access_lines_are_short() -> None:
    arguments = ("127.0.0.1:5", "POST", "/api/runs", "1.1", 201)
    record = logging.LogRecord("uvicorn.access", logging.INFO, __file__, 1, '%s - "%s %s HTTP/%s" %d', arguments, None)
    short = RuleChain((AccessLineRule(),)).filter(at_fixed_time(record))

    assert isinstance(short, logging.LogRecord)
    assert rendered(short) == f"{CLOCK} • uvicorn  POST /api/runs 201\n"


def test_run_telemetry_is_demoted_when_run_lines_cover_it() -> None:
    record = logging.LogRecord("aqven.engine.llm", logging.WARNING, __file__, 41, "CODE: text", (), None)
    demoted = RuleChain((DemoteRule(("aqven.engine.llm",)),)).filter(record)

    assert isinstance(demoted, logging.LogRecord)
    assert demoted.levelno == logging.DEBUG
    assert record.levelno == logging.WARNING


def test_mcp_server_leaves_the_root_logger_alone() -> None:
    with preserved_loggers():
        root = logging.getLogger()
        root.handlers[:] = []
        root.setLevel(logging.WARNING)

        build_mcp_server(())

        assert root.handlers == []
        assert root.level == logging.WARNING


def shutdown_failure() -> RuntimeError:
    try:
        try:
            raise dbos_errors.DBOSException("No DBOS was created yet")
        except dbos_errors.DBOSException as cause:
            raise RuntimeError("cannot schedule new futures after shutdown") from cause
    except RuntimeError as error:
        return error


def test_a_run_cut_by_shutdown_is_one_warning_not_two_tracebacks() -> None:
    error = shutdown_failure()
    info = (type(error), error, error.__traceback__)
    dbos_record = logging.makeLogRecord(
        {
            "name": "dbos",
            "levelno": logging.ERROR,
            "levelname": "ERROR",
            "msg": "Exception encountered",
            "exc_info": info,
            "operationUUID": RUN_ID,
        }
    )
    asyncio_record = logging.LogRecord("asyncio", logging.ERROR, __file__, 1, "unhandled exception", (), info)
    chain = RuleChain((ShutdownInterruptionRule(),))

    first = chain.filter(at_fixed_time(dbos_record))

    assert isinstance(first, logging.LogRecord)
    assert rendered(first) == (
        f"{CLOCK} ▲ dbos  run bf3c852f was still running when the server stopped; it resumes on the next start\n"
    )
    assert chain.filter(asyncio_record) is False
