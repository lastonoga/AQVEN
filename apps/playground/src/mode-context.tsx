import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react"
import type { ReactNode, RefCallback } from "react"
import { flowModeHref, navigate } from "./routing/route.js"
import type { FlowMode } from "./routing/route.js"

export type ScrollMemory = {
  read: (key: string) => number
  write: (key: string, offset: number) => void
}

export type ModeState = {
  mode: FlowMode
  flowId: string
  runId: string | null
  selectedNodeId: string | null
  selectNode: (nodeId: string | null) => void
  goToMode: (mode: FlowMode) => void
  selectRun: (runId: string | null) => void
  hrefOfRun: (runId: string | null) => string
  hrefOfMode: (mode: FlowMode) => string
  scroll: ScrollMemory
}

export const modeLabels: Record<FlowMode, string> = {
  schema: "Схема",
  run: "Прогон",
}

export const modeHints: Record<FlowMode, string> = {
  schema: "воркфлоу, связи, типы, логика без данных",
  run: "реальный прогон: шаги, вход, промт, выход",
}

const ModeContext = createContext<ModeState | null>(null)

type Props = { flowId: string; mode: FlowMode; runId: string | null; children: ReactNode }

export function ModeProvider({ flowId, mode, runId, children }: Props) {
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const offsets = useRef<Map<string, number>>(new Map())

  const scroll = useMemo<ScrollMemory>(
    () => ({
      read: (key) => offsets.current.get(key) ?? 0,
      write: (key, offset) => {
        offsets.current.set(key, offset)
      },
    }),
    [],
  )

  const value = useMemo<ModeState>(
    () => ({
      mode,
      flowId,
      runId,
      selectedNodeId,
      selectNode: setSelectedNodeId,
      goToMode: (next) => navigate(flowModeHref(next, flowId, runId)),
      selectRun: (next) => navigate(flowModeHref(mode, flowId, next)),
      hrefOfRun: (next) => flowModeHref(mode, flowId, next),
      hrefOfMode: (next) => flowModeHref(next, flowId, runId),
      scroll,
    }),
    [mode, flowId, runId, selectedNodeId, scroll],
  )

  return <ModeContext.Provider value={value}>{children}</ModeContext.Provider>
}

export const useMode = (): ModeState => {
  const state = useContext(ModeContext)
  if (state === null) throw new Error("ModeProvider не смонтирован")
  return state
}

export const useScrollMemory = (key: string): RefCallback<HTMLElement> => {
  const { scroll } = useMode()
  return useCallback(
    (node: HTMLElement | null) => {
      if (node === null) return
      node.scrollTop = scroll.read(key)
      const remember = (): void => scroll.write(key, node.scrollTop)
      node.addEventListener("scroll", remember, { passive: true })
      return () => node.removeEventListener("scroll", remember)
    },
    [key, scroll],
  )
}
