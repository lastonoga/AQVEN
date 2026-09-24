from dataclasses import dataclass
from typing import Final

from aqven.engine.llm.provider_faults import ProviderFailure
from aqven.ir.nodes import OutputMode

CLIENT_ERRORS: Final = range(400, 500)
ALL_MODES: Final[frozenset[OutputMode]] = frozenset({"tool", "native", "prompted"})
SCHEMA_MODES: Final[frozenset[OutputMode]] = frozenset({"tool", "native"})


@dataclass(frozen=True, slots=True)
class SchemaRejectionRule:
    family: str
    markers: tuple[str, ...]
    modes: frozenset[OutputMode] = ALL_MODES

    def matches(self, failure: ProviderFailure, mode: OutputMode) -> bool:
        if mode not in self.modes:
            return False
        if failure.status is not None and failure.status not in CLIENT_ERRORS:
            return False
        text = failure.searchable
        return any(marker in text for marker in self.markers)


SCHEMA_REJECTION_RULES: Final[tuple[SchemaRejectionRule, ...]] = (
    SchemaRejectionRule(
        family="google",
        markers=(
            "too many states for serving",
            "schema produces a constraint",
            "response_schema.properties",
            "responseschema.properties",
            "maximum nesting depth",
            "schema is too complex",
        ),
    ),
    SchemaRejectionRule(
        family="openai",
        markers=(
            "invalid schema for response_format",
            "invalid schema for function",
            "invalid_json_schema",
            "invalid_function_parameters",
            "text.format.schema",
        ),
    ),
    SchemaRejectionRule(
        family="anthropic",
        markers=(
            "input_schema",
            "output_format.schema",
            "compiled grammar is too large",
            "too many recursive definitions",
            "schema is too complex for compilation",
        ),
    ),
    SchemaRejectionRule(
        family="openrouter",
        markers=("no endpoints found that can handle the requested parameters",),
        modes=SCHEMA_MODES,
    ),
)


def schema_rejection(
    failure: ProviderFailure,
    mode: OutputMode,
    rules: tuple[SchemaRejectionRule, ...] = SCHEMA_REJECTION_RULES,
) -> SchemaRejectionRule | None:
    return next((rule for rule in rules if rule.matches(failure, mode)), None)


MEDIA_REFUSALS: Final = (
    "not support",
    "unsupported",
    "no endpoints found",
    "only supported by certain models",
    "not a multimodal model",
    "at most 0",
)


@dataclass(frozen=True, slots=True)
class MediaRejectionRule:
    medium: str
    markers: tuple[str, ...]

    def matches(self, failure: ProviderFailure) -> bool:
        if failure.status is not None and failure.status not in CLIENT_ERRORS:
            return False
        text = failure.searchable
        return any(marker in text for marker in self.markers) and any(refusal in text for refusal in MEDIA_REFUSALS)


MEDIA_REJECTION_RULES: Final[tuple[MediaRejectionRule, ...]] = (
    MediaRejectionRule(medium="images", markers=("image input", "image_url", "image(s)", "images", "vision")),
    MediaRejectionRule(medium="audio", markers=("audio input", "input audio", "input_audio")),
    MediaRejectionRule(medium="video", markers=("video input", "video_url")),
    MediaRejectionRule(medium="documents", markers=("file input", "pdf", "document input")),
)


def media_rejection(
    failure: ProviderFailure, rules: tuple[MediaRejectionRule, ...] = MEDIA_REJECTION_RULES
) -> MediaRejectionRule | None:
    return next((rule for rule in rules if rule.matches(failure)), None)
