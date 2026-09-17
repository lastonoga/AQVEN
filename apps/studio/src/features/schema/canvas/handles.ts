import type { CSSProperties } from "react"
import { Position, type HandleType } from "@xyflow/react"
import type { NodeHandle } from "@/domain"

export type HandleSpec = {
  readonly id: NodeHandle
  readonly type: HandleType
  readonly position: Position
  readonly style: CSSProperties
}

const ALONG_Y = "translate(0, -50%)"
const HIDDEN: CSSProperties = { visibility: "hidden" }

const inside = (top?: number): CSSProperties => (top === undefined ? { ...HIDDEN, transform: ALONG_Y } : { ...HIDDEN, top, transform: ALONG_Y })

export const STEP_HANDLES: readonly HandleSpec[] = [
  { id: "in", type: "target", position: Position.Left, style: inside() },
  { id: "out", type: "source", position: Position.Right, style: inside() },
  { id: "bottom", type: "source", position: Position.Bottom, style: { ...HIDDEN, transform: "translate(-50%, 0)" } },
]

export const PORT_HANDLES: readonly HandleSpec[] = [
  { id: "in", type: "target", position: Position.Left, style: inside() },
  { id: "out", type: "source", position: Position.Right, style: inside() },
]

export const containerHandles = (flowY: number): readonly HandleSpec[] => [
  { id: "in", type: "target", position: Position.Left, style: inside(flowY) },
  { id: "enter", type: "source", position: Position.Right, style: { ...HIDDEN, top: flowY, left: 0, right: "auto", transform: "translate(-100%, -50%)" } },
  { id: "exit", type: "target", position: Position.Left, style: { ...HIDDEN, top: flowY, left: "auto", right: 0, transform: "translate(100%, -50%)" } },
  { id: "out", type: "source", position: Position.Right, style: inside(flowY) },
]
