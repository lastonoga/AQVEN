import { useEffect, useMemo, useState } from "react"
import { useTranslations } from "use-intl"
import type { ApiFlowSchemas, ApiJsonValue, ApiManualRangePair, ApiManualRangePreview, ApiRunSnapshot, FlowId, RunId } from "@/domain"
import { Actions, Heading, Text, TitledPanel, Toolbar } from "@/components/studio"
import { StageRangeTimeline } from "@/components/studio/stage-range-timeline"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import * as ids from "@/data/ids"
import { runsRouteApi } from "@/lib/routes"
import { ManualInputEditor } from "./manual-input-editor"
import { initialManualInput, isJsonValue, missingManualInput, projectManualInput } from "./manual-input-model"
import { useRunStart } from "./run-start"

export type StartRunProps = {
  readonly flowId: FlowId
  readonly schemas: ApiFlowSchemas
  readonly order: readonly string[]
  readonly previousRun: ApiRunSnapshot | null
  readonly today: string
  readonly onStarted: (runId: RunId) => void
  readonly onCancel: () => void
}

type PreviewResult = { readonly key: string; readonly preview: ApiManualRangePreview | null; readonly error: string | null }

const parseFixtures = (draft: Record<string, string>): { value: Record<string, ApiJsonValue>; invalid: readonly string[] } => {
  const value: Record<string, ApiJsonValue> = {}
  const invalid: string[] = []
  for (const [name, source] of Object.entries(draft)) {
    if (source.trim() === "") continue
    try {
      const parsed: unknown = JSON.parse(source)
      if (isJsonValue(parsed)) value[name] = parsed
      else invalid.push(name)
    }
    catch { invalid.push(name) }
  }
  return { value, invalid }
}

const rangeAt = (preview: ApiManualRangePreview | null, start: string | undefined, end: string | undefined): ApiManualRangePair | null =>
  preview?.ranges.find((item) => item.start_node === start && item.end_node === end) ?? null

const fixtureName = (reference: string): string | null => /^\$([^.]+)\.out(?:\.|$)/.exec(reference)?.[1] ?? null
const CONTEXT_LABEL: Readonly<Record<string, string>> = { date: "Date", time_zone: "Time zone", locale: "Locale", tenant_id: "Tenant" }
const contextLabel = (key: string): string => CONTEXT_LABEL[key] ?? key
const referenceLabel = (reference: string): string => {
  if (reference === "$input") return "Flow input"
  if (reference.startsWith("$input.")) return `Input · ${reference.slice(7)}`
  if (reference.startsWith("$run.context.")) return `Context · ${contextLabel(reference.slice(13))}`
  const match = /^\$([^.]+)\.out(?:\.(.+))?$/.exec(reference)
  return match === null ? reference : `${match[1] ?? "Node"} output${match[2] ? ` · ${match[2]}` : ""}`
}

