import { useState } from "react"
import { useNavigate } from "@tanstack/react-router"
import { Play } from "lucide-react"
import { useTranslations } from "use-intl"
import type { ApiDatasetRangePair, FlowId } from "@/domain"
import { Heading, Text, type TextTone } from "@/components/studio"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import * as ids from "@/data/ids"
import type { Translator } from "@/i18n/translator"
import { casesRouteApi, ROUTE_PATH } from "@/lib/routes"
import { missingText, rangeAt, useRangePreview, wholeSpan, type PreviewResult, type StageSpan } from "./range-preview"
import { StageSpanPicker } from "./stage-span-picker"

type RangeStatus = { readonly tone: TextTone; readonly text: string }

export type CaseRunProps = {
  readonly flowId: FlowId
  readonly datasetId: string
  readonly caseName: string
  readonly order: readonly string[]
}

const rangeStatus = (result: PreviewResult | null, current: ApiDatasetRangePair | null, t: Translator<"cases.run">): RangeStatus => {
  if (result === null) return { tone: "neutral", text: t("loadingRange") }
  if (result.error !== null) return { tone: "destructive", text: result.error }
  if (current?.available !== true) {
    return { tone: "warning", text: t("rangeUnavailable", { detail: missingText(current?.missing ?? []) ?? t("rangeMissingGeneric") }) }
  }
  return { tone: "neutral", text: t("rangeOnly") }
}

export function CaseRun({ flowId, datasetId, caseName, order }: CaseRunProps) {
  const { api } = casesRouteApi.useRouteContext()
  const params = casesRouteApi.useParams()
  const navigate = useNavigate()
  const t = useTranslations("cases.run")
  const stageRange = useTranslations("common.stageRange")
  const [span, setSpan] = useState<StageSpan>(() => wholeSpan(order))
  const [pending, setPending] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  const result = useRangePreview(flowId, datasetId, [caseName])
  const startNode = order[span[0]]
  const endNode = order[span[1]]
  const current = rangeAt(result?.preview ?? null, startNode, endNode)
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
      <div className="flex flex-col gap-1.5">
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
          <StageSpanPicker order={order} span={span} onChange={setSpan} />
          <Text role="hint" tone={status.tone}>
            {status.text}
          </Text>
          <Button type="button" size="sm" disabled={pending || current?.available !== true} aria-busy={pending} onClick={() => { void start() }}>
            {pending ? <Spinner aria-hidden="true" /> : <Play aria-hidden />}
            {pending ? t("starting") : t("start")}
          </Button>
        </div>
        {failure === null ? null : <Text as="p" role="hint" tone="destructive">{failure}</Text>}
      </div>
    </Heading>
  )
}
