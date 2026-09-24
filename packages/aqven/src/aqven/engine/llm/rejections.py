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
