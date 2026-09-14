import { createContext, useContext } from "react"
import type { ReactNode } from "react"
import type { Render, Run } from "./api/index.js"
import type { RunNodeView, RunView } from "./run/events.js"

export type RunSelection = {
  runId: string | null
  run: Run | null
  view: RunView | null
  nodes: ReadonlyMap<string, RunNodeView>
  renders: Readonly<Record<string, Render>>
  loading: boolean
  error: string | null
}

export const NO_RUN: RunSelection = {
  runId: null,
  run: null,
  view: null,
  nodes: new Map(),
  renders: {},
  loading: false,
  error: null,
}

const RunContext = createContext<RunSelection>(NO_RUN)

export function RunProvider({ selection, children }: { selection: RunSelection; children: ReactNode }) {
  return <RunContext.Provider value={selection}>{children}</RunContext.Provider>
}

export const useRunSelection = (): RunSelection => useContext(RunContext)

export const useRunNode = (nodeId: string | null): RunNodeView | null => {
  const { nodes } = useRunSelection()
  if (nodeId === null) return null
  return nodes.get(nodeId) ?? null
}

export const useRunRender = (nodeId: string | null): Render | null => {
  const { renders } = useRunSelection()
  if (nodeId === null) return null
  return renders[nodeId] ?? null
}

export type SlotValue = { known: boolean; value: unknown }

const UNKNOWN_SLOT: SlotValue = { known: false, value: undefined }

const recordOf = (value: unknown): Record<string, unknown> | null => {
  if (typeof value !== "object" || value === null) return null
  if (Array.isArray(value)) return null
  return value as Record<string, unknown>
}

export const slotValueOf = (node: RunNodeView | null, render: Render | null, slot: string): SlotValue => {
  const sources = [recordOf(node?.input), recordOf(render?.input)]
  const found = sources.find((source): source is Record<string, unknown> => source !== null && slot in source)
  if (found === undefined) return UNKNOWN_SLOT
  return { known: true, value: found[slot] }
}

export const useRunSlotValue = (nodeId: string | null, slot: string): SlotValue =>
  slotValueOf(useRunNode(nodeId), useRunRender(nodeId), slot)
