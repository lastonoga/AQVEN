import { useViewport } from "@xyflow/react"
import { stepNumber } from "./ranks.js"
import { useStageHover } from "./stage-hover.js"
import type { ColumnBox } from "./layout.js"
import type { Stage } from "./ranks.js"

type Props = { columns: readonly ColumnBox[]; stages: readonly Stage[] }

export function StageColumns({ columns, stages }: Props) {
  const { x, y, zoom } = useViewport()
  const { hovered } = useStageHover()
  const titleOf = new Map(stages.map((stage) => [stage.rank, stage.title]))

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" style={{ zIndex: 0 }}>
      {columns.map((column) => {
        const active = hovered === column.rank
        const tone = active ? "border-sky-500/60 bg-sky-500/10" : "border-slate-800/70 bg-transparent"
        return (
          <div
            key={column.rank}
            className={`absolute rounded-lg border border-dashed transition-colors ${tone}`}
            style={{
              left: column.x * zoom + x,
              top: column.y * zoom + y,
              width: column.width * zoom,
              height: column.height * zoom,
            }}
          >
            <div
              className={`absolute left-0 top-0 -translate-y-full pb-1 font-mono text-[11px] ${active ? "text-sky-300" : "text-slate-600"}`}
            >
              {stepNumber(column.rank)} {titleOf.get(column.rank) ?? ""}
            </div>
          </div>
        )
      })}
    </div>
  )
}
