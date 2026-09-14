import { edgeLegend } from "./edges.js"

type Props = {
  groups: number
  collapsedCount: number
  onExpandAll: () => void
  onCollapseAll: () => void
}

export function GraphLegend({ groups, collapsedCount, onExpandAll, onCollapseAll }: Props) {
  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-slate-800 bg-slate-950/80 px-3 py-1.5">
      <span className="text-[10px] uppercase tracking-wider text-slate-600">связи</span>
      {edgeLegend.map((look) => (
        <span key={look.kind} className="flex items-center gap-1.5" title={look.title}>
          <svg width="26" height="8" aria-hidden="true">
            <line
              x1="0"
              y1="4"
              x2="20"
              y2="4"
              stroke={look.color}
              strokeWidth={look.width}
              strokeDasharray={look.dash}
            />
            <path d="M20 1 26 4 20 7Z" fill={look.color} />
          </svg>
          <span className="text-[10px] text-slate-400">{look.title}</span>
        </span>
      ))}
      {groups > 0 && (
        <span className="ml-auto flex items-center gap-1.5">
          <span className="font-mono text-[10px] text-slate-600">
            групп {groups} · свёрнуто {collapsedCount}
          </span>
          <button
            type="button"
            onClick={onExpandAll}
            className="rounded border border-slate-800 bg-slate-900/60 px-1.5 py-0.5 text-[10px] text-slate-300 hover:border-slate-600"
          >
            развернуть всё
          </button>
          <button
            type="button"
            onClick={onCollapseAll}
            className="rounded border border-slate-800 bg-slate-900/60 px-1.5 py-0.5 text-[10px] text-slate-300 hover:border-slate-600"
          >
            свернуть всё
          </button>
        </span>
      )}
    </div>
  )
}
