import asyncio
from decimal import Decimal
from pathlib import Path
from typing import Final

from fastapi.testclient import TestClient
from httpx2 import Response
from pydantic import JsonValue
from server_fakes import MemorySettings

from aqven.check import check_project
from aqven.series.settings import RESEARCH_SCOPE, SPEND_CAP_KEY
from aqven.server.views.research_budget import ResearchBudgetView

BUDGET: Final = "/api/project/research"
HEADER_COMMENT: Final = "# the shop pays for its own research\n"
PROVIDER_COMMENT: Final = "providers:  # one provider is enough\n"
STALE_HASH: Final = f"sha256-{'0' * 64}"


def budget_of(response: Response) -> ResearchBudgetView:
    return ResearchBudgetView.model_validate(response.json())


def current_hash(client: TestClient) -> str:
    project_file = budget_of(client.get(BUDGET)).project_file
    assert project_file is not None
    return project_file.file_hash


def put_cap(client: TestClient, cap: JsonValue, file_hash: str) -> Response:
    return client.put(BUDGET, json={"research": {"spend_cap_usd": cap}, "file_hash": file_hash})


def saved(client: TestClient, cap: JsonValue) -> ResearchBudgetView:
    return budget_of(put_cap(client, cap, current_hash(client)))


def commented(project: Path) -> str:
    target = project / "aqven.yaml"
    text = HEADER_COMMENT + target.read_text(encoding="utf-8").replace("providers:\n", PROVIDER_COMMENT, 1)
    target.write_text(text, encoding="utf-8")
    return text


def overridden(settings: MemorySettings, value: JsonValue) -> None:
    asyncio.run(settings.set_value(RESEARCH_SCOPE, SPEND_CAP_KEY, value))


def test_a_project_without_a_research_block_reports_the_default(server_client: TestClient) -> None:
    body = budget_of(server_client.get(BUDGET))

    assert (body.spend_cap_usd, body.source, body.project_usd) == (Decimal("1.00"), "default", None)
    assert body.project_file is not None and body.project_file.path == "aqven.yaml"
    assert body.override_problem is None


def test_saving_writes_aqven_yaml_and_keeps_its_order_and_quotes(
    server_client: TestClient, server_project: Path
) -> None:
    before = (server_project / "aqven.yaml").read_text(encoding="utf-8")

    body = saved(server_client, "2.50")

    assert (server_project / "aqven.yaml").read_text(encoding="utf-8") == f"{before}research:\n  spend_cap_usd: 2.50\n"
    assert (body.spend_cap_usd, body.source, body.project_usd) == (Decimal("2.50"), "project", Decimal("2.50"))
    assert check_project(server_project).ok


def test_saving_keeps_the_comments_of_a_hand_edited_file(server_client: TestClient, server_project: Path) -> None:
    before = commented(server_project)

    saved(server_client, "2.50")

    assert (server_project / "aqven.yaml").read_text(encoding="utf-8") == f"{before}research:\n  spend_cap_usd: 2.50\n"


def test_saving_again_edits_the_existing_block_in_place(server_client: TestClient, server_project: Path) -> None:
    before = (server_project / "aqven.yaml").read_text(encoding="utf-8")
    saved(server_client, "2.50")

    body = saved(server_client, 10)

    assert (server_project / "aqven.yaml").read_text(encoding="utf-8") == f"{before}research:\n  spend_cap_usd: 10.00\n"
    assert (body.spend_cap_usd, body.source) == (Decimal(10), "project")


def test_a_stale_hash_is_refused_and_the_file_stays(server_client: TestClient, server_project: Path) -> None:
    before = (server_project / "aqven.yaml").read_text(encoding="utf-8")

    response = put_cap(server_client, "3", STALE_HASH)

    assert (response.status_code, response.json()["code"]) == (412, "STALE_FILE")
    assert (server_project / "aqven.yaml").read_text(encoding="utf-8") == before


def test_a_negative_cap_is_refused(server_client: TestClient, server_project: Path) -> None:
    before = (server_project / "aqven.yaml").read_text(encoding="utf-8")

    response = put_cap(server_client, "-1", current_hash(server_client))

    assert (response.status_code, response.json()["code"]) == (422, "REQUEST_INVALID")
    assert (server_project / "aqven.yaml").read_text(encoding="utf-8") == before


def test_a_local_override_wins_and_names_itself(server_client: TestClient, server_settings: MemorySettings) -> None:
    saved(server_client, "2.50")
    overridden(server_settings, "7")

    body = budget_of(server_client.get(BUDGET))

    assert (body.spend_cap_usd, body.source, body.project_usd) == (Decimal(7), "override", Decimal("2.50"))


def test_a_broken_override_is_reported_instead_of_used(
    server_client: TestClient, server_settings: MemorySettings
) -> None:
    overridden(server_settings, "lots")

    body = budget_of(server_client.get(BUDGET))

    assert (body.spend_cap_usd, body.source) == (None, "override")
    assert body.override_problem is not None and "research.spend_cap_usd" in body.override_problem
