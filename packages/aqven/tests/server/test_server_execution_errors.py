import json
from dataclasses import dataclass
from pathlib import Path
from typing import Final

import pytest
from fastapi.testclient import TestClient
from pydantic import JsonValue, TypeAdapter
from pydantic_ai import ModelHTTPError
from server_fakes import RUN_ID, FakeEngine

from aqven.engine.llm.failures import FailureAnalysis, FailureContext
from aqven.runtime.address import ExecutionAddress, RunId
from aqven.runtime.executions import ExecutionDetail, RunError
from aqven.runtime.vocabulary import IncludePayloads
from aqven.server import contract_app, openapi_text

FIXTURES: Final = Path(__file__).resolve().parents[1] / "engine" / "llm" / "fixtures"
JSON_OBJECT: Final[TypeAdapter[dict[str, JsonValue]]] = TypeAdapter(dict[str, JsonValue])
ADDRESS: Final = ExecutionAddress(node_id="assess__look", branch_key=None, iteration=None, item_index=0)


def gemini_error() -> RunError:
    recorded = JSON_OBJECT.validate_json((FIXTURES / "openrouter_gemini_schema_rejection.json").read_bytes())
    schema = JSON_OBJECT.validate_json((FIXTURES / "look_output_schema.json").read_bytes())
    status, model = recorded["status_code"], recorded["model_name"]
    assert isinstance(status, int) and isinstance(model, str)
    error = ModelHTTPError(status, model, recorded["body"])
    context = FailureContext(
        agent_id="looker",
        model="openrouter:google/gemini-2.5-flash-lite",
        mode="tool",
        output_tools=frozenset({"final_result"}),
        schema={**schema, "title": "LookOut"},
        inference_id="look",
        agent_file="agents/looker.yaml",
        node_id="assess__look",
    )
    final = FailureAnalysis(context).final_error(error, "provider_error", str(error))
    return RunError(code=final.code, message=final.message, address=ADDRESS, hint=final.hint, details=final.details)


@dataclass
class FailedLookEngine(FakeEngine):
    async def get_execution(
        self, run_id: RunId, address: ExecutionAddress, include_payloads: IncludePayloads = "truncated"
    ) -> ExecutionDetail:
        detail = await super().get_execution(run_id, address, include_payloads)
        return detail.model_copy(update={"status": "failed", "error": gemini_error()})


@pytest.fixture
def server_engine() -> FakeEngine:
    return FailedLookEngine()


def test_execution_detail_carries_the_hint_and_the_provider_details(server_client: TestClient) -> None:
    response = server_client.get(
        f"/api/runs/{RUN_ID}/executions/detail", params={"node_id": "assess__look", "item_index": 0}
    )

    assert response.status_code == 200
    error = response.json()["error"]
    assert error["code"] == "OUTPUT_SCHEMA_REJECTED"
    assert error["message"] == (
        "openrouter:google/gemini-2.5-flash-lite rejected the output type LookOut of step assess__look: "
        "The specified schema produces a constraint that has too many states for serving."
    )
    assert error["hint"].startswith("LookOut is too complex for the structured output of this model")
    details = error["details"]
    assert (details["status_code"], details["provider"], details["provider_code"]) == (
        400,
        "Google AI Studio",
        "INVALID_ARGUMENT",
    )
    assert json.loads(details["provider_response"])["metadata"]["provider_name"] == "Google AI Studio"
    assert details["output_shape"] == {
        "depth": 3,
        "deepest_path": "findings[].zone",
        "max_items": 12,
        "max_items_path": "findings",
        "enum_size": 16,
        "enum_path": "findings[].kind",
    }


def test_openapi_describes_the_error_hint_and_details() -> None:
    schemas = json.loads(openapi_text(contract_app()))["components"]["schemas"]

    assert {"hint", "details"} <= set(schemas["RunError"]["properties"])
    assert {"status_code", "provider", "provider_code", "provider_response", "output_shape"} <= set(
        schemas["ModelErrorDetails"]["properties"]
    )
    assert set(schemas["OutputShape"]["properties"]) == {
        "depth",
        "deepest_path",
        "max_items",
        "max_items_path",
        "enum_size",
        "enum_path",
    }
