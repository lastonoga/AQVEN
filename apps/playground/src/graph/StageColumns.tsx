import { useViewport } from "@xyflow/react"
import { useStageHover } from "./stage-hover.js"
import type { ColumnBox } from "./layout.js"

type Props = { columns: readonly ColumnBox[] }

export function StageColumns({ columns }: Props) {
  const { x, y, zoom } = useViewport()
  const { hovered } = useStageHover()
  const active = columns.find((column) => column.rank === hovered)

  if (active === undefined) return null

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" style={{ zIndex: 0 }}>
      <div
        className="absolute rounded-lg bg-sky-500/10 ring-1 ring-sky-500/40"
        style={{
          left: active.x * zoom + x,
          top: active.y * zoom + y,
          width: active.width * zoom,
          height: active.height * zoom,
        }}
      />
    </div>
  )
}
