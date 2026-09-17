import { useEffect } from "react"
import { useNodesInitialized, useReactFlow, useStore, type ReactFlowState } from "@xyflow/react"
import type { CanvasStage } from "@/domain"
import { FOCUS_DURATION_MS, stageFocus, type ViewportTarget } from "./viewport"

const MEASURED_NODES = { includeHiddenNodes: true }

const paneWidth = (state: ReactFlowState): number => state.width
const paneHeight = (state: ReactFlowState): number => state.height

const focusTarget = (stage: CanvasStage | null, ready: boolean, width: number, height: number): ViewportTarget | null => {
  if (stage === null || !ready || width === 0 || height === 0) return null
  return stageFocus(stage.rect, { width, height })
}

export function useStageFocus(stage: CanvasStage | null): void {
  const { setCenter } = useReactFlow()
  const width = useStore(paneWidth)
  const height = useStore(paneHeight)
  const ready = useNodesInitialized(MEASURED_NODES)
  const target = focusTarget(stage, ready, width, height)
  const x = target?.x ?? null
  const y = target?.y ?? null
  const zoom = target?.zoom ?? null
  useEffect(() => {
    if (x === null || y === null || zoom === null) return
    void setCenter(x, y, { zoom, duration: FOCUS_DURATION_MS })
  }, [x, y, zoom, setCenter])
}
