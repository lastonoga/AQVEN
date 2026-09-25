import type { JSX } from "react"
import { useNavigate } from "@tanstack/react-router"
import type { ApiExecutionAddress, ApiFlowSchemas, ApiNode, ApiRunSnapshot, ExperimentFlowDetail } from "@/domain"
import { Page } from "@/components/studio"
import * as ids from "@/data/ids"
import { CallSheet, type CallDetail, type CallSheetTab } from "@/features/call-sheet"
import { executionKey, type RowKey } from "@/features/trace"
import { ROUTE_PATH, runRouteApi } from "@/lib/routes"
import { DEFAULT_LOCALE } from "@/routes/-defaults"
import { PresentationProvider } from "./presentation-state"
import { RunCancelSlot } from "./run-cancel"
import { RunDetail, RunHeader, RunOverview } from "./run-detail"
import { RunNodeNavigator } from "./run-node-navigator"
import { callDetail, traceOf, type Prompts } from "./run-trace"
import { ToCases } from "./to-cases"
import { useLiveRun } from "./use-live-run"

type AddressSearch = {
  readonly stage?: string
  readonly node?: ReturnType<typeof ids.nodeId>
  readonly branch?: string
  readonly iter?: number
  readonly item?: number
  readonly tab?: CallSheetTab
}

const NO_NODES: readonly ApiNode[] = []
const NO_PROMPTS: Prompts = {}

const ROW_TAB: Readonly<Record<RowKey, CallSheetTab>> = {
  call: "model",
  agent: "model",
  model: "model",
  input: "input",
  prompt: "prompt",
  output: "output",
  postCheck: "checks",
}

const noSchemas = (snapshot: ApiRunSnapshot): ApiFlowSchemas => ({ flow_id: snapshot.flow_id, input: null, output: null, context: [], nodes: {} })

const nodesOf = (flow: ExperimentFlowDetail | null): readonly ApiNode[] => flow?.nodes ?? NO_NODES

const schemasOf = (flow: ExperimentFlowDetail | null, snapshot: ApiRunSnapshot): ApiFlowSchemas => flow?.schemas ?? noSchemas(snapshot)

const stageSearch = (stage: string | null): AddressSearch => (stage === null ? {} : { stage })

const addressSearch = (address: ApiExecutionAddress, tab: CallSheetTab, stage: string | null): AddressSearch => ({
  ...stageSearch(stage),
  node: ids.nodeId(address.node_id),
  ...(address.branch_key === null ? {} : { branch: address.branch_key }),
  ...(address.iteration === null ? {} : { iter: address.iteration }),
  ...(address.item_index === null ? {} : { item: address.item_index }),
  tab,
})

function RunTools({ snapshot }: { readonly snapshot: ApiRunSnapshot }) {
  return (
    <>
      <ToCases snapshot={snapshot} />
      <RunCancelSlot runId={ids.runId(snapshot.run_id)} status={snapshot.status} />
    </>
  )
}

function RunView({ snapshot: loadedSnapshot }: { readonly snapshot: ApiRunSnapshot }) {
  const loaded = runRouteApi.useLoaderData()
  const { snapshot: live, events, blobs, following } = useLiveRun({ snapshot: loadedSnapshot, events: loaded.events, blobs: loaded.blobs })
  const snapshot = live ?? loadedSnapshot
  const { execution, expected, experimentFlow } = loaded
  const search = runRouteApi.useSearch()
  const params = runRouteApi.useParams()
  const navigate = useNavigate({ from: ROUTE_PATH.run })
  const tab = search.tab ?? "output"
  const focusedStage = search.stage ?? null
  const trace = traceOf(snapshot, nodesOf(experimentFlow), NO_PROMPTS, events, blobs)
  const detail: CallDetail | null = execution === null ? null : callDetail(execution, trace, NO_PROMPTS, blobs, schemasOf(experimentFlow, snapshot))
  const selectedKey = execution === null ? null : executionKey(execution.address)

  const go = (next: AddressSearch, replace = false): void => {
    void navigate({ to: ROUTE_PATH.run, params, search: next, replace, resetScroll: false })
  }

  const openCall = (address: ApiExecutionAddress, row: RowKey): void => {
    go(addressSearch(address, ROW_TAB[row], focusedStage))
  }

  const changeTab = (next: CallSheetTab): void => {
    if (execution === null) return
    go(addressSearch(execution.address, next, focusedStage))
  }

  const focusStage = (stage: string | null): void => {
    const { stage: _previous, ...rest } = search
    go({ ...rest, ...stageSearch(stage) }, true)
  }

  return (
    <div className="relative h-full min-h-0">
      <Page
        width="xl"
        header={<RunHeader snapshot={snapshot} live={following} experimentFlow={experimentFlow} tools={<RunTools snapshot={snapshot} />} />}
        beforeSticky={<RunOverview snapshot={snapshot} events={events} onOpenCall={openCall} />}
        sticky={<RunNodeNavigator trace={trace} focusedStage={focusedStage} onFocusStage={focusStage} />}
      >
        <RunDetail snapshot={snapshot} blobs={blobs} trace={trace} expected={expected} selectedKey={selectedKey} onOpenCall={openCall} />
      </Page>
      <CallSheet detail={detail} tab={tab} onTabChange={changeTab} onClose={() => { go(stageSearch(focusedStage)) }} />
    </div>
  )
}

export function RunScreen(): JSX.Element {
  const { snapshot } = runRouteApi.useLoaderData()
  const { api } = runRouteApi.useRouteContext()
  const runId = ids.runId(snapshot.run_id)
  return (
    <PresentationProvider key={`${runId}:${DEFAULT_LOCALE}`} runId={runId} locale={DEFAULT_LOCALE} read={api.run.presentation}>
      <RunView snapshot={snapshot} />
    </PresentationProvider>
  )
}
