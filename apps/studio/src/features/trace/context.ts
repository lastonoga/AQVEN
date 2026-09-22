import type { ApiExecutionAddress } from "@/domain"
import type { Translator } from "@/i18n/translator"
import type { CallColumn, MatrixGroup, RowKey } from "./model"

export type OpenPaths = {
  readonly isOpen: (path: string) => boolean
  readonly toggle: (path: string) => void
}

export type TraceScope = {
  readonly t: Translator
  readonly open: OpenPaths
  readonly onOpenCall: (address: ApiExecutionAddress, row: RowKey) => void
  readonly selected: string | null
}

export type TraceContext = TraceScope & {
  readonly group: MatrixGroup
  readonly depth: number
}

export const groupContext = (scope: TraceScope, group: MatrixGroup, depth: number): TraceContext => ({ ...scope, group, depth })

export const isColumnOpen = (ctx: TraceContext, column: CallColumn): boolean => ctx.open.isOpen(column.id)

export const openChildColumn = (ctx: TraceContext): CallColumn | undefined =>
  ctx.group.columns.find((column) => column.child !== null && isColumnOpen(ctx, column))
