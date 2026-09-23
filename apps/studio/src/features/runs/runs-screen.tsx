import { useState, type JSX } from "react"
import { useNavigate } from "@tanstack/react-router"
import { Play, X } from "lucide-react"
import { useTranslations } from "use-intl"
import type { ApiExecutionAddress, ApiFlowSchemas, ApiNode, ApiRun, ApiRunEvent, ApiRunSnapshot, FlowId, RunId } from "@/domain"
import { Empty, Page, PageHeader, Surface, Text } from "@/components/studio"
import { Button } from "@/components/ui/button"
import * as ids from "@/data/ids"
import { CallSheet, type BlobText, type CallDetail, type CallSheetTab } from "@/features/call-sheet"
import { executionKey, type RowKey, type TraceRun } from "@/features/trace"
import { runRef } from "@/lib/format"
import { ROUTE_PATH, flowRouteApi, runsRouteApi } from "@/lib/routes"
import { DEFAULT_LOCALE } from "@/routes/-defaults"
import { CompareAgentsButton } from "./compare-agents-button"
import { ComparePicker } from "./compare-picker"
import type { ExpectedCase } from "./expected"
import { RunCancelSlot } from "./run-cancel"
import { RunDetail, RunHeader, RunOverview } from "./run-detail"
import { RunDataset } from "./run-dataset"
import type { RunComparison } from "./run-diff"
import { RunDiffView } from "./run-diff-view"
import { RunNodeNavigator } from "./run-node-navigator"
import { PresentationProvider } from "./presentation-state"
import { callDetail, traceOf } from "./run-trace"
import { RunsStrip } from "./runs-strip"
import { StartRun } from "./start-run"
import { isoDate } from "./start-form"
import { ToCases } from "./to-cases"
import { useLiveRun } from "./use-live-run"

type RunsBodyProps = {
  readonly starting: boolean
  readonly flowId: FlowId
  readonly schemas: ApiFlowSchemas
  readonly order: readonly string[]
  readonly today: string
  readonly snapshot: ApiRunSnapshot | null
  readonly events: readonly ApiRunEvent[]
  readonly blobs: readonly BlobText[]
  readonly trace: TraceRun | null
  readonly expected: ExpectedCase
  readonly compare: CompareState
  readonly selectedKey: string | null
  readonly onOpenCall: (address: ApiExecutionAddress, row: RowKey) => void
  readonly onStarted: (runId: RunId) => void
  readonly onCancel: () => void
}

type CompareState =
  | { readonly kind: "off" }
  | { readonly kind: "missing"; readonly runId: RunId; readonly onStop: () => void }
  | { readonly kind: "ready"; readonly comparison: RunComparison; readonly onStop: () => void }

const COMPARE_OFF: CompareState = { kind: "off" }

function CompareMissing({ runId, onStop }: { readonly runId: RunId; readonly onStop: () => void }) {
  const t = useTranslations("runs.compare")
  return (
    <Surface variant="well" padding="md" className="flex items-center gap-3">
      <Text as="p" role="hint" tone="warning">{t("missing", { ref: runRef(runId) })}</Text>
      <Button type="button" variant="outline" size="sm" className="ml-auto" onClick={onStop}>
        <X aria-hidden />
        {t("stop")}
      </Button>
    </Surface>
  )
}

function RunsBody({ starting, flowId, schemas, order, today, snapshot, events, blobs, trace, expected, compare, selectedKey, onOpenCall, onStarted, onCancel }: RunsBodyProps) {
  const t = useTranslations("runs")
  if (starting) return <StartRun key={flowId} flowId={flowId} schemas={schemas} order={order} previousRun={snapshot} today={today} onStarted={onStarted} onCancel={onCancel} />
  if (snapshot === null || trace === null) return <Empty title={t("selectRun")} />
  if (compare.kind === "missing") return <CompareMissing runId={compare.runId} onStop={compare.onStop} />
  if (compare.kind === "ready") {
    return (
      <RunDiffView
        left={{ snapshot, events, blobs }}
        right={{ snapshot: compare.comparison.snapshot, events: compare.comparison.events, blobs }}
        onStop={compare.onStop}
      />
    )
  }
  return (
    <RunDetail snapshot={snapshot} blobs={blobs} trace={trace} expected={expected} selectedKey={selectedKey} onOpenCall={onOpenCall} />
  )
}

type RunToolsProps = {
  readonly runs: readonly ApiRun[]
  readonly snapshot: ApiRunSnapshot
  readonly compare: RunId | null
  readonly onCompare: (runId: RunId) => void
}

function RunTools({ runs, snapshot, compare, onCompare }: RunToolsProps) {
  const runId = ids.runId(snapshot.run_id)
  return (
    <>
      <ComparePicker runs={runs} current={runId} compare={compare} onChoose={onCompare} />
      <ToCases snapshot={snapshot} />
      <RunCancelSlot runId={runId} status={snapshot.status} />
    </>
  )
}

const compareStateOf = (compare: RunId | null, comparison: RunComparison | null, onStop: () => void): CompareState => {
  if (compare === null) return COMPARE_OFF
  if (comparison === null) return { kind: "missing", runId: compare, onStop }
  return { kind: "ready", comparison, onStop }
}

const stepActionFor = (snapshot: ApiRunSnapshot, nodes: readonly ApiNode[]) => (step: string) =>
  <CompareAgentsButton step={step} snapshot={snapshot} nodes={nodes} />

