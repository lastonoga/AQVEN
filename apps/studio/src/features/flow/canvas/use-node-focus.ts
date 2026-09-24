import { useEffect } from "react"
import { useNodesInitialized, useReactFlow } from "@xyflow/react"
import type { Box } from "../layout"
import { boxCentre, FOCUS_DURATION_MS, insetCentre } from "./viewport"

const MEASURED_NODES = { includeHiddenNodes: true }

export function useNodeFocus(box: Box | null, inset: number): void {
  const { setCenter, getZoom } = useReactFlow()
  const ready = useNodesInitialized(MEASURED_NODES)
  const centre = box === null || !ready ? null : boxCentre(box)
  const x = centre?.x ?? null
  const y = centre?.y ?? null
  useEffect(() => {
    if (x === null || y === null) return
    const zoom = getZoom()
    const point = insetCentre({ x, y }, inset, zoom)
    void setCenter(point.x, point.y, { zoom, duration: FOCUS_DURATION_MS })
  }, [x, y, inset, getZoom, setCenter])
}
