import type { ServerPhase } from "@/api/ready"
import type { CheckState, StatusCheck, StatusCheckId } from "@/api/server"
import type { Tone } from "@/components/studio"
import { HEALTH_EVERY_MS, isDown, type HealthSnapshot, type StatusReading } from "./monitor"

export type SummaryLabel = "checking" | "connected" | "attention" | "starting" | "stopping" | "disconnected"

export type Summary = { readonly label: SummaryLabel; readonly tone: Tone }

export type CheckReason = "projectErrors" | "projectQuarantined" | "projectWarnings" | "projectIndexing" | "modelKeysMissing"

export type CheckLine =
  | { readonly kind: "state"; readonly check: StatusCheckId; readonly state: CheckState }
  | { readonly kind: "reason"; readonly reason: CheckReason; readonly count: number; readonly names: readonly string[] }

export type CheckRow = { readonly id: StatusCheckId; readonly tone: Tone; readonly lines: readonly CheckLine[] }

type ReasonRule = {
  readonly reason: CheckReason
  readonly check: StatusCheckId
  readonly count: (check: StatusCheck) => number
  readonly named: boolean
}

export const RETRY_SECONDS = HEALTH_EVERY_MS / 1000

export const START_COMMAND = "uv run aqven dev"

const STATE_RANK: Readonly<Record<CheckState, number>> = { ok: 0, warning: 1, error: 2 }

export const STATE_TONE: Readonly<Record<CheckState, Tone>> = { ok: "success", warning: "warning", error: "destructive" }

const STATE_LABEL: Readonly<Record<CheckState, SummaryLabel>> = { ok: "connected", warning: "attention", error: "attention" }

const PHASE_LABEL: Readonly<Record<ServerPhase, SummaryLabel>> = { ready: "connected", starting: "starting", stopping: "stopping" }

const DISCONNECTED: Summary = { label: "disconnected", tone: "destructive" }

const CHECKING: Summary = { label: "checking", tone: "neutral" }

const SHELL_SAFE = /^[\w@%+=:,./-]+$/

const countAt =
  (key: string) =>
  (check: StatusCheck): number =>
    check.counts[key] ?? 0

const namedCount =
  (key: string) =>
  (check: StatusCheck): number =>
    Math.max(check.names.length, check.counts[key] ?? 0)

const REASON_RULES: readonly ReasonRule[] = [
  { reason: "projectErrors", check: "project", count: countAt("errors"), named: false },
  { reason: "projectQuarantined", check: "project", count: namedCount("quarantined"), named: true },
  { reason: "projectWarnings", check: "project", count: countAt("warnings"), named: false },
  { reason: "projectIndexing", check: "project", count: countAt("pending"), named: false },
  { reason: "modelKeysMissing", check: "model_keys", count: namedCount("missing"), named: true },
]

export const worstState = (states: readonly CheckState[]): CheckState =>
  states.reduce<CheckState>((worst, state) => (STATE_RANK[state] > STATE_RANK[worst] ? state : worst), "ok")

const readingState = (reading: StatusReading): CheckState => {
  if (reading.kind === "loaded") return worstState(reading.status.checks.map((check) => check.state))
  return reading.kind === "failed" ? "warning" : "ok"
}

export const summaryOf = (snapshot: HealthSnapshot): Summary => {
  if (isDown(snapshot)) return DISCONNECTED
  if (snapshot.seen === null) return CHECKING
  const phase = snapshot.seen.health.status
  if (phase !== "ready") return { label: PHASE_LABEL[phase], tone: "warning" }
  const state = readingState(snapshot.status)
  return { label: STATE_LABEL[state], tone: STATE_TONE[state] }
}

const reasonLine = (check: StatusCheck, rule: ReasonRule): CheckLine | null => {
  const count = rule.count(check)
  if (rule.check !== check.id || count === 0) return null
  if (rule.named && check.names.length === 0) return null
  return { kind: "reason", reason: rule.reason, count, names: rule.named ? check.names : [] }
}

export const linesOf = (check: StatusCheck): readonly CheckLine[] => {
  const stateLine: CheckLine = { kind: "state", check: check.id, state: check.state }
  if (check.state === "ok") return [stateLine]
  const reasons = REASON_RULES.flatMap((rule) => reasonLine(check, rule) ?? [])
  return reasons.length === 0 ? [stateLine] : reasons
}

export const rowsOf = (checks: readonly StatusCheck[]): readonly CheckRow[] =>
  checks.map((check) => ({ id: check.id, tone: STATE_TONE[check.state], lines: linesOf(check) }))

const shellWord = (word: string): string => (SHELL_SAFE.test(word) ? word : `'${word.replaceAll("'", `'\\''`)}'`)

export const startCommand = (root: string): string => `${START_COMMAND} ${shellWord(root)}`