const addressSearch = (runId: RunId, address: ApiExecutionAddress, tab: CallSheetTab, stage: string | null) => ({
  run: runId,
  ...(stage === null ? {} : { stage }),
  node: ids.nodeId(address.node_id),
  ...(address.branch_key === null ? {} : { branch: address.branch_key }),
  ...(address.iteration === null ? {} : { iter: address.iteration }),
  ...(address.item_index === null ? {} : { item: address.item_index }),
  tab,
})

const ROW_TAB: Readonly<Record<RowKey, CallSheetTab>> = {
  call: "model",
  agent: "model",
  model: "model",
  input: "input",
  prompt: "prompt",
  output: "output",
  postCheck: "checks",
}

export function RunsScreen(): JSX.Element {
  const { flow } = flowRouteApi.useLoaderData()
  const loaded = runsRouteApi.useLoaderData()
  const { runs, runId, execution, schemas, nodes, prompts, comparison, expected } = loaded
  const { snapshot, events, blobs, following } = useLiveRun({ snapshot: loaded.snapshot, events: loaded.events, blobs: loaded.blobs })
  const search = runsRouteApi.useSearch()
  const compareId = search.compare ?? null
  const tab = search.tab ?? "output"
  const focusedStage = search.stage ?? null
  const params = runsRouteApi.useParams()
  const { now, api } = runsRouteApi.useRouteContext()
  const navigate = useNavigate({ from: ROUTE_PATH.runs })
  const t = useTranslations("runs")
  const [starting, setStarting] = useState(false)

  const trace: TraceRun | null = snapshot === null ? null : traceOf(snapshot, nodes, prompts, events, blobs)
  const selectedKey = execution === null ? null : executionKey(execution.address)
  const detail: CallDetail | null = execution === null ? null : callDetail(execution, trace, prompts, blobs, schemas)

  const openCall = (address: ApiExecutionAddress, row: RowKey): void => {
    if (runId === null) return
    void navigate({ to: ROUTE_PATH.runs, params, search: addressSearch(runId, address, ROW_TAB[row], focusedStage), resetScroll: false })
  }

  const changeTab = (next: CallSheetTab): void => {
    if (runId === null || execution === null) return
    void navigate({ to: ROUTE_PATH.runs, params, search: addressSearch(runId, execution.address, next, focusedStage), resetScroll: false })
  }

  const closeSheet = (): void => {
    void navigate({ to: ROUTE_PATH.runs, params, search: runId === null ? {} : { run: runId, ...(focusedStage === null ? {} : { stage: focusedStage }) }, resetScroll: false })
  }

  const focusStage = (stage: string | null): void => {
    void navigate({
      to: ROUTE_PATH.runs,
      params,
      search: (previous) => {
        const next = { ...previous }
        delete next.stage
        return stage === null ? next : { ...next, stage }
      },
      replace: true,
      resetScroll: false,
    })
  }

  const setCompare = (compare: RunId | null): void => {
    if (runId === null) return
    void navigate({
      to: ROUTE_PATH.runs,
      params,
      search: { run: runId, ...(focusedStage === null ? {} : { stage: focusedStage }), ...(compare === null ? {} : { compare }) },
      resetScroll: false,
    })
  }

  const compare = starting ? COMPARE_OFF : compareStateOf(compareId, comparison, () => { setCompare(null) })

  const started = (id: RunId): void => {
    setStarting(false)
    void navigate({ to: ROUTE_PATH.runs, params, search: { run: id } })
  }

  const header = (
    <PageHeader
      actions={[
            {
              id: "start",
              label: t("start.open"),
              variant: "default",
              icon: Play,
              disabled: starting,
              onClick: () => {
                void navigate({ to: ROUTE_PATH.cases, params, search: {} })
              },
            },
            {
              id: "manual",
              label: t("start.manual"),
              variant: "outline",
              disabled: starting,
              onClick: () => {
                setStarting(true)
              },
            },
      ]}
      selector={<RunsStrip runs={runs} selected={runId} />}
      aside={starting || snapshot === null ? undefined : <RunDataset key={snapshot.run_id} snapshot={snapshot} blobs={blobs} />}
      detail={starting || snapshot === null ? undefined : (
        <RunHeader
          snapshot={snapshot}
          live={following}
          tools={<RunTools runs={runs} snapshot={snapshot} compare={compareId} onCompare={setCompare} />}
        />
      )}
    />
  )

  const sticky = starting || trace === null || snapshot === null || compare.kind !== "off" ? null : (
    <RunNodeNavigator trace={trace} focusedStage={focusedStage} onFocusStage={focusStage} stepAction={stepActionFor(snapshot, nodes)} />
  )

  const content = (
    <div className="relative h-full min-h-0">
      <Page width="xl" header={header} beforeSticky={starting || snapshot === null ? null : <RunOverview snapshot={snapshot} />} sticky={sticky}>
        <RunsBody
          starting={starting}
          flowId={params.flowId}
          schemas={schemas}
          order={flow.order}
          today={isoDate(now)}
          snapshot={snapshot}
          events={events}
          blobs={blobs}
          trace={trace}
          expected={expected}
          compare={compare}
          selectedKey={selectedKey}
          onOpenCall={openCall}
          onStarted={started}
          onCancel={() => {
            setStarting(false)
          }}
        />
      </Page>
      <CallSheet detail={detail} tab={tab} onTabChange={changeTab} onClose={closeSheet} />
    </div>
  )
  return runId === null ? content : (
    <PresentationProvider key={`${runId}:${DEFAULT_LOCALE}`} runId={runId} locale={DEFAULT_LOCALE} read={api.run.presentation}>{content}</PresentationProvider>
  )
}
