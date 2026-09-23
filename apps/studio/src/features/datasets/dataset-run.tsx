import { useEffect, useState } from "react"
import { useNavigate } from "@tanstack/react-router"
import { Play } from "lucide-react"
import { useTranslations } from "use-intl"
import type { ApiDatasetCase, ApiDatasetRangePair, ApiDatasetRangePreview, ApiDatasetSummary, FlowId } from "@/domain"
import { Text, TitledPanel } from "@/components/studio"
import { StageRangeTimeline } from "@/components/studio/stage-range-timeline"
import { Button } from "@/components/ui/button"
import * as ids from "@/data/ids"
import { datasetsRouteApi, ROUTE_PATH } from "@/lib/routes"

type RangeMissing = ApiDatasetRangePair["missing"][number]
type PreviewResult = { readonly key: string; readonly preview: ApiDatasetRangePreview | null; readonly error: string | null }

type DatasetRunProps = {
  readonly flowId: FlowId
  readonly dataset: ApiDatasetSummary
  readonly caseItem: ApiDatasetCase
  readonly order: readonly string[]
}

const rangeAt = (preview: ApiDatasetRangePreview | null, startNode: string | undefined, endNode: string | undefined): ApiDatasetRangePair | null => {
  if (preview === null || startNode === undefined || endNode === undefined) return null
  return preview.ranges.find((item) => item.start_node === startNode && item.end_node === endNode) ?? null
}

const missingText = (missing: readonly RangeMissing[]): string | null => {
  if (missing.length === 0) return null
  return missing.map((item) => `${item.case_name}: ${item.reference}${item.reason ? ` — ${item.reason}` : ""}`).join("; ")
}

function useRangePreview(flowId: FlowId, datasetId: string, caseName: string): PreviewResult | null {
  const { api } = datasetsRouteApi.useRouteContext()
  const key = [flowId, datasetId, caseName].join("\u0001")
  const [result, setResult] = useState<PreviewResult | null>(null)

  useEffect(() => {
    let active = true
    void api.flow.datasetRange(flowId, datasetId, [caseName]).then(
      (preview) => {
        if (active) setResult({ key, preview, error: null })
      },
      (reason: unknown) => {
        if (active) setResult({ key, preview: null, error: reason instanceof Error ? reason.message : String(reason) })
      },
    )
    return () => { active = false }
  }, [api, flowId, datasetId, caseName, key])

  return result?.key === key ? result : null
}

export function DatasetRun({ flowId, dataset, caseItem, order }: DatasetRunProps) {
  const { api } = datasetsRouteApi.useRouteContext()
  const params = datasetsRouteApi.useParams()
  const navigate = useNavigate()
  const t = useTranslations("datasets")
  const [range, setRange] = useState<readonly [number, number]>(() => [0, Math.max(0, order.length - 1)])
  const [pending, setPending] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  const result = useRangePreview(flowId, dataset.dataset_id, caseItem.name)
  const preview = result?.preview ?? null
  const startNode = order[range[0]]
  const endNode = order[range[1]]
  const activeRange = rangeAt(preview, startNode, endNode)
  const markedNodes = order.slice(range[0], range[1] + 1)

  const start = async (): Promise<void> => {
    if (pending || startNode === undefined || endNode === undefined || activeRange?.available !== true) return
    setPending(true)
    setFailure(null)
    try {
      const started = await api.run.start({
        flow_id: flowId,
        at: "working",
        mode: "live",
        dataset_item_id: `${dataset.dataset_id}/${caseItem.name}`,
        selected_nodes: null,
        start_node: startNode,
        end_node: endNode,
      })
      void navigate({ to: ROUTE_PATH.runs, params, search: { run: ids.runId(started.run_id) } })
    } catch (reason) {
      setFailure(reason instanceof Error ? reason.message : t("startFailed"))
    } finally {
      setPending(false)
    }
  }

  return (
    <TitledPanel size="section" title={t("runTitle")} description={t("runSubtitle")} className="mt-6" surface="raised">
      <div className="space-y-5 p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <Text as="div" role="label">{t("rangeLabel")}</Text>
          <Text as="p" role="hint" tone="neutral">
            {t("rangeForCase", { name: caseItem.name })}
          </Text>
        </div>
        {order.length === 0 ? <Text as="p" role="hint" tone="neutral">{t("noStages")}</Text> : <StageRangeTimeline
          order={order}
          range={range}
          onRangeChange={setRange}
          testIdPrefix="dataset-range"
          rangeAvailable={activeRange?.available ?? null}
          stageStatus={(nodeId, currentEndNode) => {
            if (preview === null) return null
            const possible = rangeAt(preview, nodeId, currentEndNode)
            return {
              canStart: preview.ranges.some((item) => item.start_node === nodeId && item.available),
              compatible: possible?.available === true,
              unavailableReason: possible === null ? null : missingText(possible.missing),
            }
          }}
          labels={{
            selectOnlyNode: (node) => t("selectOnlyNode", { node }),
            moveRange: t("moveRange"),
            moveRangeHint: t("moveRangeHint"),
            startNode: t("startNode"),
            endNode: t("endNode"),
          }}
        />}
        <Text as="p" role="hint" tone="neutral">{t("rangeLegend")}</Text>
        <div className="space-y-1.5">
          <Text as="p" role="meta" weight="medium">{startNode === undefined || endNode === undefined ? t("noStages") : t("selectedRange", { start: startNode, end: endNode, count: markedNodes.length })}</Text>
          {preview === null ? <Text as="p" role="hint" tone="neutral">{result?.error ?? t("loadingRange")}</Text> : activeRange?.available !== true ? (
            <Text as="p" role="hint" tone="warning">{t("rangeUnavailable", { detail: missingText(activeRange?.missing ?? []) ?? t("rangeMissingGeneric") })}</Text>
          ) : (
            <Text as="p" role="hint" tone="neutral">{t("rangeOnly")}</Text>
          )}
        </div>
        {failure === null ? null : <Text as="p" role="hint" tone="destructive">{failure}</Text>}
        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={() => { void start() }} disabled={activeRange?.available !== true || pending}>
            <Play aria-hidden className="size-3.5" />
            {pending ? t("starting") : t("start")}
          </Button>
        </div>
      </div>
    </TitledPanel>
  )
}
