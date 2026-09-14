import { createContext, useContext, useMemo } from "react"
import type { ReactNode } from "react"
import { buildSteps } from "../components/run-steps.js"
import type { Render } from "../api/index.js"
import type { NodeStatus, RunView } from "./events.js"

export type NodeRunState = {
  status: NodeStatus
  durationMs: number | null
  simplifications: string[]
  summary: string | null
  input: unknown
  prompt: string | null
  output: unknown
  outputType: string | null
  totalTokens: number | null
  costUsd: number | null
  checksFailed: number
}

export type RunOverlay = {
  runId: string | null
  byNodeId: ReadonlyMap<string, NodeRunState>
}

const EMPTY: RunOverlay = { runId: null, byNodeId: new Map() }

const RunOverlayContext = createContext<RunOverlay>(EMPTY)

export const overlayOf = (
  runId: string,
  view: RunView,
  renders: Readonly<Record<string, Render>> = {},
): RunOverlay => ({
  runId,
  byNodeId: new Map(
    buildSteps(view, renders).map((step) => [
      step.nodeId,
      {
        status: step.status,
        durationMs: step.durationMs,
        simplifications: step.simplifications,
        summary: step.summary ?? step.description,
        input: step.input,
        prompt: step.prompt,
        output: step.output,
        outputType: step.outputType,
        totalTokens: step.metrics.totalTokens,
        costUsd: step.metrics.costUsd,
        checksFailed: step.checks.filter((check) => check.ok === false).length,
      },
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
