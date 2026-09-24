import { useEffect, useState } from "react"
import type { ApiDatasetRangePair, ApiDatasetRangePreview, FlowId } from "@/domain"
import { casesRouteApi } from "@/lib/routes"
import { messageOf } from "@/lib/errors"

export type RangeMissing = ApiDatasetRangePair["missing"][number]

export type PreviewResult = { readonly key: string; readonly preview: ApiDatasetRangePreview | null; readonly error: string | null }

export type RangeBlocker = { readonly caseName: string; readonly references: readonly string[] }

export type StageSpan = readonly [number, number]

const NAME_JOIN = "\u0000"
const LIST_JOIN = ", "

export const wholeSpan = (order: readonly string[]): StageSpan => [0, Math.max(0, order.length - 1)]

export const isWhole = (span: StageSpan, order: readonly string[]): boolean => span[0] === 0 && span[1] >= order.length - 1

export const withStart = (span: StageSpan, start: number): StageSpan => [start, Math.max(start, span[1])]

export const withEnd = (span: StageSpan, end: number): StageSpan => [Math.min(span[0], end), end]

export const rangeAt = (preview: ApiDatasetRangePreview | null, startNode: string | undefined, endNode: string | undefined): ApiDatasetRangePair | null => {
  if (preview === null || startNode === undefined || endNode === undefined) return null
  return preview.ranges.find((item) => item.start_node === startNode && item.end_node === endNode) ?? null
}

export const missingText = (missing: readonly RangeMissing[]): string | null => {
  if (missing.length === 0) return null
  return missing.map((item) => `${item.reference}${item.reason ? ` — ${item.reason}` : ""}`).join("; ")
}

export const blockersOf = (missing: readonly RangeMissing[]): readonly RangeBlocker[] => {
  const names = [...new Set(missing.map((item) => item.case_name))]
  return names.map((caseName) => ({
    caseName,
    references: [...new Set(missing.filter((item) => item.case_name === caseName).map((item) => item.reference))],
  }))
}

export const blockerText = (blockers: readonly RangeBlocker[]): string =>
  blockers.map((blocker) => `${blocker.caseName} (${blocker.references.join(LIST_JOIN)})`).join("; ")

export const blockerNames = (blockers: readonly RangeBlocker[]): string => blockers.map((blocker) => blocker.caseName).join(LIST_JOIN)

export function useRangePreview(flowId: FlowId, datasetId: string, caseNames: readonly string[]): PreviewResult | null {
  const { api } = casesRouteApi.useRouteContext()
  const names = caseNames.join(NAME_JOIN)
  const key = [flowId, datasetId, names].join(NAME_JOIN)
  const [result, setResult] = useState<PreviewResult | null>(null)

  useEffect(() => {
    if (names.length === 0) return
    let active = true
    void api.flow.datasetRange(flowId, datasetId, names.split(NAME_JOIN)).then(
      (preview) => {
        if (active) setResult({ key, preview, error: null })
      },
      (reason: unknown) => {
        if (active) setResult({ key, preview: null, error: messageOf(reason) })
      },
    )
    return () => {
      active = false
    }
  }, [api, flowId, datasetId, names, key])

  return result?.key === key ? result : null
}
