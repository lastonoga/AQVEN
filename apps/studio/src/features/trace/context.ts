import type { CallColumn, CallId, CallSheetTab, ColumnPath, MatrixGroup, ModelFamily } from "@/domain"
import { columnPath } from "@/data/ids"
import type { OpenPaths } from "@/lib/search"
import type { Translator } from "@/i18n/translator"

export type TraceVariant = "run" | "trace"

export type TraceScope = {
  readonly t: Translator
  readonly variant: TraceVariant
  readonly open: OpenPaths
  readonly onOpenCall: (callId: CallId, tab: CallSheetTab) => void
}

export type TraceContext = TraceScope & {
  readonly group: MatrixGroup
  readonly path: string
  readonly depth: number
  readonly headed: boolean
  readonly mixedFamilies: boolean
}

const MIXED_FAMILY_COUNT = 2

export const isHeaded = (group: MatrixGroup): boolean => group.rows.some((row) => row.key === "columns")

const modelFamily = (column: CallColumn): readonly ModelFamily[] => {
  const title = column.agent?.title
  if (title?.kind !== "model") return []
  return [title.family]
}

export const hasMixedFamilies = (group: MatrixGroup): boolean =>
  new Set(group.columns.flatMap(modelFamily)).size >= MIXED_FAMILY_COUNT

export const groupContext = (scope: TraceScope, group: MatrixGroup, path: string, depth: number): TraceContext => ({
  ...scope,
  group,
  path,
  depth,
  headed: isHeaded(group),
  mixedFamilies: hasMixedFamilies(group),
})

export const columnPathOf = (ctx: Pick<TraceContext, "path">, column: CallColumn): ColumnPath => columnPath(`${ctx.path}/${column.id}`)

export const isColumnOpen = (ctx: TraceContext, column: CallColumn): boolean => ctx.open.isOpen(columnPathOf(ctx, column))

export const openChildColumn = (ctx: TraceContext): CallColumn | undefined =>
  ctx.group.columns.find((column) => column.child !== undefined && isColumnOpen(ctx, column))
