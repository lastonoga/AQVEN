import { createContext, useContext, useMemo } from "react"
import type { ReactNode } from "react"
import type { NodeStatus, RunView } from "./events.js"

export type NodeRunState = {
  status: NodeStatus
  durationMs: number | null
  simplifications: string[]
}

export type RunOverlay = {
  runId: string | null
  byNodeId: ReadonlyMap<string, NodeRunState>
}

const EMPTY: RunOverlay = { runId: null, byNodeId: new Map() }

const RunOverlayContext = createContext<RunOverlay>(EMPTY)

export const overlayOf = (runId: string, view: RunView): RunOverlay => ({
  runId,
  byNodeId: new Map(
    view.nodes.map((node) => [
      node.nodeId,
      { status: node.status, durationMs: node.durationMs, simplifications: node.simplifications },
    ]),
  ),
})

export function RunOverlayProvider({ overlay, children }: { overlay: RunOverlay; children: ReactNode }) {
  const value = useMemo(() => overlay, [overlay])
  return <RunOverlayContext.Provider value={value}>{children}</RunOverlayContext.Provider>
}

export const useRunOverlay = (): RunOverlay => useContext(RunOverlayContext)

export const useNodeRunState = (nodeId: string): NodeRunState | null =>
  useRunOverlay().byNodeId.get(nodeId) ?? null
