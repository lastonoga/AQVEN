import { useState } from "react"
import type { ComponentType } from "react"
import { FlowCanvas } from "../graph/FlowCanvas.js"
import { NodeInspector } from "../components/NodeInspector.js"
import { DiagnosticList } from "../components/DiagnosticList.js"
import { RunPicker } from "../components/RunPicker.js"
import { RunLauncher } from "../components/RunLauncher.js"
import { useResource } from "../hooks/use-resource.js"
import { useRunData } from "../hooks/use-run-data.js"
import { RunProvider } from "../run-context.js"
import { RunOverlayProvider, overlayOf } from "../run/node-status.js"
import { useMode, useScrollMemory } from "../mode-context.js"
import { useFlowRuns } from "../run-view/flow-runs.js"
import { runPanelOf } from "../run-view/slots.js"
import { formatStamp, runLabels } from "../run/styles.js"
import { listHref } from "../routing/route.js"
import type { ApiClient, Ir } from "../api/index.js"
import type { FlowMode } from "../routing/route.js"
import type { FlowRuns } from "../run-view/flow-runs.js"
import type { RunPanelProps, RunPanelSlot } from "../run-view/slots.js"
import type { RunSelection } from "../run-context.js"
import type { RunOverlay } from "../run/node-status.js"

type Props = { client: ApiClient; flowId: string; runId: string | null; revision: number }

type LayoutProps = {
  client: ApiClient
  flowId: string
  ir: Ir
  selection: RunSelection
  runs: FlowRuns
  selectedId: string | null
  onSelect: (nodeId: string | null) => void
  hrefOfRun: (runId: string | null) => string
}

const EMPTY_OVERLAY: RunOverlay = { runId: null, byNodeId: new Map() }

const DETAIL_TABS: RunPanelSlot[] = ["detail", "compare"]

const overlayFor = (selection: RunSelection): RunOverlay => {
  if (selection.runId === null) return EMPTY_OVERLAY
  if (selection.view === null) return EMPTY_OVERLAY
  return overlayOf(selection.runId, selection.view)
}

function Diagnostics({ client, flowId, revision }: { client: ApiClient; flowId: string; revision: number }) {
  const diagnostics = useResource(() => client.getDiagnostics(flowId), `flow-diag:${flowId}:${revision}`)
  const rows = diagnostics.data ?? []
  if (rows.length === 0) return null
  return (
    <div className="border-b border-red-900/60 bg-red-950/20 px-3 py-2">
      <DiagnosticList diagnostics={rows} />
    </div>
  )
}

function SchemaLayout({ ir, selectedId, onSelect }: LayoutProps) {
  return (
    <div className="flex min-h-0 flex-1">
      <div className="min-w-0 flex-1">
        <FlowCanvas ir={ir} selectedId={selectedId} onSelect={onSelect} />
      </div>
      <aside className="w-[420px] shrink-0 border-l border-slate-800 bg-slate-950/60">
        <NodeInspector
          nodeId={selectedId}
          body={selectedId === null ? null : ir.nodes[selectedId] ?? null}
          ir={ir}
          onSelectNode={onSelect}
          onClose={() => onSelect(null)}
        />
      </aside>
    </div>
  )
}

function EmptyRuns({ client, flowId, runs, hrefOfRun }: LayoutProps) {
  const fresh = runs.loaded && runs.rows.length === 0
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center p-6">
      <div className="flex w-[30rem] flex-col gap-3 rounded border border-slate-800 bg-slate-950/80 p-4">
        <p className="font-mono text-[13px] text-slate-200">
          {fresh ? "прогонов ещё не было, запустите первый" : "прогон не выбран"}
        </p>
        <p className="text-[12px] leading-relaxed text-slate-500">
          режим прогона показывает шаги с реальными данными: вход, промт и выход каждого узла.
        </p>
        {!fresh && (
          <ul className="flex flex-col gap-1">
            {runs.rows.slice(0, 6).map((row) => (
              <li key={row.id}>
                <a className="font-mono text-[12px] text-sky-400 hover:underline" href={hrefOfRun(row.id)}>
                  {row.id.slice(0, 8)} · {row.status === null ? "?" : runLabels[row.status]} ·{" "}
                  {formatStamp(row.startedAt)}
                </a>
              </li>
            ))}
          </ul>
        )}
        <div className="flex items-center gap-2">
          <RunLauncher client={client} flowId={flowId} hrefOfRun={hrefOfRun} />
          {!runs.loaded && <span className="font-mono text-[11px] text-slate-600">список прогонов грузится…</span>}
        </div>
      </div>
    </div>
  )
}

