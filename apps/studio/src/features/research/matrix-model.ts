import type { ExperimentQuestion, MatrixRow, MetricCell, MetricColumn, MetricId, MetricUnit, SeriesMatrix, StabilityClass, StabilityRow } from "@/domain"

export type ColumnScale = { readonly low: number; readonly high: number }

export type Whisker = { readonly point: number; readonly low: number | null; readonly high: number | null }

export type MatrixColumnView = {
  readonly column: MetricColumn
  readonly scale: ColumnScale | null
  readonly marks: readonly number[]
}

export type StabilityShare = { readonly kind: StabilityClass; readonly count: number; readonly share: number }

type UnitBounds = { readonly min: number | null; readonly max: number | null; readonly pad: number }

const EDGE_SHARE = 0.08
const FULL = 100

const UNIT_BOUNDS: Readonly<Record<MetricUnit, UnitBounds>> = {
  rate: { min: 0, max: 1, pad: 0.05 },
  score: { min: 0, max: 1, pad: 0.05 },
  ordinal: { min: null, max: null, pad: 0.5 },
  usd: { min: 0, max: null, pad: 0.0005 },
  ms: { min: 0, max: null, pad: 100 },
}

export const STABILITY_ORDER: readonly StabilityClass[] = ["always", "flaky", "never"]

const cellValues = (cell: MetricCell | undefined): readonly number[] =>
  [cell?.value ?? null, cell?.ciLow ?? null, cell?.ciHigh ?? null].filter((value): value is number => value !== null)

const clampTo = (value: number, bound: number | null, pick: (left: number, right: number) => number): number => (bound === null ? value : pick(value, bound))

export const cellAt = (row: MatrixRow, metric: MetricId): MetricCell | undefined => row.cells.find((cell) => cell.metric === metric)

export const columnMarks = (question: ExperimentQuestion, column: MetricColumn): readonly number[] => {
  if (question.kind !== "threshold" || column.role !== "primary") return []
  return [question.value]
}

export const columnScale = (column: MetricColumn, rows: readonly MatrixRow[], marks: readonly number[]): ColumnScale | null => {
  const values = [...rows.flatMap((row) => cellValues(cellAt(row, column.id))), ...marks]
  if (values.length === 0) return null
  const bounds = UNIT_BOUNDS[column.unit]
  const low = Math.min(...values)
  const high = Math.max(...values)
  const pad = high > low ? (high - low) * EDGE_SHARE : Math.max(Math.abs(low) * EDGE_SHARE, bounds.pad)
  return { low: clampTo(low - pad, bounds.min, Math.max), high: clampTo(high + pad, bounds.max, Math.min) }
}

export const positionOf = (value: number, scale: ColumnScale): number => {
  const span = scale.high - scale.low
  if (span <= 0) return FULL / 2
  return Math.min(FULL, Math.max(0, ((value - scale.low) / span) * FULL))
}

export const whiskerOf = (cell: MetricCell | undefined, scale: ColumnScale | null): Whisker | null => {
  if (cell === undefined || cell.value === null || scale === null) return null
  const point = positionOf(cell.value, scale)
  const { ciLow, ciHigh } = cell
  if (ciLow === null || ciHigh === null) return { point, low: null, high: null }
  return { point, low: positionOf(ciLow, scale), high: positionOf(ciHigh, scale) }
}

export const matrixColumns = (matrix: SeriesMatrix, question: ExperimentQuestion): readonly MatrixColumnView[] =>
  matrix.columns.map((column) => {
    const marks = columnMarks(question, column)
    return { column, marks, scale: columnScale(column, matrix.rows, marks) }
  })

export const stabilityShares = (row: StabilityRow): readonly StabilityShare[] => {
  const total = row.always + row.flaky + row.never
  return STABILITY_ORDER.map((kind) => ({ kind, count: row[kind], share: total === 0 ? 0 : (row[kind] / total) * FULL }))
}
