import type { NodeKind } from "@/domain"
import type { CallColumn, StageRun } from "./model"

export type ItemFailures = { readonly failed: number; readonly total: number }

const ITEM_CONTAINERS: ReadonlySet<NodeKind> = new Set<NodeKind>(["map", "parallel"])

const isFailed = (column: CallColumn): boolean => column.status === "failed" && column.recovery === null

const stageColumns = (stage: StageRun): readonly CallColumn[] =>
  stage.fanOut === 0 ? [] : stage.groups.flatMap((group) => group.columns)

export const itemFailures = (kind: NodeKind, columns: readonly CallColumn[]): ItemFailures | null => {
  if (!ITEM_CONTAINERS.has(kind)) return null
  const failed = columns.filter(isFailed).length
  if (failed === 0) return null
  return { failed, total: columns.length }
}

export const failedBelow = (columns: readonly CallColumn[]): number =>
  columns.reduce((sum, column) => sum + (isFailed(column) ? 1 : 0) + failedBelow(column.child?.group.columns ?? []), 0)

export const stageItemFailures = (stage: StageRun): ItemFailures | null => itemFailures(stage.kind, stageColumns(stage))

export const stageFailedBelow = (stage: StageRun): number => failedBelow(stageColumns(stage))