function DetailPanel({ props }: { props: RunPanelProps }) {
  const [tab, setTab] = useState<RunPanelSlot>("detail")
  const scrollRef = useScrollMemory("run:detail")
  const available = DETAIL_TABS.filter((slot) => runPanelOf(slot).appliesTo(props))
  const active = available.includes(tab) ? tab : "detail"
  const panel = runPanelOf(active)
  const Panel = panel.Component

  return (
    <aside className="flex w-[30rem] shrink-0 flex-col border-l border-slate-800 bg-slate-950/60">
      <div className="flex shrink-0 items-center gap-1 border-b border-slate-800 px-2 py-1">
        {available.map((slot) => (
          <button
            key={slot}
            type="button"
            onClick={() => setTab(slot)}
            className={`rounded px-2 py-0.5 font-mono text-[11px] ${
              slot === active ? "bg-slate-800 text-slate-100" : "text-slate-500 hover:text-slate-300"
            }`}
          >
            {runPanelOf(slot).title}
          </button>
        ))}
      </div>
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto">
        <Panel {...props} />
      </div>
    </aside>
  )
}

function RunLayout(layout: LayoutProps) {
  const { ir, selection, selectedId, onSelect } = layout
  const [canvasOpen, setCanvasOpen] = useState(true)
  const stepsRef = useScrollMemory("run:steps")
  const steps = runPanelOf("steps")
  const Steps = steps.Component
  const panelProps: RunPanelProps = { ir, selection, nodeId: selectedId, onSelectNode: onSelect }
  const total = selection.view?.nodes.length ?? 0

  if (selection.runId === null) return <EmptyRuns {...layout} />

  return (
    <div className="flex min-h-0 flex-1">
      <div className="flex min-w-0 flex-1 flex-col">
        {canvasOpen && (
          <div className="h-[32%] min-h-[160px] shrink-0 border-b border-slate-800">
            <FlowCanvas ir={ir} selectedId={selectedId} onSelect={onSelect} />
          </div>
        )}
        <div className="flex shrink-0 items-center gap-3 border-b border-slate-800 px-3 py-1">
          <button
            type="button"
            onClick={() => setCanvasOpen((prev) => !prev)}
            className="rounded px-2 py-0.5 font-mono text-[11px] text-slate-400 ring-1 ring-slate-800 hover:bg-slate-900"
          >
            {canvasOpen ? "свернуть канвас" : "показать канвас"}
          </button>
          <span className="font-mono text-[11px] text-slate-600">
            шагов <span className="text-slate-300">{total}</span>
          </span>
          {selection.loading && <span className="font-mono text-[11px] text-slate-600">обновление…</span>}
        </div>
        <div ref={stepsRef} className="min-h-0 flex-1 overflow-auto">
          <Steps {...panelProps} />
        </div>
      </div>
      <DetailPanel props={panelProps} />
    </div>
  )
}

const layouts: Record<FlowMode, ComponentType<LayoutProps>> = {
  schema: SchemaLayout,
  run: RunLayout,
}

export function FlowGraphScreen({ client, flowId, runId, revision }: Props) {
  const detail = useResource(() => client.getFlow(flowId), `flow:${flowId}:${revision}`)
  const selection = useRunData(client, runId)
  const runs = useFlowRuns(client, flowId, revision, selection)
  const { mode, selectedNodeId, selectNode, hrefOfRun } = useMode()

  const ir = detail.data?.ir ?? null

  if (detail.error !== null) {
    return (
      <div className="p-4">
        <p className="font-mono text-[13px] text-red-400">{detail.error}</p>
        <a className="mt-2 inline-block font-mono text-[12px] text-sky-400 hover:underline" href={listHref}>
          ← к списку
        </a>
        <div className="mt-3">
          <Diagnostics client={client} flowId={flowId} revision={revision} />
        </div>
      </div>
    )
  }

  if (ir === null) return <p className="p-4 font-mono text-[13px] text-slate-500">загрузка…</p>

  if (Object.keys(ir.nodes).length === 0) {
    return <p className="p-4 font-mono text-[13px] text-slate-500">в воркфлоу нет узлов</p>
  }

  const Layout = layouts[mode]
  const layout: LayoutProps = {
    client,
    flowId,
    ir,
    selection,
    runs,
    selectedId: selectedNodeId,
    onSelect: selectNode,
    hrefOfRun,
  }

  return (
    <RunProvider selection={selection}>
      <RunOverlayProvider overlay={overlayFor(selection)}>
        <div className="flex h-full min-h-0 flex-col">
          <RunPicker runs={runs} selection={selection} hrefOf={hrefOfRun} />
          <Diagnostics client={client} flowId={flowId} revision={revision} />
          <Layout {...layout} />
        </div>
      </RunOverlayProvider>
    </RunProvider>
  )
}
