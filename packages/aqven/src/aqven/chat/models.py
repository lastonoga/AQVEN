from typing import Final, cast

from aqven.ports.chat import ChatEffort, ChatModel, ChatModelCatalog, ChatModelEffort

EFFORT_ORDER: Final[tuple[ChatEffort, ...]] = ("low", "medium", "high", "xhigh", "max")
KNOWN_EFFORTS: Final[frozenset[str]] = frozenset(EFFORT_ORDER)
CLAUDE_DETAIL: Final = (
    "The Claude CLI does not list its models, so these are the aliases it documents. "
    "Any model name the CLI accepts can be typed instead."
)
EFFORT_DESCRIPTIONS: Final[dict[ChatEffort, str]] = {
    "low": "Short thinking budget",
    "medium": "Balanced thinking budget",
    "high": "Long thinking budget",
    "xhigh": "Very long thinking budget",
    "max": "Largest thinking budget",
}
CLAUDE_ALIASES: Final[tuple[tuple[str, str, str], ...]] = (
    ("fable", "Fable", "Alias for the latest Fable model"),
    ("opus", "Opus", "Alias for the latest Opus model"),
    ("sonnet", "Sonnet", "Alias for the latest Sonnet model"),
)
THINKING_BUDGETS: Final[dict[ChatEffort, int]] = {
    "low": 2_000,
    "medium": 8_000,
    "high": 16_000,
    "xhigh": 32_000,
    "max": 64_000,
}
DEFAULT_EFFORT: Final[ChatEffort] = "medium"
CLAUDE_EFFORTS: Final[tuple[ChatModelEffort, ...]] = tuple(
    ChatModelEffort(effort=effort, description=EFFORT_DESCRIPTIONS[effort]) for effort in EFFORT_ORDER
)


def known_effort(value: object) -> ChatEffort | None:
    text = str(value)
    return cast(ChatEffort, text) if text in KNOWN_EFFORTS else None


def claude_catalog() -> ChatModelCatalog:
    models = tuple(
        ChatModel(
            id=identifier,
            display_name=display_name,
            description=description,
            is_default=False,
            efforts=CLAUDE_EFFORTS,
            default_effort=DEFAULT_EFFORT,
        )
        for identifier, display_name, description in CLAUDE_ALIASES
    )
    return ChatModelCatalog(backend="claude", models=models, accepts_any_model=True, detail=CLAUDE_DETAIL)


def thinking_budget(effort: ChatEffort | None) -> int:
    return THINKING_BUDGETS[effort or DEFAULT_EFFORT]
