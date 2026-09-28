from collections.abc import Mapping
from dataclasses import dataclass, field
from typing import Final, Protocol, cast

from pydantic import JsonValue, TypeAdapter
from pydantic_ai.profiles import ModelProfile
from pydantic_ai.settings import ModelSettings, merge_model_settings

type RequestOptions = Mapping[str, JsonValue]
type NativeSettings = Mapping[str, JsonValue]

EXTRA_BODY: Final = "extra_body"
THINKING: Final = "thinking"
KEY_SEPARATOR: Final = ", "
OPTIONS_OBJECT: Final[TypeAdapter[dict[str, JsonValue]]] = TypeAdapter(dict[str, JsonValue])


@dataclass(frozen=True, slots=True)
class OptionsRequest:
    options: RequestOptions
    profile: ModelProfile = field(default_factory=ModelProfile)


@dataclass(frozen=True, slots=True)
class OptionsSplit:
    native: NativeSettings = field(default_factory=dict[str, JsonValue])
    ignored: tuple[str, ...] = ()


class KeyRule(Protocol):
    def native(self, key: str, request: OptionsRequest) -> NativeSettings | None: ...

    def describe(self, key: str) -> str: ...


class OptionsDelivery(Protocol):
    @property
    def rewrites(self) -> bool: ...

    def split(self, request: OptionsRequest) -> OptionsSplit: ...

    def describe(self) -> str: ...


@dataclass(frozen=True, slots=True)
class Renamed:
    setting: str

    def native(self, key: str, request: OptionsRequest) -> NativeSettings | None:
        return {self.setting: request.options[key]}

    def describe(self, key: str) -> str:
        return key


@dataclass(frozen=True, slots=True)
class RenamedWithFlag:
    setting: str
    flag: str

    def native(self, key: str, request: OptionsRequest) -> NativeSettings | None:
        if request.options.get(self.flag) is not True:
            return None
        return {self.setting: request.options[key]}

    def describe(self, key: str) -> str:
        return f"{key} (with {self.flag}: true)"


def adjustable_thinking(profile: ModelProfile) -> bool:
    return profile.get("supports_thinking", False) and not profile.get("thinking_always_enabled", False)


@dataclass(frozen=True, slots=True)
class AdjustableThinking:
    levels: Mapping[str, JsonValue]

    def native(self, key: str, request: OptionsRequest) -> NativeSettings | None:
        value = request.options[key]
        if not isinstance(value, str) or value not in self.levels or not adjustable_thinking(request.profile):
            return None
        return {THINKING: self.levels[value]}

    def describe(self, key: str) -> str:
        return f"{key} ({' or '.join(self.levels)} on a model with adjustable reasoning)"


@dataclass(frozen=True, slots=True)
class RequestBody:
    @property
    def rewrites(self) -> bool:
        return False

    def split(self, request: OptionsRequest) -> OptionsSplit:
        return OptionsSplit(native={EXTRA_BODY: dict(request.options)})

    def describe(self) -> str:
        return "every key, merged into the request body"


@dataclass(frozen=True, slots=True)
class NestedFields:
    setting: str
    wire_name: str

    @property
    def rewrites(self) -> bool:
        return True

    def split(self, request: OptionsRequest) -> OptionsSplit:
        return OptionsSplit(native={self.setting: dict(request.options)})

    def describe(self) -> str:
        return f"every key, inside {self.wire_name}"


@dataclass(frozen=True, slots=True)
class NamedKeys:
    rules: Mapping[str, KeyRule]

    @property
    def rewrites(self) -> bool:
        return True

    def split(self, request: OptionsRequest) -> OptionsSplit:
        sent = {key: native for key in request.options if (native := self._native(key, request)) is not None}
        return OptionsSplit(
            native={name: value for native in sent.values() for name, value in native.items()},
            ignored=tuple(key for key in request.options if key not in sent),
        )

    def describe(self) -> str:
        return "only " + KEY_SEPARATOR.join(rule.describe(key) for key, rule in self.rules.items())

    def _native(self, key: str, request: OptionsRequest) -> NativeSettings | None:
        rule = self.rules.get(key)
        return None if rule is None else rule.native(key, request)


@dataclass(frozen=True, slots=True)
class NoOptions:
    @property
    def rewrites(self) -> bool:
        return True

    def split(self, request: OptionsRequest) -> OptionsSplit:
        return OptionsSplit(ignored=tuple(request.options))

    def describe(self) -> str:
        return "no key"


REQUEST_BODY: Final[OptionsDelivery] = RequestBody()
NO_REQUEST_OPTIONS: Final[OptionsDelivery] = NoOptions()
BEDROCK_OPTIONS: Final[OptionsDelivery] = NestedFields(
    "bedrock_additional_model_requests_fields", "additionalModelRequestFields"
)
GOOGLE_OPTIONS: Final[OptionsDelivery] = NamedKeys(
    {
        "thinking_config": Renamed("google_thinking_config"),
        "safety_settings": Renamed("google_safety_settings"),
        "media_resolution": Renamed("google_video_resolution"),
        "cached_content": Renamed("google_cached_content"),
        "response_logprobs": Renamed("google_logprobs"),
        "logprobs": RenamedWithFlag("google_top_logprobs", "response_logprobs"),
        "top_k": Renamed("top_k"),
        "presence_penalty": Renamed("presence_penalty"),
        "frequency_penalty": Renamed("frequency_penalty"),
        "stop_sequences": Renamed("stop_sequences"),
    }
)
MISTRAL_OPTIONS: Final[OptionsDelivery] = NamedKeys(
    {
        "reasoning_effort": AdjustableThinking({"none": False, "high": "high"}),
        "prompt_cache_key": Renamed("mistral_prompt_cache_key"),
        "presence_penalty": Renamed("presence_penalty"),
        "frequency_penalty": Renamed("frequency_penalty"),
        "stop": Renamed("stop_sequences"),
    }
)
XAI_OPTIONS: Final[OptionsDelivery] = NamedKeys(
    {
        "reasoning_effort": Renamed("xai_reasoning_effort"),
        "user": Renamed("xai_user"),
        "logprobs": Renamed("xai_logprobs"),
        "top_logprobs": Renamed("xai_top_logprobs"),
        "store_messages": Renamed("xai_store_messages"),
        "previous_response_id": Renamed("xai_previous_response_id"),
        "use_encrypted_content": Renamed("xai_include_encrypted_content"),
        "max_turns": Renamed("xai_max_turns"),
        "agent_count": Renamed("xai_agent_count"),
        "presence_penalty": Renamed("presence_penalty"),
        "frequency_penalty": Renamed("frequency_penalty"),
        "stop": Renamed("stop_sequences"),
    }
)


def wire_settings(native: NativeSettings) -> ModelSettings:
    return cast(ModelSettings, dict(native))


def native_settings(
    delivery: OptionsDelivery, settings: ModelSettings | None, profile: ModelProfile
) -> ModelSettings | None:
    if settings is None or EXTRA_BODY not in settings:
        return settings
    remaining = ModelSettings(**settings)
    options = OPTIONS_OBJECT.validate_python(remaining.pop(EXTRA_BODY) or {})
    split = delivery.split(OptionsRequest(options, profile))
    return merge_model_settings(remaining, wire_settings(split.native))
