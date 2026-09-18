import { useState, type JSX } from "react"
import { useNavigate } from "@tanstack/react-router"
import { Play } from "lucide-react"
import { useTranslations } from "use-intl"
import type { ApiExecutionAddress, ApiFlowSchemas, ApiRunSnapshot, FlowId, RunId } from "@/domain"
import { Empty, Page, PageHeader } from "@/components/studio"
import * as ids from "@/data/ids"
import { CallSheet, type BlobText, type CallDetail, type CallSheetTab } from "@/features/call-sheet"
import { executionKey, type RowKey, type TraceRun } from "@/features/trace"
import { ROUTE_PATH, runsRouteApi } from "@/lib/routes"
import { DEFAULT_LOCALE } from "@/routes/-defaults"
import { RunDetail, RunHeader, RunOverview } from "./run-detail"
import { RunDataset } from "./run-dataset"
import { RunNodeNavigator } from "./run-node-navigator"
import { PresentationProvider } from "./presentation-state"
import { callDetail, traceOf } from "./run-trace"
import { RunsStrip } from "./runs-strip"
import { StartRun } from "./start-run"
import { isoDate } from "./start-form"

type RunsBodyProps = {
  readonly starting: boolean
  readonly flowId: FlowId
  readonly schemas: ApiFlowSchemas
  readonly today: string
  readonly snapshot: ApiRunSnapshot | null
  readonly blobs: readonly BlobText[]
  readonly trace: TraceRun | null
  readonly selectedKey: string | null
  readonly onOpenCall: (address: ApiExecutionAddress, row: RowKey) => void
  readonly onStarted: (runId: RunId) => void
  readonly onCancel: () => void
}

function RunsBody({ starting, flowId, schemas, today, snapshot, blobs, trace, selectedKey, onOpenCall, onStarted, onCancel }: RunsBodyProps) {
  const t = useTranslations("runs")
  if (starting) return <StartRun key={flowId} flowId={flowId} schemas={schemas} today={today} onStarted={onStarted} onCancel={onCancel} />
  if (snapshot === null || trace === null) return <Empty title={t("selectRun")} />
  return (
    <RunDetail snapshot={snapshot} blobs={blobs} trace={trace} selectedKey={selectedKey} onOpenCall={onOpenCall} />
  )
}

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
  const { runs, runId, snapshot, execution, schemas, nodes, prompts, events, blobs } = runsRouteApi.useLoaderData()
  const search = runsRouteApi.useSearch()
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
                void navigate({ to: ROUTE_PATH.datasets, params, search: {} })
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
      detail={starting || snapshot === null ? undefined : <RunHeader snapshot={snapshot} />}
    />
  )

  const sticky = starting || trace === null ? null : (
    <RunNodeNavigator trace={trace} focusedStage={focusedStage} onFocusStage={focusStage} />
  )

  const content = (
    <div className="relative h-full min-h-0">
      <Page width="xl" header={header} beforeSticky={starting || snapshot === null ? null : <RunOverview snapshot={snapshot} />} sticky={sticky}>
        <RunsBody
          starting={starting}
          flowId={params.flowId}
          schemas={schemas}
          today={isoDate(now)}
          snapshot={snapshot}
          blobs={blobs}
          trace={trace}
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
