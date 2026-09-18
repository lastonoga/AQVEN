import type { ReactNode } from "react"
import { MatrixCell, type CellBlock, type MatrixField } from "@/components/studio"
import { ROW_CELLS } from "./cells"
import type { TraceContext } from "./context"
import type { CallColumn, RowSpec } from "./model"
import { outputPaint } from "./paint"
import { rowEmphasis, rowGround, rowSub } from "./row-sub"

export type CallField = MatrixField<CallColumn>

const NESTED_WIDTH = 190
const DEFAULT_WIDTH = 210

export const columnWidth = (depth: number): number => (depth > 1 ? NESTED_WIDTH : DEFAULT_WIDTH)

const cell = (blocks: readonly CellBlock[]): ReactNode => <MatrixCell blocks={blocks} />

const fieldSub = (row: RowSpec, ctx: TraceContext): Pick<CallField, "sub"> => {
  const sub = rowSub(row.key, ctx.group, ctx.t)
  return sub === undefined ? {} : { sub }
}

const fieldPaint = (row: RowSpec): Pick<CallField, "paint"> => (row.key === "output" ? { paint: outputPaint } : {})

const fieldActivation = (row: RowSpec): Pick<CallField, "isActivatable"> =>
  row.key === "call" ? { isActivatable: (column) => column.child === null } : {}

const fieldOf = (row: RowSpec, ctx: TraceContext): CallField => ({
  id: row.key,
  label: ctx.t(`trace.matrixRow.${row.key}`),
  emphasis: rowEmphasis(row.key),
  ground: rowGround(row.key),
  render: (column) => cell(ROW_CELLS[row.key](column, ctx)),
  onActivate: (column) => {
    ctx.onOpenCall(column.address, row.key)
  },
  activationLabel: (column) => ctx.t("trace.openCell", { row: ctx.t(`trace.matrixRow.${row.key}`), name: column.name }),
  interactiveContent: row.key === "input" || row.key === "output",
  ...fieldSub(row, ctx),
  ...fieldPaint(row),
  ...fieldActivation(row),
})

export const callFields = (ctx: TraceContext): readonly CallField[] => ctx.group.rows.map((row) => fieldOf(row, ctx))
