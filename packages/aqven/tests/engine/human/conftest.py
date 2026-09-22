from collections.abc import Iterator
from pathlib import Path

import pytest
from dbos import DBOS, DBOSClient
from human_harness import FORMS, HARNESS, HumanTestbed
from pydantic_ai import models

from aqven.engine.human import HumanWaits, SqliteWaitIndex
from aqven.engine.human.dbos_adapters import DbosClientAnswerChannel, DbosClientStatusReader, IndexedRunStatus
from aqven.testing.human import HumanResponder


def launch_dbos(root: Path) -> str:
    url = f"sqlite:///{root / 'dbos.sqlite'}"
    DBOS(
        config={
            "name": "aqven_human_tests",
            "system_database_url": url,
            "application_version": "aqven-human-tests",
            "notification_listener_polling_interval_sec": 0.01,
            "run_admin_server": False,
        }
    )
    DBOS.launch()
    return url


@pytest.fixture(scope="package")
def human_testbed(tmp_path_factory: pytest.TempPathFactory) -> Iterator[HumanTestbed]:
    root = tmp_path_factory.mktemp("human")
    index = SqliteWaitIndex.open(root / "app.sqlite")
    HARNESS.index = index
    url = launch_dbos(root)
    client = DBOSClient(system_database_url=url)
    waits = HumanWaits(
        index=index,
        channel=DbosClientAnswerChannel(client),
        forms=FORMS,
        statuses=IndexedRunStatus(DbosClientStatusReader(client), index),
        confirm_poll_seconds=0.02,
    )
    yield HumanTestbed(index=index, client=client, waits=waits, responder=HumanResponder(waits))
    client.destroy()
    DBOS.destroy()
    HARNESS.index = None


@pytest.fixture(autouse=True)
def no_model_requests() -> Iterator[None]:
    with models.override_allow_model_requests(False):
        yield
