import { Handle, Position, useStore } from "@xyflow/react"
import type { Node, NodeProps } from "@xyflow/react"
import { KindGlyph } from "./KindGlyph.js"
import { NestedCard } from "./NestedCard.js"
import { kindStyle } from "./kinds.js"
import { stepNumber } from "./ranks.js"
import { useStageHover } from "./stage-hover.js"
import { IN_PORT, OUT_PORT, slotPortsOf } from "./ports.js"
import { NODE_WIDTH } from "./layout.js"
import type { Fact, InputRef, NestedNode } from "./node-facts.js"

export type FlowNodeData = {
  stage: number
  kind: string
  label: string
  note: string
  description: string
  facts: Fact[]
  inputs: InputRef[]
  outputType: string
  nested: NestedNode | null
  height: number
}

export type FlowNodeType = Node<FlowNodeData, "wf">

const HANDLE = "!h-2 !w-2 !border-0 !bg-slate-600"

const SLOT_HANDLE = `${HANDLE} !opacity-0`

const COMPACT_ZOOM = 0.62

const InputPorts = ({ inputs }: { inputs: readonly InputRef[] }) => (
  <>
    <Handle type="target" id={IN_PORT} position={Position.Left} className={HANDLE} />
    {slotPortsOf(inputs.map((input) => input.slot)).map((port) => (
      <Handle key={port} type="target" id={port} position={Position.Left} className={SLOT_HANDLE} />
    ))}
  </>
)

const OutputPort = () => (
  <Handle type="source" id={OUT_PORT} position={Position.Right} className={HANDLE} />
)

const sourcesText = (inputs: readonly InputRef[]): string => {
  const heads = inputs.map((input) => input.source.split(".")[0] ?? input.source)
  return [...new Set(heads)].join(", ")
}

export function FlowNode({ data, selected }: NodeProps<FlowNodeType>) {
  const zoom = useStore((state) => state.transform[2])
  const { hovered } = useStageHover()
  const style = kindStyle(data.kind)
  const ring = selected ? "ring-2 ring-sky-400" : "ring-1 ring-slate-700"
  const dim = hovered !== null && data.stage >= 0 && hovered !== data.stage ? "opacity-30" : "opacity-100"
  const shell = `relative flex flex-col overflow-hidden rounded-md border-l-4 bg-slate-900 shadow-lg transition-opacity ${style.accent} ${ring} ${dim}`
  const step = data.stage < 0 ? null : stepNumber(data.stage)

  if (zoom < COMPACT_ZOOM) {
    return (
      <div className={shell} style={{ width: NODE_WIDTH, height: data.height }}>
        <InputPorts inputs={data.inputs} />
        <div className="flex h-full flex-col justify-center gap-1.5 px-3">
          <div className="flex items-center gap-2">
            {step !== null && (
              <span className="font-mono text-[26px] font-bold leading-none tabular-nums text-slate-500">{step}</span>
            )}
            <span className={`inline-flex items-center gap-1.5 rounded px-1.5 py-1 font-mono text-[14px] leading-none ring-1 ${style.badge}`}>
              <KindGlyph shape={style.shape} size={14} />
              {style.label}
            </span>
          </div>
          <div className="truncate font-mono text-[20px] font-semibold leading-tight text-slate-100">{data.label}</div>
          <div className="truncate font-mono text-[14px] leading-none text-slate-400">
            {data.facts[0]?.value ?? "—"}
          </div>
        </div>
        <OutputPort />
      </div>
    )
  }

  return (
    <div className={shell} style={{ width: NODE_WIDTH }}>
      <InputPorts inputs={data.inputs} />
      <div className="flex items-center gap-1.5 border-b border-slate-800 px-3.5 py-2">
        {step !== null && (
          <span className="rounded-sm bg-slate-800 px-1 py-0.5 font-mono text-[12.5px] font-bold leading-none tabular-nums text-slate-300">
            {step}
          </span>
        )}
        <span className={`inline-flex items-center gap-1 rounded px-1.5 py-1 font-mono text-[11px] leading-none ring-1 ${style.badge}`}>
          <KindGlyph shape={style.shape} />
          {style.label}
        </span>
        <span className="ml-auto truncate text-[11px] text-slate-500">{style.title}</span>
      </div>

      <div className="px-3.5 pt-2">
        <div className="truncate font-mono text-[15px] font-semibold text-slate-100">{data.label}</div>
        <div className="mt-1 line-clamp-2 text-[12px] leading-[1.35] text-slate-400">
          {data.description === "" ? "без описания" : data.description}
        </div>
      </div>

      <div className="mt-2.5 grid grid-cols-2 gap-x-3 px-3.5">
        {data.facts.slice(0, 2).map((fact) => (
          <div key={fact.label} className="min-w-0">
            <div className="truncate text-[10px] uppercase tracking-wide text-slate-500">{fact.label}</div>
            <div className="truncate font-mono text-[12.5px] text-slate-200">{fact.value}</div>
          </div>
        ))}
      </div>

      {data.nested !== null && <NestedCard nested={data.nested} />}

      {data.note !== "" && (
        <div className="mt-2 truncate px-3.5 font-mono text-[11px] text-amber-400/80">{data.note}</div>
      )}

      <div className="mt-auto flex items-center gap-2 border-t border-slate-800 px-3.5 py-1.5 pt-2">
        <span className="text-[10px] uppercase tracking-wide text-slate-500">вход</span>
        <span className="font-mono text-[11.5px] text-slate-300">{data.inputs.length}</span>
        <span className="min-w-0 flex-1 truncate font-mono text-[11.5px] text-slate-500">{sourcesText(data.inputs)}</span>
        <span className="shrink-0 font-mono text-[11.5px] text-emerald-300/80">→ {data.outputType}</span>
      </div>
      <OutputPort />
    </div>
  )
}
