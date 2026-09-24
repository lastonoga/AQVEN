import { useState } from "react"
import type { ApiDatasetRangePair, FlowId, NodeRange } from "@/domain"
import * as ids from "@/data/ids"
import { isWhole, rangeAt, useRangePreview, wholeSpan, type PreviewResult, type StageSpan } from "./range-preview"

export type LookRange = {
  readonly order: readonly string[]
  readonly span: StageSpan
  readonly setSpan: (next: StageSpan) => void
  readonly result: PreviewResult | null
  readonly current: ApiDatasetRangePair | null
  readonly stages: NodeRange | null
  readonly ready: boolean
}

const NO_NAMES: readonly string[] = []

const stagesAt = (order: readonly string[], span: StageSpan): NodeRange | null => {
  const start = order[span[0]]
  const end = order[span[1]]
  if (isWhole(span, order) || start === undefined || end === undefined) return null
  return { from: ids.nodeId(start), to: ids.nodeId(end) }
}

export function useLookRange(flowId: FlowId, datasetId: string | null, caseNames: readonly string[], order: readonly string[]): LookRange {
  const [span, setSpan] = useState<StageSpan>(() => wholeSpan(order))
  const result = useRangePreview(flowId, datasetId ?? "", datasetId === null ? NO_NAMES : caseNames)
  const current = rangeAt(result?.preview ?? null, order[span[0]], order[span[1]])
  const stages = stagesAt(order, span)
  const ready = datasetId !== null && caseNames.length > 0 && (stages === null || current?.available === true)
  return { order, span, setSpan, result, current, stages, ready }
}
