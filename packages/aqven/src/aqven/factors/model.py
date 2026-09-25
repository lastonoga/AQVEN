from dataclasses import dataclass

from aqven.diagnostics import Diagnostic
from aqven.loader import LoadedProject
from aqven.spec import FactorKind, FlowId, NodeId, VariantId


@dataclass(frozen=True, slots=True, order=True)
class FactorChange:
    node_id: NodeId
    what: FactorKind
    value: str


@dataclass(frozen=True, slots=True)
class AssembledVariant:
    variant_id: VariantId
    flow_id: FlowId
    project: LoadedProject
    changes: tuple[FactorChange, ...]


@dataclass(frozen=True, slots=True)
class AssemblyFailure:
    variant_id: VariantId
    diagnostics: tuple[Diagnostic, ...]


type VariantAssembly = AssembledVariant | AssemblyFailure
