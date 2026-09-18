import type { CSSProperties } from "react"
import { Position, type HandleType } from "@xyflow/react"

export type NodeHandle = "in" | "out" | "bottom"

export type HandleSpec = {
  readonly id: NodeHandle
  readonly type: HandleType
  readonly position: Position
  readonly style: CSSProperties
}

const HIDDEN: CSSProperties = { visibility: "hidden" }
const ALONG_Y: CSSProperties = { ...HIDDEN, transform: "translate(0, -50%)" }
const ALONG_X: CSSProperties = { ...HIDDEN, transform: "translate(-50%, 0)" }

export const NODE_HANDLES: readonly HandleSpec[] = [
  { id: "in", type: "target", position: Position.Left, style: ALONG_Y },
  { id: "out", type: "source", position: Position.Right, style: ALONG_Y },
  { id: "bottom", type: "source", position: Position.Bottom, style: ALONG_X },
]
