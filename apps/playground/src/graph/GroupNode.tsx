import { Handle, Position } from "@xyflow/react"
import type { Node, NodeProps } from "@xyflow/react"
import { KindGlyph } from "./KindGlyph.js"
import { kindStyle } from "./kinds.js"
import { useGroupCollapse } from "./collapse.js"
import { useStageHover } from "./stage-hover.js"
import { IN_PORT, OUT_PORT } from "./ports.js"
import type { GroupInfo } from "./expand.js"

export type GroupNodeData = {
  label: string
  kind: string
  stage: number
  group: GroupInfo
  collapsed: boolean
}

export type GroupNodeType = Node<GroupNodeData, "wfgroup">

const HANDLE = "!h-2 !w-2 !border-0 !bg-slate-600"

const nodeWord = (total: number): string => {
  const tail = total % 10
  const teen = total % 100
  if (teen >= 11 && teen <= 14) return "узлов"
  if (tail === 1) return "узел"
  if (tail >= 2 && tail <= 4) return "узла"
  return "узлов"
}

const branchWord = (total: number): string => {
  const tail = total % 10
  const teen = total % 100
  if (teen >= 11 && teen <= 14) return "веток"
  if (tail === 1) return "ветка"
  if (tail >= 2 && tail <= 4) return "ветки"
  return "веток"
}

const summary = (group: GroupInfo): string => {
  const parts = [`${group.leaves} ${nodeWord(group.leaves)}`]
  if (group.branches > 0) parts.push(`${group.branches} ${branchWord(group.branches)}`)
  return parts.join(" · ")
}

export function GroupNode({ id, data, selected }: NodeProps<GroupNodeType>) {
  const { toggle } = useGroupCollapse()
  const { hovered } = useStageHover()
  const style = kindStyle(data.kind)
  const dim = hovered !== null && data.stage >= 0 && hovered !== data.stage ? "opacity-30" : "opacity-100"
  const ring = selected ? "ring-2 ring-sky-400" : "ring-1 ring-slate-700"
  const tone = data.group.parallel ? "border-teal-700/70" : "border-slate-700"

  const header = (withSummary: boolean) => (
    <div className="flex items-center gap-1.5 px-2.5 py-1.5">
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation()
          toggle(id)
        }}
        title={data.collapsed ? "развернуть" : "свернуть"}
        className="shrink-0 rounded-sm border border-slate-700 bg-slate-900 px-1 py-0.5 font-mono text-[10px] leading-none text-slate-300 hover:border-slate-500 hover:text-slate-100"
      >
        {data.collapsed ? "+" : "−"}
      </button>
      <span
        className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-mono text-[10px] leading-none ring-1 ${style.badge}`}
      >
        <KindGlyph shape={style.shape} />
        {style.label}
      </span>
      <span className="truncate font-mono text-[12px] font-semibold text-slate-100">{data.label}</span>
      {data.group.badge !== "" && (
        <span className="shrink-0 rounded-sm bg-teal-950 px-1 py-0.5 font-mono text-[9px] leading-none text-teal-300 ring-1 ring-teal-700">
          {data.group.badge}
        </span>
      )}
      {withSummary && (
        <span className="ml-auto shrink-0 font-mono text-[10px] text-slate-500">{summary(data.group)}</span>
      )}
    </div>
  )

  if (data.collapsed) {
    return (
      <div
        className={`flex h-full w-full flex-col overflow-hidden rounded-md border-l-4 border border-slate-700 bg-slate-900 shadow-lg transition-opacity ${style.accent} ${ring} ${dim}`}
      >
        <Handle type="target" id={IN_PORT} position={Position.Left} className={HANDLE} />
        {header(false)}
        <div className="border-t border-slate-800 px-2.5 py-1.5">
          <div className="flex items-baseline gap-1.5">
            <span className="truncate font-mono text-[11px] text-slate-300">{data.group.component}</span>
            <span className="ml-auto shrink-0 font-mono text-[10px] text-slate-400">{summary(data.group)}</span>
          </div>
          <div className="truncate text-[10px] text-slate-500">{data.group.role}</div>
          <div className="mt-0.5 truncate font-mono text-[9.5px] text-slate-600">{data.group.note}</div>
        </div>
        <Handle type="source" id={OUT_PORT} position={Position.Right} className={HANDLE} />
      </div>
    )
  }

  return (
    <div
      className={`h-full w-full rounded-lg border border-dashed transition-opacity ${tone} ${ring} ${dim}`}
    >
      <Handle type="target" id={IN_PORT} position={Position.Left} className={HANDLE} />
      {header(true)}
      <div className="-mt-1 flex items-center gap-2 px-2.5">
        <span className="truncate font-mono text-[10px] text-slate-500">{data.group.component}</span>
        <span className="truncate text-[10px] text-slate-600">{data.group.role}</span>
        <span className="min-w-0 flex-1 truncate font-mono text-[9.5px] text-slate-600">{data.group.note}</span>
      </div>
      <Handle type="source" id={OUT_PORT} position={Position.Right} className={HANDLE} />
    </div>
  )
}
