import { useState } from "react"
import { FlowCanvas } from "../graph/FlowCanvas.js"
import { NodeInspector } from "../components/NodeInspector.js"
import { DiagnosticList } from "../components/DiagnosticList.js"
import { RunPicker } from "../components/RunPicker.js"
import { useResource } from "../hooks/use-resource.js"
import { useRunData } from "../hooks/use-run-data.js"
import { RunProvider } from "../run-context.js"
import { RunOverlayProvider, overlayOf } from "../run/node-status.js"
import { listHref } from "../routing/route.js"
import type { ApiClient } from "../api/index.js"
import type { RunSelection } from "../run-context.js"
import type { RunOverlay } from "../run/node-status.js"

type Props = { client: ApiClient; flowId: string; runId: string | null; revision: number }

const EMPTY_OVERLAY: RunOverlay = { runId: null, byNodeId: new Map() }

const overlayFor = (selection: RunSelection): RunOverlay => {
  if (selection.runId === null) return EMPTY_OVERLAY
  if (selection.view === null) return EMPTY_OVERLAY
  return overlayOf(selection.runId, selection.view)
}

export function FlowGraphScreen({ client, flowId, runId, revision }: Props) {
  const detail = useResource(() => client.getFlow(flowId), `flow:${flowId}:${revision}`)
  const diagnostics = useResource(() => client.getDiagnostics(flowId), `flow-diag:${flowId}:${revision}`)
  const selection = useRunData(client, runId)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const ir = detail.data?.ir ?? null

  if (detail.error !== null) {
    return (
      <div className="p-4">
        <p className="font-mono text-[13px] text-red-400">{detail.error}</p>
        <a className="mt-2 inline-block font-mono text-[12px] text-sky-400 hover:underline" href={listHref}>
          ← к списку
        </a>
        <div className="mt-3">
          <DiagnosticList diagnostics={diagnostics.data ?? []} />
        </div>
      </div>
    )
  }

  if (ir === null) {
    return <p className="p-4 font-mono text-[13px] text-slate-500">загрузка…</p>
  }

  if (Object.keys(ir.nodes).length === 0) {
    return <p className="p-4 font-mono text-[13px] text-slate-500">в воркфлоу нет узлов</p>
  }

  const selectedBody = selectedId === null ? null : ir.nodes[selectedId] ?? null

  return (
    <RunProvider selection={selection}>
      <RunOverlayProvider overlay={overlayFor(selection)}>
        <div className="flex h-full min-h-0 flex-col">
          <RunPicker client={client} flowId={flowId} revision={revision} selection={selection} />
          {(diagnostics.data ?? []).length > 0 && (
            <div className="border-b border-red-900/60 bg-red-950/20 px-3 py-2">
              <DiagnosticList diagnostics={diagnostics.data ?? []} />
            </div>
          )}
          <div className="flex min-h-0 flex-1">
            <div className="min-w-0 flex-1">
              <FlowCanvas ir={ir} selectedId={selectedId} onSelect={setSelectedId} />
            </div>
            <aside className="w-[420px] shrink-0 border-l border-slate-800 bg-slate-950/60">
              <NodeInspector
                nodeId={selectedId}
                body={selectedBody}
                ir={ir}
                onSelectNode={setSelectedId}
                onClose={() => setSelectedId(null)}
              />
            </aside>
          </div>
        </div>
      </RunOverlayProvider>
    </RunProvider>
  )
}
