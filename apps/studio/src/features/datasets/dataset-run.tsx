import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react"
import { useNavigate } from "@tanstack/react-router"
import { GripVertical, Play } from "lucide-react"
import { Slider } from "radix-ui"
import { useTranslations } from "use-intl"
import type { ApiDatasetCase, ApiDatasetRangePair, ApiDatasetRangePreview, ApiDatasetSummary, FlowId } from "@/domain"
import { Text, TitledPanel } from "@/components/studio"
import { Button } from "@/components/ui/button"
import * as ids from "@/data/ids"
import { datasetsRouteApi, ROUTE_PATH } from "@/lib/routes"

type RangeMissing = ApiDatasetRangePair["missing"][number]
type PreviewResult = { readonly key: string; readonly preview: ApiDatasetRangePreview | null; readonly error: string | null }
type DragMode = "move" | "start" | "end"

type DatasetRunProps = {
  readonly flowId: FlowId
  readonly dataset: ApiDatasetSummary
  readonly caseItem: ApiDatasetCase
  readonly selectedCases: readonly string[]
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

const shiftRange = (current: readonly [number, number], steps: number, count: number): readonly [number, number] => {
  const first = Math.max(0, Math.min(count - 1 - (current[1] - current[0]), current[0] + steps))
  return [first, first + current[1] - current[0]]
}

function useRangePreview(flowId: FlowId, datasetId: string, caseNames: readonly string[] | null): PreviewResult | null {
  const { api } = datasetsRouteApi.useRouteContext()
  const namesKey = caseNames === null ? null : caseNames.join("\u0000")
  const key = namesKey === null ? null : [flowId, datasetId, namesKey].join("\u0001")
  const [result, setResult] = useState<PreviewResult | null>(null)

  useEffect(() => {
    if (key === null || namesKey === null) return
    let active = true
    void api.flow.datasetRange(flowId, datasetId, namesKey.split("\u0000")).then(
      (preview) => {
        if (active) setResult({ key, preview, error: null })
      },
      (reason: unknown) => {
        if (active) setResult({ key, preview: null, error: reason instanceof Error ? reason.message : String(reason) })
      },
    )
    return () => { active = false }
  }, [api, flowId, datasetId, key, namesKey])

  return key !== null && result?.key === key ? result : null
}

export function DatasetRun({ flowId, dataset, caseItem, selectedCases, order }: DatasetRunProps) {
  const { api } = datasetsRouteApi.useRouteContext()
  const params = datasetsRouteApi.useParams()
  const navigate = useNavigate()
  const t = useTranslations("datasets")
  const [range, setRange] = useState<readonly [number, number]>(() => [0, Math.max(0, order.length - 1)])
  const trackRef = useRef<HTMLSpanElement | null>(null)
  const dragRef = useRef<{ pointerId: number; clientX: number; range: readonly [number, number]; mode: DragMode } | null>(null)
  const [pending, setPending] = useState<"case" | "batch" | null>(null)
  const [failure, setFailure] = useState<string | null>(null)
  const caseResult = useRangePreview(flowId, dataset.dataset_id, [caseItem.name])
  const batchResult = useRangePreview(flowId, dataset.dataset_id, selectedCases.length > 0 ? selectedCases : null)
  const activeResult = selectedCases.length > 0 ? batchResult : caseResult
  const preview = activeResult?.preview ?? null
  const startNode = order[range[0]]
  const endNode = order[range[1]]
  const activeRange = rangeAt(preview, startNode, endNode)
  const caseRange = rangeAt(caseResult?.preview ?? null, startNode, endNode)
  const batchRange = rangeAt(batchResult?.preview ?? null, startNode, endNode)
  const markedNodes = order.slice(range[0], range[1] + 1)

  const moveRange = (next: number[]): void => {
    const nextStart = next[0]
    const nextEnd = next[1]
    if (nextStart === undefined || nextEnd === undefined) return
    setRange([nextStart, nextEnd])
  }

  const moveEdge = (edge: "start" | "end", event: KeyboardEvent<HTMLSpanElement>): void => {
    if (event.key !== "Home" && event.key !== "End") return
    event.preventDefault()
    event.stopPropagation()
    setRange((current) => {
      if (edge === "start") return [event.key === "Home" ? 0 : current[1], current[1]]
      return [current[0], event.key === "Home" ? current[0] : order.length - 1]
    })
  }

  const beginDrag = (mode: DragMode, event: PointerEvent<HTMLElement>): void => {
    event.preventDefault()
    event.stopPropagation()
    event.currentTarget.focus()
    dragRef.current = { pointerId: event.pointerId, clientX: event.clientX, range, mode }
    if ("setPointerCapture" in event.currentTarget) event.currentTarget.setPointerCapture(event.pointerId)
  }

  const dragRange = (event: PointerEvent<HTMLElement>): void => {
    const drag = dragRef.current
    if (drag === null || drag.pointerId !== event.pointerId) return
    event.stopPropagation()
    const width = trackRef.current?.getBoundingClientRect().width ?? 0
    if (width <= 20 || order.length < 2) return
    const stepWidth = (width - 20) / (order.length - 1)
    const steps = Math.round((event.clientX - drag.clientX) / stepWidth)
    if (drag.mode === "move") {
      setRange(shiftRange(drag.range, steps, order.length))
    } else if (drag.mode === "start") {
      setRange([Math.max(0, Math.min(drag.range[1], drag.range[0] + steps)), drag.range[1]])
    } else {
      setRange([drag.range[0], Math.max(drag.range[0], Math.min(order.length - 1, drag.range[1] + steps))])
    }
  }

  const endDrag = (event: PointerEvent<HTMLElement>): void => {
    if (dragRef.current?.pointerId !== event.pointerId) return
    event.stopPropagation()
    dragRef.current = null
    if ("releasePointerCapture" in event.currentTarget) event.currentTarget.releasePointerCapture(event.pointerId)
  }

  const moveClipByKey = (event: KeyboardEvent<HTMLButtonElement>): void => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight" && event.key !== "Home" && event.key !== "End") return
    event.preventDefault()
    event.stopPropagation()
    setRange((current) => {
      const span = current[1] - current[0]
      if (event.key === "Home") return [0, span]
      if (event.key === "End") return [order.length - 1 - span, order.length - 1]
      return shiftRange(current, event.key === "ArrowLeft" ? -1 : 1, order.length)
    })
  }

  const indexRatio = (index: number): number => order.length < 2 ? 0.5 : index / (order.length - 1)
  const startRatio = indexRatio(range[0])
  const endRatio = indexRatio(range[1])
  const clipHalfWidth = range[0] === range[1] ? 28 : 12
  const clipStyle = {
    left: `calc(${String(startRatio * 100)}% + ${String(10 - 20 * startRatio - clipHalfWidth)}px)`,
    width: `calc(${String((endRatio - startRatio) * 100)}% + ${String(-20 * (endRatio - startRatio) + clipHalfWidth * 2)}px)`,
  }
  const staggerLabels = order.length > 12
  const labelWidth = order.length < 2 ? 100 : Math.min(45, (staggerLabels ? 180 : 90) / (order.length - 1))

  const stageLabels = (above: boolean) => order.map((nodeId, index) => {
    if (above !== (staggerLabels && index % 2 === 0)) return null
    const possible = rangeAt(preview, nodeId, endNode)
    const canStart = preview?.ranges.some((item) => item.start_node === nodeId && item.available) === true
    const inRange = index >= range[0] && index <= range[1]
    const selectedBoundary = index === range[0] || index === range[1]
    const edge = order.length < 2 ? null : index === 0 ? "first" : index === order.length - 1 ? "last" : null
    const tick = <span aria-hidden className={`block h-1.5 w-px shrink-0 ${inRange ? "bg-primary" : "bg-border"} ${edge === "first" ? "ml-2.5 self-start" : edge === "last" ? "mr-2.5 self-end" : "self-center"}`} />
    return (
      <button
        key={nodeId}
        type="button"
        aria-label={t("selectOnlyNode", { node: nodeId })}
        aria-pressed={range[0] === index && range[1] === index}
        onClick={() => { setRange([index, index]) }}
        data-start-available={preview === null ? "pending" : String(canStart)}
        data-current-end-compatible={preview === null ? "pending" : String(possible?.available === true)}
        className={`absolute top-0 flex h-6 min-w-0 cursor-pointer flex-col items-center gap-1 overflow-hidden rounded-sm bg-transparent font-mono text-3xs leading-tight outline-none hover:text-foreground focus-visible:text-foreground focus-visible:ring-2 focus-visible:ring-ring ${edge === "first" ? "text-left" : edge === "last" ? "text-right" : "text-center"} ${selectedBoundary ? activeRange?.available === false ? "text-destructive" : "text-foreground" : canStart ? "text-muted-foreground" : "text-muted-foreground/40"}`}
        style={{
          left: `calc(${String(indexRatio(index) * 100)}% + ${String(10 - 20 * indexRatio(index))}px)`,
          width: `${String(edge === null ? labelWidth : Math.min(labelWidth, (staggerLabels ? 110 : 50) / (order.length - 1)))}%`,
          transform: edge === "first" ? "translateX(-10px)" : edge === "last" ? "translateX(calc(-100% + 10px))" : "translateX(-50%)",
        }}
        title={[nodeId, !canStart && possible !== null ? missingText(possible.missing) : null].filter(Boolean).join(" — ")}
      >
        {above ? <><span className="block w-full min-w-0 truncate">{nodeId}</span>{tick}</> : <>{tick}<span className="block w-full min-w-0 truncate">{nodeId}</span></>}
      </button>
    )
  })

  const start = async (kind: "case" | "batch"): Promise<void> => {
    if (pending !== null || startNode === undefined || endNode === undefined) return
    if (kind === "case" && caseRange?.available !== true) return
    if (kind === "batch" && (selectedCases.length === 0 || batchRange?.available !== true)) return
    setPending(kind)
    setFailure(null)
    try {
      if (kind === "batch") {
        const batch = await api.evals.startDatasetBatch({
          flow_id: flowId,
          dataset_id: dataset.dataset_id,
          case_names: [...selectedCases],
          selected_nodes: null,
          start_node: startNode,
          end_node: endNode,
          mode: "live",
        })
        void navigate({ to: ROUTE_PATH.datasets, params, search: { dataset: dataset.dataset_id, batch: batch.batch_id }, resetScroll: false })
      } else {
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
      }
    } catch (reason) {
      setFailure(reason instanceof Error ? reason.message : t("startFailed"))
    } finally {
      setPending(null)
    }
  }

  return (
    <TitledPanel size="section" title={t("runTitle")} description={t("runSubtitle")} className="mt-6" surface="raised">
      <div className="space-y-5 p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <Text as="div" role="label">{t("rangeLabel")}</Text>
          <Text as="p" role="hint" tone="neutral">
            {selectedCases.length > 0 ? t("rangeForCases", { count: selectedCases.length }) : t("rangeForCase", { name: caseItem.name })}
          </Text>
        </div>
        {order.length === 0 ? <Text as="p" role="hint" tone="neutral">{t("noStages")}</Text> : (
          <div data-testid="dataset-range-timeline" className="min-w-0 px-5 pt-1">
            <div className="min-w-0">
              {staggerLabels ? <div className="relative h-6">{stageLabels(true)}</div> : null}
              <Slider.Root
                min={0}
                max={order.length - 1}
                step={1}
                minStepsBetweenThumbs={0}
                value={[range[0], range[1]]}
                onValueChange={moveRange}
                className="relative flex h-12 w-full touch-none items-center select-none [&>span:nth-last-child(-n+2)]:pointer-events-none"
              >
                <Slider.Track ref={trackRef} data-testid="dataset-range-track" className="relative h-8 w-full grow rounded-sm bg-muted">
                  <Slider.Range className="absolute h-full rounded-sm bg-primary/20" />
                </Slider.Track>
                <button
                  type="button"
                  aria-label={t("moveRange")}
                  aria-description={t("moveRangeHint")}
                  title={t("moveRangeHint")}
                  data-testid="dataset-range-clip"
                  onPointerDown={(event) => { beginDrag("move", event) }}
                  onPointerMove={dragRange}
                  onPointerUp={endDrag}
                  onPointerCancel={endDrag}
                  onKeyDown={moveClipByKey}
                  style={clipStyle}
                  className="absolute top-2 flex h-8 touch-none items-center justify-center overflow-hidden rounded-sm border border-primary bg-primary/20 text-primary shadow-xs outline-none cursor-grab active:cursor-grabbing focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  <GripVertical aria-hidden className={`size-3.5 shrink-0 ${range[0] === range[1] ? "-translate-x-5" : ""}`} />
                </button>
                <Slider.Thumb
                  aria-label={t("startNode")}
                  aria-valuetext={startNode}
                  onKeyDown={(event) => { moveEdge("start", event) }}
                  onPointerDown={(event) => { beginDrag("start", event) }}
                  onPointerMove={dragRange}
                  onPointerUp={endDrag}
                  onPointerCancel={endDrag}
                  style={{ left: range[0] === range[1] ? "-18px" : undefined }}
                  className="relative z-20 block h-9 w-5 touch-none rounded-sm border-2 border-primary bg-background shadow-xs outline-none pointer-events-auto cursor-ew-resize focus-visible:ring-3 focus-visible:ring-ring/50"
                />
                <Slider.Thumb
                  aria-label={t("endNode")}
                  aria-valuetext={endNode}
                  onKeyDown={(event) => { moveEdge("end", event) }}
                  onPointerDown={(event) => { beginDrag("end", event) }}
                  onPointerMove={dragRange}
                  onPointerUp={endDrag}
                  onPointerCancel={endDrag}
                  style={{ left: range[0] === range[1] ? "18px" : undefined }}
                  className="relative z-20 block h-9 w-5 touch-none rounded-sm border-2 border-primary bg-background shadow-xs outline-none pointer-events-auto cursor-ew-resize focus-visible:ring-3 focus-visible:ring-ring/50"
                />
              </Slider.Root>
              <div className="relative h-6">{stageLabels(false)}</div>
            </div>
          </div>
        )}
        <Text as="p" role="hint" tone="neutral">{t("rangeLegend")}</Text>
        <div className="space-y-1.5">
          <Text as="p" role="meta" weight="medium">{startNode === undefined || endNode === undefined ? t("noStages") : t("selectedRange", { start: startNode, end: endNode, count: markedNodes.length })}</Text>
          {preview === null ? <Text as="p" role="hint" tone="neutral">{activeResult?.error ?? t("loadingRange")}</Text> : activeRange?.available !== true ? (
            <Text as="p" role="hint" tone="warning">{t("rangeUnavailable", { detail: missingText(activeRange?.missing ?? []) ?? t("rangeMissingGeneric") })}</Text>
          ) : (
            <Text as="p" role="hint" tone="neutral">{t("rangeOnly")}</Text>
          )}
          {selectedCases.length > 0 && caseRange?.available === false ? (
            <Text as="p" role="hint" tone="warning">{t("caseUnavailable", { detail: missingText(caseRange.missing) ?? t("rangeMissingGeneric") })}</Text>
          ) : null}
        </div>
        {failure === null ? null : <Text as="p" role="hint" tone="destructive">{failure}</Text>}
        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={() => { void start("batch") }} disabled={batchRange?.available !== true || pending !== null || selectedCases.length === 0}>
            <Play aria-hidden className="size-3.5" />
            {pending === "batch" ? t("starting") : t("runSelected", { count: selectedCases.length })}
          </Button>
          <Button type="button" variant="outline" onClick={() => { void start("case") }} disabled={caseRange?.available !== true || pending !== null}>
            {pending === "case" ? t("starting") : t("start")}
          </Button>
        </div>
      </div>
    </TitledPanel>
  )
}
