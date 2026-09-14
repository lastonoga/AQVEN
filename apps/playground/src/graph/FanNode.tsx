import { Handle, Position } from "@xyflow/react"
import type { Node, NodeProps } from "@xyflow/react"
import { KindGlyph } from "./KindGlyph.js"
import { kindStyle } from "./kinds.js"
import { FAN_HEIGHT, FAN_WIDTH } from "./layout.js"

export type FanNodeData = {
  label: string
  note: string
  kind: string
}

export type FanNodeType = Node<FanNodeData, "fan">

const HANDLE = "!h-2 !w-2 !border-0 !bg-teal-600"

export function FanNode({ data }: NodeProps<FanNodeType>) {
  const style = kindStyle(data.kind)
  return (
    <div
      className="flex flex-col justify-center gap-1 rounded-full border border-teal-800/80 bg-slate-950 px-3 py-2 shadow-md"
      style={{ width: FAN_WIDTH, height: FAN_HEIGHT }}
    >
      <Handle type="target" position={Position.Left} className={HANDLE} />
      <div className="flex items-center gap-1.5">
        <span className={`inline-flex items-center rounded p-0.5 ring-1 ${style.badge}`}>
          <KindGlyph shape={style.shape} size={11} />
        </span>
        <span className="truncate font-mono text-[11px] font-semibold text-teal-200">{data.label}</span>
      </div>
      <div className="truncate font-mono text-[9.5px] text-slate-500">{data.note}</div>
      <Handle type="source" position={Position.Right} className={HANDLE} />
    </div>
  )
}
