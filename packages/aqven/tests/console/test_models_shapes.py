import json
import re
from collections.abc import AsyncIterator
from io import StringIO
from pathlib import Path
from typing import Final

import pytest
from pydantic import JsonValue
from pydantic_ai.exceptions import ModelHTTPError
from pydantic_ai.messages import ModelMessage, ModelRequest, UserPromptPart
from pydantic_ai.models import Model
from pydantic_ai.models.function import AgentInfo, DeltaToolCall, FunctionModel

from aqven.cli import main
from aqven.console.command import OutputFormat
from aqven.console.models import ModelsShapesRequest, shapes_models
from aqven.engine.llm.shape_probe import DEPTH_TOKENS, LIST_TOKENS
from aqven.runtime.address import JsonObject
from aqven.testing import copy_project

FIXTURE: Final = Path(__file__).parent.parent / "fixtures" / "fixture_shop"
CHEAP: Final = "shared/cheap.yaml"
TOKEN_PATTERN: Final = re.compile(r"'([^']+)'")


@pytest.fixture
def shop(tmp_path: Path) -> Path:
    return copy_project(FIXTURE, tmp_path)


def request(
    root: Path,
    target: str | None,
    *,
    output: OutputFormat = OutputFormat.TEXT,
    provider_options: JsonObject | None = None,
) -> ModelsShapesRequest:
    return ModelsShapesRequest(root=root, output=output, target=target, provider_options=provider_options)


def _resolved(schema: JsonValue, defs: dict[str, JsonValue]) -> JsonValue:
    ref = schema.get("$ref") if isinstance(schema, dict) else None
    if not isinstance(ref, str):
        return schema
    return defs[ref.removeprefix("#/$defs/")]


def _item_count(resolved: dict[str, JsonValue]) -> int:
    count = resolved.get("minItems", 1)
    return count if isinstance(count, int) else 1


def _fill(schema: JsonValue, defs: dict[str, JsonValue], queue: list[str]) -> JsonValue:
    resolved = _resolved(schema, defs)
    if not isinstance(resolved, dict):
        return queue.pop(0)
    properties = resolved.get("properties")
    if isinstance(properties, dict):
        return {name: _fill(inner, defs, queue) for name, inner in properties.items()}
    if resolved.get("type") == "array":
        items = resolved.get("items", {})
        return [_fill(items, defs, queue) for _ in range(_item_count(resolved))]
    return queue.pop(0)


def _fill_root(schema: JsonValue, queue: list[str]) -> JsonValue:
    if not isinstance(schema, dict):
        return _fill(schema, {}, queue)
    defs = schema.get("$defs")
    return _fill(schema, defs if isinstance(defs, dict) else {}, queue)


def _tokens(text: str) -> list[str]:
    return TOKEN_PATTERN.findall(text)


def _prompt(messages: list[ModelMessage]) -> str:
    message = messages[-1]
    if not isinstance(message, ModelRequest):
        return ""
    contents = [part.content for part in message.parts if isinstance(part, UserPromptPart)]
    return "".join(content for content in contents if isinstance(content, str))


async def correct_model_of(model: str) -> Model:
    async def stream(messages: list[ModelMessage], info: AgentInfo) -> AsyncIterator[dict[int, DeltaToolCall]]:
        schema = info.output_tools[0].parameters_json_schema
        queue = _tokens(_prompt(messages))
        answer = _fill_root(schema, queue)
        yield {0: DeltaToolCall(name=info.output_tools[0].name, json_args=json.dumps(answer), tool_call_id="call-1")}

    return FunctionModel(stream_function=stream, model_name=model)


async def breaks_at_depth_three_of(model: str) -> Model:
    wrong: Final = "WRONG-TOKEN"
    trigger: Final = DEPTH_TOKENS[2]

    async def stream(messages: list[ModelMessage], info: AgentInfo) -> AsyncIterator[dict[int, DeltaToolCall]]:
        schema = info.output_tools[0].parameters_json_schema
        queue = _tokens(_prompt(messages))
        if trigger in queue:
            queue = [wrong if token == trigger else token for token in queue]
        answer = _fill_root(schema, queue)
        yield {0: DeltaToolCall(name=info.output_tools[0].name, json_args=json.dumps(answer), tool_call_id="call-1")}

    return FunctionModel(stream_function=stream, model_name=model)


async def rate_limited_once_at_depth_two_of(model: str) -> Model:
    trigger: Final = DEPTH_TOKENS[1]
    seen: Final = set[str]()

    async def stream(messages: list[ModelMessage], info: AgentInfo) -> AsyncIterator[dict[int, DeltaToolCall]]:
        schema = info.output_tools[0].parameters_json_schema
        queue = _tokens(_prompt(messages))
        if trigger in queue and trigger not in seen:
            seen.add(trigger)
            raise ModelHTTPError(status_code=429, model_name=model, body="temporarily rate-limited upstream")
        answer = _fill_root(schema, queue)
        yield {0: DeltaToolCall(name=info.output_tools[0].name, json_args=json.dumps(answer), tool_call_id="call-1")}

    return FunctionModel(stream_function=stream, model_name=model)


