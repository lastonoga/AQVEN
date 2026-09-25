from typing import Protocol

from aqven.diagnostics import Diagnostic
from aqven.factors.draft import VariantDraft
from aqven.factors.model import FactorChange
from aqven.loader import SourceSpec
from aqven.spec import NodeSpec


class Factor(Protocol):
    def apply(
        self, draft: VariantDraft, change: FactorChange, slot: SourceSpec[NodeSpec]
    ) -> tuple[Diagnostic, ...]: ...
