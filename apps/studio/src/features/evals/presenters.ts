import type { Tone } from "@/components/studio"
import { count, joinMeta, runRef, score, seconds, usd } from "@/lib/format"
import type {
  CaseStatus,
  DatasetSummary,
  EvalCase,
  EvalRunRecord,
  EvalRunStatus,
  EvalSummary,
  GateDecision,
  ScorerSummary,
} from "./model"

const MS_PER_SECOND = 1000
const SUB_SECOND_MS = 1000
const RANGE_DASH = "–"
const CASE_KEY_SEPARATOR = "#"

export const EVAL_RUN_TONE: Readonly<Record<EvalRunStatus, Tone>> = {
  running: "primary",
  completed: "success",
  failed: "destructive",
}

export const CASE_TONE: Readonly<Record<CaseStatus, Tone>> = {
  ok: "success",
  failed: "destructive",
}

export const GATE_TONE: Readonly<Record<GateDecision, Tone>> = {
  PASS: "success",
  WARN: "warning",
  BLOCK: "destructive",
  GATE_UNAVAILABLE: "neutral",
}

export const decimalNumber = (raw: string): number => {
  const value = Number(raw)
  return Number.isFinite(value) ? value : 0
}

export const costText = (raw: string): string => usd(decimalNumber(raw))

export const targetText = (item: EvalSummary): string => joinMeta([item.inference, item.agent])

export const evalRef = (id: string): string => runRef(id)

export const caseKey = (row: EvalCase): string => `${row.case_name}${CASE_KEY_SEPARATOR}${String(row.run_index)}`

export const isCase = (row: EvalCase, name: string | null, repeat: number | null): boolean => {
  if (row.case_name !== name) return false
  return repeat === null || row.run_index === repeat
}

export const latencyText = (latencyMs: number): string =>
  latencyMs < SUB_SECOND_MS ? `${count(latencyMs)} ms` : seconds(latencyMs / MS_PER_SECOND)

export const durationText = (startedAt: string, finishedAt: string | null | undefined): string | null => {
  if (finishedAt === null || finishedAt === undefined) return null
  const start = Date.parse(startedAt)
  const end = Date.parse(finishedAt)
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null
  return latencyText(Math.max(0, end - start))
}

export const tokensText = (tokensIn: number, tokensOut: number): string => `${count(tokensIn)} / ${count(tokensOut)}`

export const meanText = (scorer: ScorerSummary, none: string): string => (scorer.n === 0 ? none : score(scorer.mean))

export const passRateText = (scorer: ScorerSummary, none: string): string =>
  scorer.pass_rate === null || scorer.pass_rate === undefined ? none : score(scorer.pass_rate)

export const rangeText = (scorer: ScorerSummary, none: string): string =>
  scorer.n === 0 ? none : `${score(scorer.minimum)} ${RANGE_DASH} ${score(scorer.maximum)}`

export const splitsText = (dataset: DatasetSummary, none: string): string => {
  const parts = Object.entries(dataset.splits).map(([name, size]) => `${name} ${count(size)}`)
  return parts.length === 0 ? none : joinMeta(parts)
}

export const usedByText = (dataset: DatasetSummary, none: string): string =>
  dataset.used_by.length === 0 ? none : joinMeta(dataset.used_by)

export const scoresText = (row: EvalCase, none: string): string =>
  row.scores.length === 0 ? none : joinMeta(row.scores.map((entry) => `${entry.scorer_id} ${score(entry.value)}`))

export const scorerMeansText = (run: EvalRunRecord, none: string): string => {
  const scored = run.scorers.filter((scorer) => scorer.n > 0)
  return scored.length === 0 ? none : joinMeta(scored.map((scorer) => `${scorer.scorer_id} ${score(scorer.mean)}`))
}

export const outputText = (output: unknown): string | null => {
  if (output === null || output === undefined) return null
  const text = JSON.stringify(output, null, 2)
  if (text === "{}" || text === "[]" || text === '""') return null
  return text
}

export const gateNumber = (value: number | null | undefined, none: string): string =>
  value === null || value === undefined ? none : score(value)
