import { useEffect, useState } from "react"
import { useNavigate } from "@tanstack/react-router"
import { Play } from "lucide-react"
import { useTranslations } from "use-intl"
import type { ApiDatasetRangePair, ApiDatasetRangePreview, FlowId } from "@/domain"
import { Heading, Text, type TextTone } from "@/components/studio"
import { useStageRangeLabels } from "@/components/studio/stage-range-labels"
import { StageRangeTimeline, type StageStatus } from "@/components/studio/stage-range-timeline"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import * as ids from "@/data/ids"
import type { Translator } from "@/i18n/translator"
import { casesRouteApi, ROUTE_PATH } from "@/lib/routes"
import { messageOf } from "@/lib/errors"

type RangeMissing = ApiDatasetRangePair["missing"][number]

type PreviewResult = { readonly key: string; readonly preview: ApiDatasetRangePreview | null; readonly error: string | null }

type RangeStatus = { readonly tone: TextTone; readonly text: string }

export type CaseRunProps = {
  readonly flowId: FlowId
  readonly datasetId: string
  readonly caseName: string
  readonly order: readonly string[]
}

const rangeAt = (preview: ApiDatasetRangePreview | null, startNode: string | undefined, endNode: string | undefined): ApiDatasetRangePair | null => {
  if (preview === null || startNode === undefined || endNode === undefined) return null
  return preview.ranges.find((item) => item.start_node === startNode && item.end_node === endNode) ?? null
}

const missingText = (missing: readonly RangeMissing[]): string | null => {
  if (missing.length === 0) return null
  return missing.map((item) => `${item.reference}${item.reason ? ` — ${item.reason}` : ""}`).join("; ")
}

const stageStatusOf = (preview: ApiDatasetRangePreview | null) => (nodeId: string, endNode: string | undefined): StageStatus | null => {
  if (preview === null) return null
  const possible = rangeAt(preview, nodeId, endNode)
  return {
    canStart: preview.ranges.some((item) => item.start_node === nodeId && item.available),
    compatible: possible?.available === true,
    unavailableReason: possible === null ? null : missingText(possible.missing),
  }
}

const rangeStatus = (result: PreviewResult | null, current: ApiDatasetRangePair | null, t: Translator<"cases.run">): RangeStatus => {
  if (result === null) return { tone: "neutral", text: t("loadingRange") }
  if (result.error !== null) return { tone: "destructive", text: result.error }
  if (current?.available !== true) {
    return { tone: "warning", text: t("rangeUnavailable", { detail: missingText(current?.missing ?? []) ?? t("rangeMissingGeneric") }) }
  }
  return { tone: "neutral", text: t("rangeOnly") }
}

function useRangePreview(flowId: FlowId, datasetId: string, caseName: string): PreviewResult | null {
  const { api } = casesRouteApi.useRouteContext()
  const key = [flowId, datasetId, caseName].join("\u0000")
  const [result, setResult] = useState<PreviewResult | null>(null)

  useEffect(() => {
    let active = true
    void api.flow.datasetRange(flowId, datasetId, [caseName]).then(
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
  }, [api, flowId, datasetId, caseName, key])

  return result?.key === key ? result : null
}

export function CaseRun({ flowId, datasetId, caseName, order }: CaseRunProps) {
  const { api } = casesRouteApi.useRouteContext()
  const params = casesRouteApi.useParams()
  const navigate = useNavigate()
  const t = useTranslations("cases.run")
  const stageRange = useTranslations("common.stageRange")
  const rangeLabels = useStageRangeLabels()
  const [range, setRange] = useState<readonly [number, number]>(() => [0, Math.max(0, order.length - 1)])
  const [pending, setPending] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  const result = useRangePreview(flowId, datasetId, caseName)
  const preview = result?.preview ?? null
  const startNode = order[range[0]]
  const endNode = order[range[1]]
  const current = rangeAt(preview, startNode, endNode)
  const status = rangeStatus(result, current, t)

  const start = async (): Promise<void> => {
    if (pending || startNode === undefined || endNode === undefined || current?.available !== true) return
    setPending(true)
    setFailure(null)
    try {
      const started = await api.run.start({
        flow_id: flowId,
        at: "working",
        mode: "live",
        dataset_item_id: `${datasetId}/${caseName}`,
        selected_nodes: null,
        start_node: startNode,
        end_node: endNode,
      })
      void navigate({ to: ROUTE_PATH.runs, params, search: { run: ids.runId(started.run_id) } })
    } catch (reason) {
      setFailure(reason instanceof Error ? reason.message : t("failed"))
    } finally {
      setPending(false)
    }
  }

  if (order.length === 0) return <Heading size="label" title={t("title")} below={[stageRange("noStages")]} />

  return (
    <Heading size="label" title={t("title")} description={t("hint")}>
      <div className="flex flex-col gap-2.5">
        <StageRangeTimeline
          order={order}
          range={range}
          onRangeChange={setRange}
          testIdPrefix="case-range"
          rangeAvailable={current?.available ?? null}
          stageStatus={stageStatusOf(preview)}
          labels={rangeLabels}
        />
        <Text as="p" role="hint" tone="neutral">{t("rangeLegend")}</Text>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" size="sm" disabled={pending || current?.available !== true} aria-busy={pending} onClick={() => { void start() }}>
            {pending ? <Spinner aria-hidden="true" /> : <Play aria-hidden />}
            {pending ? t("starting") : t("start")}
          </Button>
          <Text role="meta" weight="medium">
            {startNode === undefined || endNode === undefined ? null : t("selectedRange", { start: startNode, end: endNode, count: range[1] - range[0] + 1 })}
          </Text>
          <Text role="hint" tone={status.tone}>{status.text}</Text>
        </div>
        {failure === null ? null : <Text as="p" role="hint" tone="destructive">{failure}</Text>}
      </div>
    </Heading>
  )
}
