import type { BuiltinMetric, MetricColumn, MetricDirection, MetricId, MetricUnit } from "@/domain"
import { isBuiltinMetric } from "@/domain"
import { fixed, usd } from "@/lib/format"

export type BuiltinNames = (metric: BuiltinMetric) => string

const MS_PER_SECOND = 1000
const PERCENT = 100
const RANGE_DASH = "–"
const FALLBACK_UNIT: MetricUnit = "score"

const UNIT_TEXT: Readonly<Record<MetricUnit, (value: number) => string>> = {
  rate: (value) => fixed(value, 2),
  score: (value) => fixed(value, 2),
  ordinal: (value) => fixed(value, 1),
  usd: (value) => usd(value, 4),
  ms: (value) => `${fixed(value / MS_PER_SECOND, 2)} s`,
}

const DIRECTION_GLYPH: Readonly<Record<MetricDirection, string>> = {
  higher_is_better: "↑",
  lower_is_better: "↓",
}

export const metricName = (metric: MetricId, builtin: BuiltinNames): string => (isBuiltinMetric(metric) ? builtin(metric) : metric)

export const metricValue = (value: number, unit: MetricUnit): string => UNIT_TEXT[unit](value)

export const marginText = (margin: number, unit: MetricUnit, relative: boolean): string =>
  relative ? `${String(Math.round(margin * PERCENT))}%` : metricValue(margin, unit)

const PLUS = "+"
const MINUS = "−"

export const signedValue = (value: number, unit: MetricUnit): string => `${value < 0 ? MINUS : PLUS}${metricValue(Math.abs(value), unit)}`

export const intervalText = (low: number, high: number, unit: MetricUnit): string => `${metricValue(low, unit)}${RANGE_DASH}${metricValue(high, unit)}`

export const directionGlyph = (direction: MetricDirection): string => DIRECTION_GLYPH[direction]

export const columnOf = (columns: readonly MetricColumn[], metric: MetricId): MetricColumn | null => columns.find((column) => column.id === metric) ?? null

export const unitOf = (columns: readonly MetricColumn[], metric: MetricId): MetricUnit => columnOf(columns, metric)?.unit ?? FALLBACK_UNIT
