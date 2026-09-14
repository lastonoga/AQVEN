import type { RunStep } from "./run-steps.js"

export type SignalKind = "error" | "check" | "empty" | "slow" | "stub"

export type Signal = { kind: SignalKind; glyph: string; title: string }

export type Bar = { left: number; width: number; running: boolean }

export type Column = "tokens" | "cost" | "checks"

export type Window = { from: number; span: number }

export type TableRow = { step: RunStep; signal: Signal | null; bar: Bar | null }

export type Table = {
  rows: TableRow[]
  window: Window | null
  columns: ReadonlySet<Column>
  counts: ReadonlyMap<SignalKind, number>
}

const MIN_WIDTH = 0.8

const SLOW_FLOOR = 40

const SLOW_SHARE = 0.9

export const GLYPHS: Readonly<Record<SignalKind, string>> = {
  error: "✗",
  check: "!",
  empty: "∅",
  slow: "⏱",
  stub: "~",
}

export const SIGNAL_LABELS: Readonly<Record<SignalKind, string>> = {
  error: "ошибка",
  check: "проверка не прошла",
  empty: "пустой выход",
  slow: "медленнее остальных",
  stub: "заглушка исполнителя",
}

export const SIGNAL_TONES: Readonly<Record<SignalKind, string>> = {
  error: "text-red-400",
  check: "text-orange-400",
  empty: "text-amber-400",
  slow: "text-sky-400",
  stub: "text-slate-500",
}

const isEmptyValue = (value: unknown): boolean => {
  if (value === null || value === undefined || value === "") return true
  if (Array.isArray(value)) return value.length === 0
  if (typeof value !== "object") return false
  return Object.keys(value as Record<string, unknown>).length === 0
}

const percentile = (values: readonly number[], share: number): number | null => {
  if (values.length === 0) return null
  const sorted = [...values].sort((left, right) => left - right)
  const at = Math.min(sorted.length - 1, Math.floor(sorted.length * share))
  return sorted[at] ?? null
}

type Rule = { kind: SignalKind; hit: (step: RunStep, slow: number | null) => boolean; detail: (step: RunStep) => string }

const RULES: readonly Rule[] = [
  {
    kind: "error",
    hit: (step) => step.status === "error",
    detail: (step) => step.error ?? "шаг завершился ошибкой",
  },
  {
    kind: "check",
    hit: (step) => step.checks.some((check) => check.ok === false),
    detail: (step) =>
      step.checks
        .filter((check) => check.ok === false)
        .map((check) => [check.name, check.message].filter((part) => part !== "").join(": "))
        .join("\n"),
  },
  {
    kind: "empty",
    hit: (step) => step.status === "ok" && isEmptyValue(step.output),
    detail: () => "шаг завершился успешно, но выход пуст",
  },
  {
    kind: "slow",
    hit: (step, slow) => slow !== null && step.durationMs !== null && step.durationMs >= slow,
    detail: (step) => `${step.durationMs} мс — дольше девяти десятых шагов прогона`,
  },
  {
    kind: "stub",
    hit: (step) => step.simplifications.length > 0,
    detail: (step) => step.simplifications.join("\n"),
  },
]

export const signalOf = (step: RunStep, slow: number | null): Signal | null => {
  const rule = RULES.find((entry) => entry.hit(step, slow))
  if (rule === undefined) return null
  return { kind: rule.kind, glyph: GLYPHS[rule.kind], title: `${SIGNAL_LABELS[rule.kind]}: ${rule.detail(step)}` }
}

export const slowFloorOf = (steps: readonly RunStep[]): number | null => {
  const durations = steps.flatMap((step) => (step.durationMs === null ? [] : [step.durationMs]))
  if (durations.length < 5) return null
  const cut = percentile(durations, SLOW_SHARE)
  if (cut === null) return null
  return Math.max(cut, SLOW_FLOOR)
}

export const windowOf = (steps: readonly RunStep[], now: number): Window | null => {
  const starts = steps.flatMap((step) => (step.startedAt === null ? [] : [step.startedAt]))
  if (starts.length === 0) return null
  const from = Math.min(...starts)
  const ends = steps.flatMap((step) => {
    if (step.startedAt === null) return []
    if (step.durationMs === null) return [Math.max(step.startedAt, now)]
    return [step.startedAt + step.durationMs]
  })
  return { from, span: Math.max(Math.max(...ends) - from, 1) }
}

export const barOf = (step: RunStep, window: Window | null, now: number): Bar | null => {
  if (window === null || step.startedAt === null) return null
  const running = step.durationMs === null && step.status === "running"
  const end = step.durationMs === null ? Math.max(step.startedAt, now) : step.startedAt + step.durationMs
  const left = ((step.startedAt - window.from) / window.span) * 100
  const width = Math.max(((end - step.startedAt) / window.span) * 100, MIN_WIDTH)
  return { left: Math.min(left, 100 - MIN_WIDTH), width: Math.min(width, 100 - left), running }
}

const HAS: Readonly<Record<Column, (step: RunStep) => boolean>> = {
  tokens: (step) => step.metrics.totalTokens !== null,
  cost: (step) => step.metrics.costUsd !== null,
  checks: (step) => step.checks.length > 0,
}

export const columnsOf = (steps: readonly RunStep[]): Set<Column> =>
  new Set((Object.keys(HAS) as Column[]).filter((column) => steps.some(HAS[column])))

export const buildTable = (steps: readonly RunStep[], now: number): Table => {
  const slow = slowFloorOf(steps)
  const window = windowOf(steps, now)
  const rows = steps.map((step) => ({ step, signal: signalOf(step, slow), bar: barOf(step, window, now) }))
  const counts = new Map<SignalKind, number>()
  for (const row of rows) {
    if (row.signal === null) continue
    counts.set(row.signal.kind, (counts.get(row.signal.kind) ?? 0) + 1)
  }
  return { rows, window, columns: columnsOf(steps), counts }
}

export const filtered = (table: Table, kinds: ReadonlySet<SignalKind>): TableRow[] => {
  if (kinds.size === 0) return table.rows
  return table.rows.filter((row) => row.signal !== null && kinds.has(row.signal.kind))
}
