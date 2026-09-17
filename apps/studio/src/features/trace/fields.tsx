import type { ReactNode } from "react"
import type { CallColumn, MatrixGroup, RowKey, RowSpec } from "@/domain"
import { MatrixCell, ROW_SHEET_TAB, type CellBlock, type MatrixField, type MatrixSpanField } from "@/components/studio"
import { ROW_CELLS } from "./cells"
import type { TraceContext } from "./context"
import { inputBlocks, promptBlocks } from "./io-cells"
import { outputPaint } from "./paint"
import { groupHasParts, rowEmphasis, rowGround, rowSub } from "./row-sub"
import { summaryCells } from "./summary"

export type CallField = MatrixField<CallColumn> | MatrixSpanField

type FieldBase = Pick<MatrixField<CallColumn>, "id" | "label" | "sub" | "emphasis" | "ground">

type SharedCells = Partial<Readonly<Record<RowKey, (group: MatrixGroup, ctx: TraceContext) => readonly CellBlock[] | undefined>>>

const NESTED_WIDTH = 190
const PARTS_WIDTH = 210
const DEFAULT_WIDTH = 170

const SHARED_CELLS: SharedCells = {
  input: (group, ctx) => (group.shared?.input === undefined ? undefined : inputBlocks(group.shared.input, ctx, true)),
  prompt: (group) => (group.shared?.prompt === undefined ? undefined : promptBlocks(group.shared.prompt)),
}

export const columnWidth = (group: MatrixGroup, depth: number): number => {
  if (depth > 1) return NESTED_WIDTH
  return groupHasParts(group) ? PARTS_WIDTH : DEFAULT_WIDTH
}

const cell = (blocks: readonly CellBlock[]): ReactNode => <MatrixCell blocks={blocks} />

const fieldBase = (row: RowSpec, ctx: TraceContext): FieldBase => {
  const sub = rowSub(row, ctx.group, ctx.t)
  const base: FieldBase = {
    id: row.key,
    label: ctx.t(`domain.matrixRow.${row.key}`),
    emphasis: rowEmphasis(row.key, ctx.headed),
    ground: rowGround(row.key, ctx.headed),
  }
  return sub === undefined ? base : { ...base, sub }
}

const itemActivation = (key: RowKey, ctx: TraceContext): Pick<MatrixField<CallColumn>, "onActivate"> => {
  const tab = ROW_SHEET_TAB[key]
  if (tab === null) return {}
  return {
    onActivate: (column) => {
      ctx.onOpenCall(column.callId, tab)
    },
  }
}

const spanActivation = (key: RowKey, ctx: TraceContext): Pick<MatrixSpanField, "onActivate"> => {
  const tab = ROW_SHEET_TAB[key]
  const first = ctx.group.columns[0]
  if (tab === null || first === undefined) return {}
  return {
    onActivate: () => {
      ctx.onOpenCall(first.callId, tab)
    },
  }
}

const outputPaintOf = (key: RowKey, ctx: TraceContext): Pick<MatrixField<CallColumn>, "paint"> => {
  if (key !== "output") return {}
  return { paint: (column) => outputPaint(column, ctx.headed) }
}

const itemField = (row: RowSpec, ctx: TraceContext): MatrixField<CallColumn> => ({
  ...fieldBase(row, ctx),
  render: (column) => cell(ROW_CELLS[row.key](column, ctx)),
  ...itemActivation(row.key, ctx),
  ...outputPaintOf(row.key, ctx),
})

const spanField = (row: RowSpec, blocks: readonly CellBlock[], ctx: TraceContext): MatrixSpanField => ({
  ...fieldBase(row, ctx),
  kind: "span",
  render: () => cell(blocks),
  ...spanActivation(row.key, ctx),
})

const fieldOf = (row: RowSpec, ctx: TraceContext): CallField => {
  const shared = SHARED_CELLS[row.key]?.(ctx.group, ctx)
  if (shared === undefined) return itemField(row, ctx)
  return spanField(row, shared, ctx)
}

export const callFields = (ctx: TraceContext): readonly CallField[] => ctx.group.rows.map((row) => fieldOf(row, ctx))

export const summaryTrailing = (group: MatrixGroup, ctx: TraceContext): ((fieldId: string) => ReactNode) | undefined => {
  const summary = group.summary
  if (summary === undefined) return undefined
  const cells = new Map<string, readonly CellBlock[]>(group.rows.map((row) => [row.key, summaryCells(summary, row.key, ctx.t)]))
  return (fieldId) => cell(cells.get(fieldId) ?? [])
}
