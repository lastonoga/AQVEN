from dataclasses import dataclass, field, replace

from aqven.chat.claude_wire import UsageWire
from aqven.ports.chat import ChatUsage


@dataclass(frozen=True, slots=True)
class MessageUsage:
    tokens_in: int = 0
    tokens_out: int = 0
    cache_read_tokens: int = 0
    cache_write_tokens: int = 0


def message_usage(wire: UsageWire) -> MessageUsage:
    return MessageUsage(
        tokens_in=wire.input_tokens,
        tokens_out=wire.output_tokens,
        cache_read_tokens=wire.cache_read_input_tokens or 0,
        cache_write_tokens=wire.cache_creation_input_tokens or 0,
    )


def _widest(earlier: MessageUsage, later: MessageUsage) -> MessageUsage:
    return MessageUsage(
        tokens_in=max(earlier.tokens_in, later.tokens_in),
        tokens_out=max(earlier.tokens_out, later.tokens_out),
        cache_read_tokens=max(earlier.cache_read_tokens, later.cache_read_tokens),
        cache_write_tokens=max(earlier.cache_write_tokens, later.cache_write_tokens),
    )


@dataclass(slots=True)
class TurnUsageMeter:
    settled: MessageUsage = field(default_factory=MessageUsage)
    current: MessageUsage = field(default_factory=MessageUsage)

    def begin_turn(self) -> None:
        self.settled = MessageUsage()
        self.current = MessageUsage()

    def begin_message(self, wire: UsageWire | None) -> None:
        self.settled = self._total()
        self.current = MessageUsage() if wire is None else replace(message_usage(wire), tokens_out=0)

    def advance(self, wire: UsageWire) -> None:
        self.current = _widest(self.current, message_usage(wire))

    def reported(self, model: str | None, thinking_tokens: int = 0) -> ChatUsage:
        total = self._total()
        return ChatUsage(
            model=model,
            tokens_in=total.tokens_in,
            tokens_out=total.tokens_out,
            thinking_tokens=thinking_tokens,
            cache_read_tokens=total.cache_read_tokens,
            cache_write_tokens=total.cache_write_tokens,
            cost_usd=None,
        )

    def _total(self) -> MessageUsage:
        return MessageUsage(
            tokens_in=self.settled.tokens_in + self.current.tokens_in,
            tokens_out=self.settled.tokens_out + self.current.tokens_out,
            cache_read_tokens=self.settled.cache_read_tokens + self.current.cache_read_tokens,
            cache_write_tokens=self.settled.cache_write_tokens + self.current.cache_write_tokens,
        )
