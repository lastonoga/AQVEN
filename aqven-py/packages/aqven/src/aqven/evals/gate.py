from enum import StrEnum
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field


class GateDecision(StrEnum):
    PASS = "PASS"
    WARN = "WARN"
    BLOCK = "BLOCK"
    GATE_UNAVAILABLE = "GATE_UNAVAILABLE"


type GateFamily = Literal["primary", "secondary", "safety"]

REPORT_CONFIG = ConfigDict(extra="forbid", frozen=True)


class GateTestResult(BaseModel):
    model_config = REPORT_CONFIG
    node_id: str | None
    scorer_id: str
    family: GateFamily
    n: Annotated[int, Field(ge=0)]
    n_discordant: Annotated[int, Field(ge=0)] | None
    n_ties: Annotated[int, Field(ge=0)] | None
    delta: float
    ci_lo: float
    ci_hi: float
    p_raw: Annotated[float, Field(ge=0, le=1)] | None
    p_adj: Annotated[float, Field(ge=0, le=1)] | None
    q_adj: Annotated[float, Field(ge=0, le=1)] | None
    method: str
    dz: float | None
    wins: Annotated[int, Field(ge=0)]
    losses: Annotated[int, Field(ge=0)]
    ties: Annotated[int, Field(ge=0)]
    noise_floor: float | None
    verdict: GateDecision


class GateReport(BaseModel):
    model_config = REPORT_CONFIG
    decision: GateDecision
    reason_code: str | None
    spec_a_hash: str
    spec_b_hash: str
    gate_config_hash: str
    seeds: tuple[int, ...]
    repeats: Annotated[int, Field(ge=1)]
    per_test: tuple[GateTestResult, ...]
    dropped_cases: tuple[str, ...]
    content_hash: str