export function StartRun({ flowId, schemas, order, previousRun, today, onStarted, onCancel }: StartRunProps) {
  const t = useTranslations("runs.start")
  const timeline = useTranslations("datasets")
  const { api } = runsRouteApi.useRouteContext()
  const [range, setRange] = useState<readonly [number, number]>([0, Math.max(0, order.length - 1)])
  const [input, setInput] = useState<Record<string, unknown>>(() => initialManualInput(schemas.input))
  const [context, setContext] = useState<Record<string, string>>(() => Object.fromEntries(schemas.context.map((key) => [key, key === "date" ? today : ""])))
  const [fixtureDraft, setFixtureDraft] = useState<Record<string, string>>({})
  const [fixtureError, setFixtureError] = useState<string | null>(null)
  const [uploading, setUploading] = useState<ReadonlySet<string>>(new Set())
  const [previewResult, setPreviewResult] = useState<PreviewResult | null>(null)
  const { pending, failure, start } = useRunStart(onStarted)
  const fixtures = useMemo(() => parseFixtures(fixtureDraft), [fixtureDraft])
  const contextBody = useMemo(() => Object.fromEntries(Object.entries(context).filter(([, value]) => value.trim() !== "")), [context])
  const previewBody = useMemo(() => ({ input: isJsonValue(input) ? input : {}, context: contextBody, node_outputs: fixtures.value }), [input, contextBody, fixtures.value])
  const previewKey = JSON.stringify(previewBody)

  useEffect(() => {
    let active = true
    const timer = window.setTimeout(() => {
      void api.flow.manualRange(flowId, previewBody).then(
        (preview) => { if (active) setPreviewResult({ key: previewKey, preview, error: null }) },
        (reason: unknown) => { if (active) setPreviewResult({ key: previewKey, preview: null, error: reason instanceof Error ? reason.message : String(reason) }) },
      )
    }, 180)
    return () => { active = false; window.clearTimeout(timer) }
  }, [api, flowId, previewBody, previewKey])

  const preview = previewResult?.preview ?? null
  const previewRefreshing = previewResult?.key !== previewKey
  const startNode = order[range[0]]
  const endNode = order[range[1]]
  const activeRange = rangeAt(preview, startNode, endNode)
  const inputPaths = activeRange?.input_paths ?? []
  const selectedContext = activeRange?.context_keys ?? []
  const fixtureNodes = [...new Set((activeRange?.node_output_paths ?? []).map(fixtureName).filter((name): name is string => name !== null && order.indexOf(name) < range[0] && order.includes(name)))]
  const missingFields = activeRange === null ? [] : missingManualInput(schemas.input, inputPaths, input)
  const fullFlow = range[0] === 0 && range[1] === order.length - 1
  const canStart = !previewRefreshing && activeRange?.available === true && missingFields.length === 0 && fixtures.invalid.length === 0 && uploading.size === 0 && !pending
  const selected = order.slice(range[0], range[1] + 1)

  const submit = (): void => {
    if (!canStart || startNode === undefined || endNode === undefined) return
    const selectedInput = projectManualInput(input, inputPaths)
    const selectedContextBody = Object.fromEntries(selectedContext.flatMap((key) => contextBody[key] === undefined ? [] : [[key, contextBody[key]]]))
    const selectedFixtures = fullFlow ? {} : Object.fromEntries(fixtureNodes.flatMap((node) => fixtures.value[node] === undefined ? [] : [[node, fixtures.value[node]]]))
    start({
      flow_id: flowId,
      at: "working",
      mode: "live",
      input: isJsonValue(selectedInput) ? selectedInput : {},
      context: selectedContextBody,
      node_outputs: selectedFixtures,
      selected_nodes: null,
      start_node: fullFlow ? null : startNode,
      end_node: fullFlow ? null : endNode,
    })
  }

  const copyPreviousOutput = async (node: string): Promise<void> => {
    const reference = previousRun?.executions.find((execution) => execution.address.node_id === node && execution.status === "ok")?.output_ref
    if (reference === undefined || reference === null) return
    try {
      const value: unknown = reference.kind === "inline" ? reference.value : JSON.parse(await api.blob.read(ids.blobId(reference.blob_id)))
      if (!isJsonValue(value)) throw new Error("The saved output is not JSON")
      setFixtureDraft((current) => ({ ...current, [node]: JSON.stringify(value, null, 2) }))
      setFixtureError(null)
    } catch (reason) {
      setFixtureError(reason instanceof Error ? reason.message : String(reason))
    }
  }

  return <div className="min-w-0 space-y-4">
    <Heading size="page" title={t("title")} below={[t("manualSubtitle", { flow: flowId })]} />
    <TitledPanel size="block" title={t("scopeTitle")} description={t("scopeHint")}>
      <div className="space-y-3 px-3 pb-4 pt-3">
        {order.length === 0 ? <Text as="p" role="hint" tone="warning">{timeline("noStages")}</Text> : <StageRangeTimeline
          order={order}
          range={range}
          onRangeChange={setRange}
          testIdPrefix="manual-range"
          rangeAvailable={activeRange?.available ?? null}
          stageStatus={(nodeId, currentEnd) => {
            if (preview === null) return null
            const pair = rangeAt(preview, nodeId, currentEnd)
            return { canStart: preview.ranges.some((item) => item.start_node === nodeId && item.available), compatible: pair?.available === true, unavailableReason: pair?.missing.map((item) => item.reference + ": " + item.reason).join("; ") ?? null }
          }}
          labels={{ selectOnlyNode: (node) => timeline("selectOnlyNode", { node }), moveRange: timeline("moveRange"), moveRangeHint: timeline("moveRangeHint"), startNode: timeline("startNode"), endNode: timeline("endNode") }}
        />}
        <Text as="p" role="hint" tone="neutral">{t("scopeSelection", { start: startNode ?? "—", end: endNode ?? "—", count: selected.length })}</Text>
      </div>
    </TitledPanel>
    <TitledPanel size="block" title={t("inputTitle")} description={t("selectedInputHint")}>
      <div className="px-3 pb-4 pt-3">
        {activeRange === null ? <Text as="p" role="hint" tone="neutral">{previewResult?.error ?? t("loadingRequirements")}</Text> : <ManualInputEditor schema={schemas.input} paths={inputPaths} value={input} onChange={setInput} disabled={pending} problems={failure?.problems ?? []} onUploadChange={(path, busy) => { setUploading((current) => { const next = new Set(current); if (busy) next.add(path); else next.delete(path); return next }) }} />}
        {missingFields.length === 0 ? null : <Text as="p" role="hint" tone="warning" className="mt-3">{t("completeInput", { fields: missingFields.join(", ") })}</Text>}
      </div>
    </TitledPanel>
    {selectedContext.length === 0 ? null : <TitledPanel size="block" title={t("contextTitle")} description={t("selectedContextHint")}>
      <div className="grid gap-4 px-3 pb-4 pt-3 md:grid-cols-2">{selectedContext.map((key) => <div key={key}><Label htmlFor={`manual-context-${key}`}>{contextLabel(key)}</Label><Input id={`manual-context-${key}`} type={key === "date" ? "date" : "text"} className="mt-1.5" value={context[key] ?? ""} disabled={pending} onChange={(event) => { setContext((current) => ({ ...current, [key]: event.target.value })) }} />{failure?.problems.filter((problem) => problem.path[0] === "context" && problem.path[1] === key).map((problem) => <p key={problem.code} role="alert" className="mt-1 text-xs text-destructive">{problem.message}</p>)}</div>)}</div>
    </TitledPanel>}
    {fixtureNodes.length === 0 ? null : <TitledPanel size="block" title={t("boundaryTitle")} description={t("boundaryHint")}>
      <div className="space-y-4 px-3 pb-4 pt-3">{fixtureNodes.map((node) => <div key={node}>
        <Label htmlFor={`manual-fixture-${node}`}>{t("boundaryNode", { node })}</Label>
        <Text as="p" role="hint" tone="neutral" className="mt-1">{activeRange?.node_output_paths.filter((path) => fixtureName(path) === node).map(referenceLabel).join(", ")}</Text>
        {previousRun?.executions.some((execution) => execution.address.node_id === node && execution.status === "ok" && execution.output_ref !== null) ? <Button type="button" size="sm" variant="outline" className="mt-2" disabled={pending} onClick={() => { void copyPreviousOutput(node) }}>{t("usePreviousOutput", { run: previousRun.run_id.slice(-6) })}</Button> : null}
        <Textarea id={`manual-fixture-${node}`} className="mt-1.5 min-h-24 font-mono" placeholder={'{\n  "field": "value"\n}'} value={fixtureDraft[node] ?? ""} disabled={pending} onChange={(event) => { setFixtureDraft((current) => ({ ...current, [node]: event.target.value })) }} />
        {fixtures.invalid.includes(node) ? <Text as="p" role="hint" tone="destructive">{t("invalidJson")}</Text> : null}
      </div>)}</div>
    </TitledPanel>}
    {fixtureError ? <Text as="p" role="hint" tone="destructive">{fixtureError}</Text> : null}
    <TitledPanel size="block" title={t("reviewTitle")}>
      <div className="space-y-2 px-3 pb-4 pt-3 text-sm">
        <p><span className="font-medium">{t("reviewExecution")}</span> {fullFlow ? t("entireFlow") : t("scopeSelection", { start: startNode ?? "—", end: endNode ?? "—", count: selected.length })}</p>
        <p><span className="font-medium">{t("reviewMode")}</span> {t("liveMode")}</p>
        {activeRange?.missing.map((item) => <p key={item.reference} className="text-amber-700 dark:text-amber-400">{referenceLabel(item.reference)}: {item.reason}</p>)}
        {previewResult?.error ? <p role="alert" className="text-destructive">{previewResult.error}</p> : null}
        {failure ? <p role="alert" className="text-destructive">{failure.message}</p> : null}
      </div>
    </TitledPanel>
    <Toolbar wrap aria-busy={pending} className="gap-2 px-0">
      <Actions actions={[{ id: "submit", label: t("submit"), variant: "default", pending, disabled: !canStart, onClick: submit }, { id: "cancel", label: t("cancel"), disabled: pending, onClick: onCancel }]} />
    </Toolbar>
  </div>
}
