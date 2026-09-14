import { useRef } from "react"
import { useStore } from "@xyflow/react"
import { DEFAULT_LEVEL, packLevels, stepLevel, unpackLevels } from "./zoom-level.js"
import type { ZoomLevel } from "./zoom-level.js"

export const useZoomLevel = (): ZoomLevel => {
  const code = useStore((state) => packLevels(state.transform[2]))
  const previous = useRef<ZoomLevel>(DEFAULT_LEVEL)
  const { up, down } = unpackLevels(code)
  const next = stepLevel(up, down, previous.current)
  previous.current = next
  return next
}
