import { kindStyle } from "../graph/kinds.js"
import { formatClock, formatMs, nodeTones } from "../run/styles.js"
import type { RunNodeView, RunView } from "../run/events.js"

type Props = {
  view: RunView
  now: number
  selectedId: string | null
  onSelect: (nodeId: string) => void
}

type Span = { left: number; width: number }

const MIN_WIDTH = 1.5

const windowOf = (view: RunView, now: number): { from: number; span: number } => {
  const from = view.startedAt ?? now
  const to = view.endedAt ?? now
  return { from, span: Math.max(to - from, 1) }
}

const spanOf = (node: RunNodeView, from: number, span: number, now: number): Span => {
  if (node.startedAt === null) return { left: 0, width: 0 }
  const end = node.endedAt ?? (node.status === "running" ? now : node.startedAt)
  const left = ((node.startedAt - from) / span) * 100
  const width = Math.max(((end - node.startedAt) / span) * 100, MIN_WIDTH)
  return { left: Math.min(left, 100 - MIN_WIDTH), width: Math.min(width, 100 - left) }
}

function Simplifications({ items }: { items: string[] }) {
  if (items.length === 0) return null
  return (
    <span
      title={items.join("\n")}
      className="shrink-0 rounded bg-amber-950 px-1 py-0.5 font-mono text-[10px] text-amber-300 ring-1 ring-amber-800"
    >
      упрощено · {items.length}
    </span>
  )
}

function Row({ node, span, selected, onSelect }: { node: RunNodeView; span: Span; selected: boolean; onSelect: () => void }) {
  const tone = nodeTones[node.status]
  const kind = kindStyle(node.kind ?? "node")
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`grid w-full grid-cols-[1.5rem_11rem_5rem_1fr_4.5rem] items-center gap-2 px-2 py-1 text-left ${
        selected ? "bg-slate-800/70" : "hover:bg-slate-900/70"
      }`}
    >
      <span className="font-mono text-[11px] text-slate-600">{node.order + 1}</span>
      <span className="flex min-w-0 items-center gap-1.5">
        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${tone.dot}`} />
        <span className={`truncate font-mono text-[12px] ${node.status === "pending" ? "text-slate-500" : "text-slate-200"}`}>
          {node.nodeId}
        </span>
        {node.kind !== null && (
          <span className={`shrink-0 rounded px-1 font-mono text-[10px] ring-1 ${kind.badge}`}>{kind.label}</span>
        )}
      </span>
      <span className={`justify-self-start rounded px-1.5 py-0.5 font-mono text-[10px] ring-1 ${tone.pill}`}>
        {tone.label}
      </span>
      <span className="relative h-3 rounded bg-slate-900">
        <span
          className={`absolute top-0 h-3 rounded ${tone.bar}`}
          style={{ left: `${span.left}%`, width: `${span.width}%` }}
        />
      </span>
      <span className="flex items-center justify-end gap-1.5">
        <Simplifications items={node.simplifications} />
        <span className="font-mono text-[11px] text-slate-400">
          {node.progress === null ? formatMs(node.durationMs) : `${node.progress.index}/${node.progress.total}`}
        </span>
      </span>
    </button>
  )
}

export function RunTimeline({ view, now, selectedId, onSelect }: Props) {
  if (view.nodes.length === 0) {
    return (
      <p className="px-3 py-4 font-mono text-[12px] text-slate-500">
        событий по узлам ещё нет — исполнитель не прислал ни одного <span className="text-slate-400">node_started</span>
      </p>
    )
  }

  const { from, span } = windowOf(view, now)

  return (
    <div className="flex flex-col">
      <div className="grid grid-cols-[1.5rem_11rem_5rem_1fr_4.5rem] gap-2 border-b border-slate-800 px-2 pb-1 font-mono text-[10px] uppercase tracking-wide text-slate-600">
        <span>#</span>
        <span>узел</span>
        <span>статус</span>
        <span>старт {formatClock(view.startedAt)}</span>
        <span className="text-right">длит.</span>
      </div>
      {view.nodes.map((node) => (
        <Row
          key={node.nodeId}
          node={node}
          span={spanOf(node, from, span, now)}
          selected={node.nodeId === selectedId}
          onSelect={() => onSelect(node.nodeId)}
        />
      ))}
    </div>
  )
}