def test_a_rate_limit_does_not_get_reported_as_the_models_real_limit(shop: Path) -> None:
    out = StringIO()

    code = shapes_models(request(shop, "cheap", output=OutputFormat.JSON), rate_limited_once_at_depth_two_of, out)

    assert code == 0
    report = json.loads(out.getvalue())
    depth = next(axis for axis in report["targets"][0]["models"][0]["axes"] if axis["axis"] == "nesting_depth")
    assert depth["boundary"] == len(DEPTH_TOKENS)
    hiccup = next(case for case in depth["cases"] if not case["ok"])
    assert (hiccup["level"], hiccup["structural"], hiccup["code"]) == (2, False, "provider_error")


def test_a_model_that_fills_every_shape_correctly_reaches_the_top_of_every_axis(shop: Path) -> None:
    out = StringIO()

    code = shapes_models(request(shop, "cheap", output=OutputFormat.JSON), correct_model_of, out)

    assert code == 0
    report = json.loads(out.getvalue())
    axes = {axis["axis"]: axis for axis in report["targets"][0]["models"][0]["axes"]}
    assert axes["nesting_depth"]["boundary"] == len(DEPTH_TOKENS)
    assert axes["list_of_objects"]["boundary"] == len(LIST_TOKENS)
    assert all(case["ok"] for axis in axes.values() for case in axis["cases"])


def test_a_model_that_breaks_at_one_depth_stops_probing_deeper(shop: Path) -> None:
    out = StringIO()

    code = shapes_models(request(shop, "cheap", output=OutputFormat.JSON), breaks_at_depth_three_of, out)

    assert code == 0
    report = json.loads(out.getvalue())
    axes = {axis["axis"]: axis for axis in report["targets"][0]["models"][0]["axes"]}
    depth = axes["nesting_depth"]
    assert depth["boundary"] == 2
    assert [case["ok"] for case in depth["cases"]] == [True, True, False]
    assert depth["cases"][-1]["code"] == "MODEL_SCHEMA_MISMATCH"


def test_text_report_names_the_axis_boundary_and_where_it_broke(shop: Path) -> None:
    out = StringIO()

    shapes_models(request(shop, "cheap"), breaks_at_depth_three_of, out)

    text = out.getvalue()
    assert "nesting_depth" in text
    assert "holds up to: 2" in text
    assert "breaks at 3: MODEL_SCHEMA_MISMATCH" in text


def test_running_without_live_refuses_instead_of_spending_money(shop: Path, capsys: pytest.CaptureFixture[str]) -> None:
    assert main(["models", "shapes", "cheap", "--project", str(shop)]) == 1

    assert "pass --live to run it" in capsys.readouterr().err


def test_unknown_agent_is_reported(shop: Path, capsys: pytest.CaptureFixture[str]) -> None:
    assert main(["models", "shapes", "author", "--project", str(shop), "--live"]) == 1

    err = capsys.readouterr().err
    assert "aqven models shapes: author is neither an agent of the project nor a provider:model" in err


def test_models_shapes_without_a_project_prints_the_diagnostic(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    assert main(["models", "shapes", "--project", str(tmp_path), "--json"]) == 1

    assert json.loads(capsys.readouterr().out)["diagnostics"][0]["code"] == "E_PROJECT_NOT_FOUND"


def test_provider_options_reach_the_probed_model(shop: Path) -> None:
    seen: list[object] = []

    async def recording_model_of(model: str) -> Model:
        async def stream(messages: list[ModelMessage], info: AgentInfo) -> AsyncIterator[dict[int, DeltaToolCall]]:
            settings = info.model_settings
            seen.append(None if settings is None else settings.get("extra_body"))
            answer = _fill_root(info.output_tools[0].parameters_json_schema, _tokens(_prompt(messages)))
            yield {0: DeltaToolCall(name=info.output_tools[0].name, json_args=json.dumps(answer), tool_call_id="c1")}

        return FunctionModel(stream_function=stream, model_name=model)

    options: JsonObject = {"provider": {"require_parameters": True}}
    shapes_models(request(shop, "cheap", provider_options=options), recording_model_of, StringIO())

    assert seen
    assert all(sent == options for sent in seen)


def test_provider_options_must_be_valid_json(shop: Path, capsys: pytest.CaptureFixture[str]) -> None:
    assert main(["models", "shapes", "cheap", "--project", str(shop), "--live", "--provider-options", "not json"]) == 1

    assert "not valid JSON" in capsys.readouterr().err
