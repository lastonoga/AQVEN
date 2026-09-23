import type { CSSProperties } from "react"
import { Position, type HandleType } from "@xyflow/react"

export type PortDot = { readonly id: string; readonly offset: number; readonly color: string }
export type NodeDots = { readonly in: readonly PortDot[]; readonly out: readonly PortDot[]; readonly bottom: readonly PortDot[] }

export type HandleSpec = {
  readonly id: string
  readonly type: HandleType
  readonly position: Position
  readonly style: CSSProperties
}

const DOT_SIZE = 7

const dotStyle = (color: string): CSSProperties => ({
  width: DOT_SIZE,
  height: DOT_SIZE,
  borderRadius: "50%",
  background: color,
  border: "1.5px solid var(--background-subtle)",
})

const spreadStyle = (offset: number, color: string): CSSProperties => ({
  ...dotStyle(color),
  top: `${(offset * 100).toFixed(2)}%`,
  transform: "translate(0, -50%)",
})

const alongXStyle = (color: string): CSSProperties => ({ ...dotStyle(color), transform: "translate(-50%, 0)" })

const specsOf = (dots: readonly PortDot[], type: HandleType, position: Position): readonly HandleSpec[] =>
  dots.map((dot) => ({ id: dot.id, type, position, style: spreadStyle(dot.offset, dot.color) }))

export const nodeHandleSpecs = (dots: NodeDots, reversed: boolean): readonly HandleSpec[] => [
  ...specsOf(dots.in, "target", reversed ? Position.Right : Position.Left),
  ...specsOf(dots.out, "source", reversed ? Position.Left : Position.Right),
  ...dots.bottom.map((dot): HandleSpec => ({ id: dot.id, type: "source", position: Position.Bottom, style: alongXStyle(dot.color) })),
]
