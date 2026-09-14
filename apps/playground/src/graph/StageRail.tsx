import { useReactFlow } from "@xyflow/react"
import { KindGlyph } from "./KindGlyph.js"
import { kindStyle } from "./kinds.js"
import { stepNumber } from "./ranks.js"
import { useStageHover } from "./stage-hover.js"
import type { ColumnBox } from "./layout.js"
import type { Stage } from "./ranks.js"

type Props = { stages: readonly Stage[]; columns: readonly ColumnBox[] }

const ZOOM_TO_STAGE = { padding: 0.25, duration: 260 }

const nodeWord = (total: number): string => {
  const tail = total % 10
  const teen = total % 100
  if (teen >= 11 && teen <= 14) return "узлов"
  if (tail === 1) return "узел"
  if (tail >= 2 && tail <= 4) return "узла"
  return "узлов"
}

export function StageRail({ stages, columns }: Props) {
  const { hovered, setHovered } = useStageHover()
  const { fitBounds } = useReactFlow()
  const boxOf = new Map(columns.map((column) => [column.rank, column]))

  const zoomToStage = (rank: number): void => {
    const box = boxOf.get(rank)
    if (box === undefined) return
    void fitBounds({ x: box.x, y: box.y, width: box.width, height: box.height }, ZOOM_TO_STAGE)
  }

  return (
    <div className="flex items-stretch gap-1 overflow-x-auto border-b border-slate-800 bg-slate-950/80 px-3 py-2">
      <div className="mr-2 shrink-0 self-center text-[10px] uppercase tracking-wider text-slate-600">этапы</div>
      {stages.map((stage, index) => {
        const active = hovered === stage.rank
        const tone = active
          ? "border-sky-600 bg-sky-950/40"
          : "border-slate-800 bg-slate-900/60 hover:border-slate-700"
        return (
          <div key={stage.rank} className="flex min-w-0 flex-1 items-center gap-1">
            {index > 0 && <span className="px-0.5 text-slate-700">→</span>}
            <button
              type="button"
              onMouseEnter={() => setHovered(stage.rank)}
              onMouseLeave={() => setHovered(null)}
              onFocus={() => setHovered(stage.rank)}
              onBlur={() => setHovered(null)}
              onClick={() => zoomToStage(stage.rank)}
              title="показать этап крупно"
              className={`w-full min-w-[104px] max-w-[176px] rounded border px-2 py-1 text-left transition-colors ${tone}`}
            >
              <div className="flex items-center gap-1.5">
                <span className="font-mono text-[12px] font-bold tabular-nums text-slate-300">
                  {stepNumber(stage.rank)}
                </span>
                <span className="truncate text-[11px] text-slate-200">{stage.title}</span>
                <span className="ml-auto shrink-0 text-[9px] text-slate-500">
                  {stage.nodeIds.length} {nodeWord(stage.nodeIds.length)}
                </span>
              </div>
              <div className="mt-0.5 flex items-center gap-1">
                {stage.kinds.map((kind, position) => {
                  const style = kindStyle(kind)
                  return (
                    <span key={`${kind}-${position}`} className={`rounded-sm p-0.5 ${style.badge}`}>
                      <KindGlyph shape={style.shape} size={8} />
                    </span>
                  )
                })}
                <span className="truncate font-mono text-[9.5px] text-slate-500">{stage.nodeIds.join(", ")}</span>
              </div>
            </button>
          </div>
        )
      })}
    </div>
  )
}
