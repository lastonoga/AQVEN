import { Handle, Position } from "@xyflow/react"
import type { Node, NodeProps } from "@xyflow/react"
import { KindGlyph } from "./KindGlyph.js"
import { NestedCard } from "./NestedCard.js"
import { BUDGET, NodeZone } from "./NodeZones.js"
import { kindStyle } from "./kinds.js"
import { stepNumber } from "./ranks.js"
import { useStageHover } from "./stage-hover.js"
import { useZoomLevel } from "./use-zoom-level.js"
import { IN_PORT, OUT_PORT, slotPortsOf } from "./ports.js"
import { NODE_WIDTH } from "./layout.js"
import { useNodeRunState } from "../run/node-status.js"
import { formatMs, nodeTones } from "../run/styles.js"
import type { NodeRunState } from "../run/node-status.js"
import type { ZoomLevel } from "./zoom-level.js"
import type { Fact, InputRef, NestedNode } from "./node-facts.js"

export type FlowNodeData = {
  stage: number
  runId: string
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

const SHELL =
  "relative flex h-full flex-col overflow-hidden rounded-md border-l-4 bg-[#12171F] shadow-lg transition-opacity"

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

const sourcesOf = (inputs: readonly InputRef[]): Record<string, unknown> =>
  Object.fromEntries(inputs.map((input) => [input.slot, input.source]))

const factsOf = (facts: readonly Fact[]): Record<string, unknown> =>
  Object.fromEntries(facts.map((fact) => [fact.label, fact.value]))

const headlineOf = (data: FlowNodeData, run: NodeRunState | null): string =>
  run?.summary ?? (data.description === "" ? data.label : data.description)

const moneyOf = (value: number | null): string => {
  if (value === null) return ""
  return value < 1 ? `$${value.toFixed(4)}` : `$${value.toFixed(2)}`
}

const metricsOf = (run: NodeRunState | null): string =>
  run === null
    ? ""
    : [formatMs(run.durationMs), run.totalTokens === null ? "" : `${run.totalTokens} ток`, moneyOf(run.costUsd)]
        .filter((part) => part !== "" && part !== "—")
        .join(" · ")

function Glance({ data, style, dim }: { data: FlowNodeData; style: ReturnType<typeof kindStyle>; dim: string }) {
  const step = data.stage < 0 ? null : stepNumber(data.stage)
  return (
    <div className={`${SHELL} ${style.accent} ${dim} justify-center gap-1 px-4`}>
      <InputPorts inputs={data.inputs} />
      <div className="flex items-baseline gap-3">
        {step !== null && (
          <span className="font-mono text-[30px] font-bold leading-none tabular-nums text-[#9FB0C4]">{step}</span>
        )}
        <span className="font-mono text-[16px] uppercase leading-none tracking-wide text-[#7C8CA3]">
          {style.label}
        </span>
      </div>
      <OutputPort />
    </div>
  )
}

function Brief({
  data,
  run,
  style,
  dim,
}: {
  data: FlowNodeData
  run: NodeRunState | null
  style: ReturnType<typeof kindStyle>
  dim: string
}) {
  const step = data.stage < 0 ? null : stepNumber(data.stage)
  return (
    <div className={`${SHELL} ${style.accent} ${dim} justify-center gap-2 px-4`}>
      <InputPorts inputs={data.inputs} />
      <div className="flex items-baseline gap-3">
        {step !== null && (
          <span className="font-mono text-[22px] font-bold leading-none tabular-nums text-[#9FB0C4]">{step}</span>
        )}
        <span className="truncate font-mono text-[20px] leading-tight text-[#E6EAF0]">{data.label}</span>
      </div>
      <div className="truncate text-[20px] leading-tight text-[#9FB0C4]">{headlineOf(data, run)}</div>
      {metricsOf(run) !== "" && (
        <div className="truncate font-mono text-[14px] leading-none text-[#7C8CA3]">{metricsOf(run)}</div>
      )}
      <OutputPort />
    </div>
  )
}

function Full({
  data,
  run,
  level,
  style,
  dim,
}: {
  data: FlowNodeData
  run: NodeRunState | null
  level: ZoomLevel
  style: ReturnType<typeof kindStyle>
  dim: string
}) {
  const step = data.stage < 0 ? null : stepNumber(data.stage)
  const budget = BUDGET[level]
  const tone = run === null ? null : nodeTones[run.status]
  const input = run === null ? sourcesOf(data.inputs) : run.input
  const prompt = run === null ? data.description : run.prompt
  const output = run === null ? factsOf(data.facts) : run.output

  return (
    <div className={`${SHELL} ${style.accent} ${dim}`}>
      <InputPorts inputs={data.inputs} />
      <header className="flex shrink-0 items-center gap-2 border-b border-[#232A36] bg-[#161C26] px-3.5 py-1.5">
        {step !== null && (
          <span className="font-mono text-[12px] font-bold leading-none tabular-nums text-[#9FB0C4]">{step}</span>
        )}
        <span className={`shrink-0 rounded px-1.5 py-0.5 font-mono text-[10.5px] leading-none ring-1 ${style.badge}`}>
          <KindGlyph shape={style.shape} />
        </span>
        <span className="min-w-0 truncate font-mono text-[12.5px] font-semibold text-[#E6EAF0]">{data.label}</span>
        {run !== null && tone !== null && run.status !== "ok" && (
          <span className={`ml-auto shrink-0 rounded px-1 font-mono text-[10px] ring-1 ${tone.pill}`}>
            {tone.label}
          </span>
        )}
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-1.5 px-3.5 py-2">
        <NodeZone label="вход" value={input} rows={budget.input} level={level} />
        {prompt !== null && prompt !== "" && (
          <NodeZone label="промт" value={prompt} rows={budget.prompt} level={level} />
        )}
        <NodeZone
          label="выход"
          value={output}
          typeName={run?.outputType ?? data.outputType}
          rows={budget.output}
          level={level}
        />
      </div>

      {data.nested !== null && <NestedCard nested={data.nested} />}

      <footer className="flex shrink-0 items-center gap-2 border-t border-[#232A36] bg-[#161C26] px-3.5 py-1">
        <span className="truncate font-mono text-[10px] text-[#7C8CA3]">
          {run === null ? `→ ${data.outputType}` : metricsOf(run)}
        </span>
        {run !== null && run.checksFailed > 0 && (
          <span className="ml-auto shrink-0 font-mono text-[10px] text-[#FF9E8A]">
            проверок не прошло {run.checksFailed}
          </span>
        )}
        {data.note !== "" && (
          <span className="ml-auto shrink-0 truncate font-mono text-[10px] text-amber-400/80">{data.note}</span>
        )}
      </footer>
      <OutputPort />
    </div>
  )
}

export function FlowNode({ data, selected }: NodeProps<FlowNodeType>) {
  const level = useZoomLevel()
  const { hovered } = useStageHover()
  const run = useNodeRunState(data.runId)
  const style = kindStyle(data.kind)
  const ring = selected ? "ring-2 ring-sky-400" : "ring-1 ring-[#232A36]"
  const faded = hovered !== null && data.stage >= 0 && hovered !== data.stage ? "opacity-30" : "opacity-100"
  const dim = `${faded} ${ring}`

  return (
    <div style={{ width: NODE_WIDTH, height: data.height }}>
      {level === 0 && <Glance data={data} style={style} dim={dim} />}
      {level === 1 && <Brief data={data} run={run} style={style} dim={dim} />}
      {level >= 2 && <Full data={data} run={run} level={level} style={style} dim={dim} />}
    </div>
  )
}
