import hashlib
from collections.abc import Mapping, Sequence
from typing import Final, NewType

from pydantic import JsonValue, TypeAdapter
from pydantic_ai.messages import ModelMessage, ModelMessagesTypeAdapter
from pydantic_ai.models import ModelRequestParameters
from pydantic_ai.settings import ModelSettings
from pydantic_core import to_jsonable_python

from aqven.ir.hashing import canonical_json
from aqven.models.callsite import CallSite

CassetteKey = NewType("CassetteKey", str)

CASSETTE_DOMAIN: Final = b"aqven.cassette.v1"
CASSETTE_KEY_PREFIX: Final = "sha256-"
CASSETTE_KEY_PATTERN: Final = r"^sha256-[0-9a-f]{64}$"
PROPERTIES_KEY: Final = "properties"
TOOL_CALL_ID: Final = "tool_call_id"
TOOL_CALL_ALIAS: Final = "call-"

VOLATILE_MESSAGE_KEYS: Final = frozenset(
    {
        "timestamp",
        "run_id",
        "conversation_id",
        "provider_response_id",
        "usage",
        "metadata",
        "model_name",
        "provider_name",
        "provider_url",
        "provider_details",
        "state",
        "finish_reason",
    }
)
VOLATILE_PART_KEYS: Final = frozenset({"timestamp", "provider_name", "provider_details", "id", "signature"})
TRANSPORT_SETTING_KEYS: Final = frozenset(
    {"timeout", "extra_headers", "openrouter_provider", "openrouter_usage", "openai_user"}
)
REQUEST_PARAMETER_KEYS: Final = (
    "output_mode",
    "allow_text_output",
    "allow_image_output",
    "prompted_output_template",
    "thinking",
)

JSON_VALUE: Final[TypeAdapter[JsonValue]] = TypeAdapter(JsonValue)


def jsonable(value: object) -> JsonValue:
    return JSON_VALUE.validate_python(to_jsonable_python(value, bytes_mode="base64"))


def without_keys(value: JsonValue, dropped: frozenset[str]) -> JsonValue:
    if not isinstance(value, dict):
        return value
    return {key: item for key, item in value.items() if key not in dropped}


def message_parts(message: JsonValue) -> list[JsonValue]:
    parts = message.get("parts") if isinstance(message, dict) else None
    return parts if isinstance(parts, list) else []


def tool_call_aliases(messages: Sequence[JsonValue]) -> Mapping[str, str]:
    identifiers = (
        part.get(TOOL_CALL_ID) for message in messages for part in message_parts(message) if isinstance(part, dict)
    )
    ordered = dict.fromkeys(identifier for identifier in identifiers if isinstance(identifier, str))
    return {identifier: f"{TOOL_CALL_ALIAS}{index}" for index, identifier in enumerate(ordered)}


def neutral_part(part: JsonValue, aliases: Mapping[str, str]) -> JsonValue:
    stripped = without_keys(part, VOLATILE_PART_KEYS)
    if not isinstance(stripped, dict):
        return stripped
    identifier = stripped.get(TOOL_CALL_ID)
    if not isinstance(identifier, str):
        return stripped
    return {**stripped, TOOL_CALL_ID: aliases.get(identifier, identifier)}


def neutral_message(message: JsonValue, aliases: Mapping[str, str]) -> JsonValue:
    stripped = without_keys(message, VOLATILE_MESSAGE_KEYS)
    if not isinstance(stripped, dict):
        return stripped
    parts = stripped.get("parts")
    if not isinstance(parts, list):
        return stripped
    return {**stripped, "parts": [neutral_part(part, aliases) for part in parts]}


def neutral_messages(messages: Sequence[ModelMessage]) -> JsonValue:
    dumped = jsonable(ModelMessagesTypeAdapter.dump_python(list(messages), mode="json"))
    if not isinstance(dumped, list):
        return dumped
    aliases = tool_call_aliases(dumped)
    return [neutral_message(message, aliases) for message in dumped]


def ordered_properties(value: JsonValue) -> JsonValue:
    if isinstance(value, list):
        return [ordered_properties(item) for item in value]
    if not isinstance(value, dict):
        return value
    return {key: ordered_entry(key, item) for key, item in value.items()}


def ordered_entry(key: str, value: JsonValue) -> JsonValue:
    if key == PROPERTIES_KEY and isinstance(value, dict):
        return [[name, ordered_properties(schema)] for name, schema in value.items()]
    return ordered_properties(value)


def neutral_settings(settings: ModelSettings | None) -> JsonValue:
    if settings is None:
        return {}
    dumped = jsonable(dict(settings))
    return without_keys(dumped, TRANSPORT_SETTING_KEYS)


def neutral_parameters(parameters: ModelRequestParameters) -> JsonValue:
    dumped = jsonable(parameters)
    fields: Mapping[str, JsonValue] = dumped if isinstance(dumped, dict) else {}
    selected: dict[str, JsonValue] = {key: fields.get(key) for key in REQUEST_PARAMETER_KEYS}
    selected["function_tools"] = ordered_properties(fields.get("function_tools"))
    selected["output_tools"] = ordered_properties(fields.get("output_tools"))
    selected["output_object"] = ordered_properties(fields.get("output_object"))
    selected["native_tools"] = fields.get("native_tools")
    return selected


def canonical_request(
    model_ref: str,
    messages: Sequence[ModelMessage],
    settings: ModelSettings | None,
    parameters: ModelRequestParameters,
) -> JsonValue:
    return {
        "model": model_ref,
        "messages": neutral_messages(messages),
        "settings": neutral_settings(settings),
        "parameters": neutral_parameters(parameters),
    }


def digest(value: JsonValue) -> CassetteKey:
    hasher = hashlib.sha256()
    hasher.update(CASSETTE_DOMAIN)
    hasher.update(b"\x00")
    hasher.update(canonical_json(value))
    return CassetteKey(f"{CASSETTE_KEY_PREFIX}{hasher.hexdigest()}")


def request_key(request: JsonValue) -> CassetteKey:
    return digest(request)


def cassette_key(request: CassetteKey, site: CallSite) -> CassetteKey:
    return digest({"request": request, "site": site.as_json()})
