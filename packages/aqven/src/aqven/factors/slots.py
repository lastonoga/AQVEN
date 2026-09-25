from collections.abc import Mapping
from dataclasses import dataclass
from typing import Final

from aqven.spec import NODE_SPEC_CLASSES, CallNodeSpec, FactorKind, LlmNodeSpec, NodeBase, NodeSpec


@dataclass(frozen=True, slots=True)
class SlotKind:
    label: str
    classes: tuple[type[NodeBase], ...]

    def accepts(self, spec: NodeSpec) -> bool:
        return isinstance(spec, self.classes)


LLM_SLOT: Final = SlotKind("llm", (LlmNodeSpec,))
CALL_SLOT: Final = SlotKind("call", (CallNodeSpec,))
ANY_SLOT: Final = SlotKind("any", NODE_SPEC_CLASSES)

FACTOR_SLOTS: Final[Mapping[FactorKind, SlotKind]] = {
    FactorKind.AGENT: LLM_SLOT,
    FactorKind.PROMPT: LLM_SLOT,
    FactorKind.USE: ANY_SLOT,
    FactorKind.FLOW: CALL_SLOT,
}


def slot_kind(what: FactorKind) -> SlotKind:
    return FACTOR_SLOTS[what]
