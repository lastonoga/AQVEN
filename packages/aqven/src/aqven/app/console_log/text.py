from decimal import Decimal
from typing import Final

MILLISECONDS_PER_SECOND: Final = 1000
SECONDS_PER_MINUTE: Final = 60
ONE_LINE_LIMIT: Final = 160
ELLIPSIS: Final = "…"
MODEL_SEPARATORS: Final = (":", "/")
CENTS_PRECISION: Final = Decimal("0.01")
MICRO_PRECISION: Final = Decimal("0.0001")


def duration_text(milliseconds: int) -> str:
    if milliseconds < MILLISECONDS_PER_SECOND:
        return f"{milliseconds}ms"
    seconds = milliseconds / MILLISECONDS_PER_SECOND
    if seconds < SECONDS_PER_MINUTE:
        return f"{seconds:.1f}s"
    minutes, rest = divmod(round(seconds), SECONDS_PER_MINUTE)
    return f"{minutes}m {rest:02d}s"


def tokens_text(tokens_in: int, tokens_out: int) -> str | None:
    if not tokens_in and not tokens_out:
        return None
    return f"{tokens_in:,}→{tokens_out:,} tok"


def cost_text(usd: Decimal) -> str | None:
    if not usd:
        return None
    if usd >= 1:
        return f"${usd.quantize(CENTS_PRECISION):f}"
    if usd < MICRO_PRECISION:
        return f"<${MICRO_PRECISION:f}"
    return f"${usd.quantize(MICRO_PRECISION).normalize():f}"


def model_short(model: str | None) -> str | None:
    if not model:
        return None
    short = model
    for separator in MODEL_SEPARATORS:
        short = short.rsplit(separator, 1)[-1]
    return short or model


def one_line(text: str, limit: int = ONE_LINE_LIMIT) -> str:
    first = text.strip().splitlines()[0] if text.strip() else ""
    return first if len(first) <= limit else f"{first[: limit - 1]}{ELLIPSIS}"


def joined(*parts: str | None) -> str:
    return " · ".join(part for part in parts if part)


def plural(count: int, noun: str) -> str:
    return f"{count} {noun}" if count == 1 else f"{count} {noun}s"
