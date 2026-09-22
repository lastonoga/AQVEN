import type { CSSProperties } from "react"
import { Position, type HandleType } from "@xyflow/react"
import type { NodePorts, Port } from "./ports"

export type HandleSpec = {
  readonly id: string
  readonly type: HandleType
  readonly position: Position
  readonly style: CSSProperties
}

const HIDDEN: CSSProperties = { visibility: "hidden" }
const ALONG_X: CSSProperties = { ...HIDDEN, transform: "translate(-50%, 0)" }

const spreadStyle = (offset: number): CSSProperties => ({ ...HIDDEN, top: `${(offset * 100).toFixed(2)}%`, transform: "translate(0, -50%)" })

const specsOf = (ports: readonly Port[], type: HandleType, position: Position): readonly HandleSpec[] =>
  ports.map((port) => ({ id: port.id, type, position, style: spreadStyle(port.offset) }))

export const nodeHandleSpecs = (ports: NodePorts, reversed: boolean): readonly HandleSpec[] => [
  ...specsOf(ports.in, "target", reversed ? Position.Right : Position.Left),
  ...specsOf(ports.out, "source", reversed ? Position.Left : Position.Right),
  { id: "bottom", type: "source", position: Position.Bottom, style: ALONG_X },
]
