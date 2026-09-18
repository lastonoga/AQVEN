import type { components } from "@/api/schema"

type S = components["schemas"]

export type EvalSummary = S["EvalSummary"]
export type DatasetSummary = S["DatasetSummary"]
export type EvalRunRecord = S["EvalRunRecord"]
export type EvalRunStatus = S["EvalRunStatus"]
export type EvalCase = S["CaseRecord"]
export type CaseStatus = S["CaseStatus"]
export type CaseScore = S["ScoreRecord"]
export type ScorerSummary = S["ScorerSummary"]
export type GateReport = S["GateReport"]
export type GateTest = S["GateTestResult"]
export type GateDecision = S["GateDecision"]

export type EvalsData = {
  readonly evals: readonly EvalSummary[]
  readonly selected: EvalSummary | null
  readonly dataset: DatasetSummary | null
  readonly runs: readonly EvalRunRecord[]
  readonly run: EvalRunRecord | null
  readonly cases: readonly EvalCase[]
  readonly gate: GateReport | null
  readonly caseName: string | null
  readonly caseRepeat: number | null
}
