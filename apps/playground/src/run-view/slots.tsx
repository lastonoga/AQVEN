import { ValueView } from "../components/ValueView.js"
import { previewOf } from "../refs/index.js"
import { nodeTones, formatMs } from "../run/styles.js"
import type { ComponentType, ReactNode } from "react"
import type { Ir, Render } from "../api/index.js"
import type { RunSelection } from "../run-context.js"
import type { RunNodeView } from "../run/events.js"

export type RunPanelProps = {
  ir: Ir
  selection: RunSelection
  nodeId: string | null
  onSelectNode: (nodeId: string | null) => void
}

export type RunPanel = {
  title: string
  Component: ComponentType<RunPanelProps>
  appliesTo: (props: RunPanelProps) => boolean
}

export type RunPanelSlot = "steps" | "detail" | "compare"

const CELL_LIMIT = 160

const cell = (value: unknown): string => {
  if (value === undefined) return "—"
  return previewOf(value, CELL_LIMIT).text.replace(/\s+/g, " ")
}

const renderOf = (selection: RunSelection, nodeId: string): Render | undefined => selection.renders[nodeId]

const inputOf = (node: RunNodeView, render: Render | undefined): unknown => node.input ?? render?.input
const outputOf = (node: RunNodeView, render: Render | undefined): unknown => node.output ?? render?.output
const promptOf = (render: Render | undefined): string | null => render?.prompt ?? null

const nodesOf = (selection: RunSelection): readonly RunNodeView[] => selection.view?.nodes ?? []

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="font-mono text-[10px] uppercase tracking-wide text-slate-600">{label}</span>
      {children}
    </div>
  )
}

function StepsFallback({ selection, nodeId, onSelectNode }: RunPanelProps) {
  const rows = nodesOf(selection)
  if (rows.length === 0) return <p className="p-3 font-mono text-[12px] text-slate-600">шагов ещё нет</p>
  return (
    <table className="w-full border-collapse text-left">
      <thead className="sticky top-0 bg-slate-950">
        <tr className="font-mono text-[10px] uppercase tracking-wide text-slate-600">
          <th className="w-8 px-2 py-1 font-normal">№</th>
          <th className="px-2 py-1 font-normal">узел</th>
          <th className="w-20 px-2 py-1 font-normal">статус</th>
          <th className="w-20 px-2 py-1 font-normal">длит.</th>
          <th className="px-2 py-1 font-normal">вход</th>
          <th className="px-2 py-1 font-normal">промт</th>
          <th className="px-2 py-1 font-normal">выход</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((node, index) => {
          const render = renderOf(selection, node.nodeId)
          const tone = nodeTones[node.status]
          const active = node.nodeId === nodeId
          return (
            <tr
              key={node.nodeId}
              onClick={() => onSelectNode(node.nodeId)}
              className={`cursor-pointer border-t border-slate-900 align-top hover:bg-slate-900/60 ${active ? "bg-slate-900" : ""}`}
            >
              <td className="px-2 py-1 font-mono text-[10px] text-slate-600">{index + 1}</td>
              <td className="px-2 py-1 font-mono text-[11px] text-slate-200">{node.nodeId}</td>
              <td className="px-2 py-1">
                <span className={`rounded px-1 py-0.5 font-mono text-[10px] ring-1 ${tone.pill}`}>{tone.label}</span>
              </td>
              <td className="px-2 py-1 font-mono text-[10px] text-slate-400">{formatMs(node.durationMs)}</td>
              <td className="max-w-[16rem] truncate px-2 py-1 font-mono text-[10px] text-slate-500">
                {cell(inputOf(node, render))}
              </td>
              <td className="max-w-[16rem] truncate px-2 py-1 font-mono text-[10px] text-slate-500">
                {promptOf(render) ?? "—"}
              </td>
              <td className="max-w-[16rem] truncate px-2 py-1 font-mono text-[10px] text-slate-400">
                {cell(outputOf(node, render))}
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

function DetailFallback({ selection, nodeId }: RunPanelProps) {
  const node = nodeId === null ? null : nodesOf(selection).find((item) => item.nodeId === nodeId) ?? null
  if (node === null) {
    return <p className="p-3 font-mono text-[12px] text-slate-600">выберите шаг в таблице или узел на канвасе</p>
  }
  const render = renderOf(selection, node.nodeId)
  const prompt = promptOf(render)
  return (
    <div className="flex flex-col gap-3 p-3">
      <div className="flex items-center gap-2">
        <span className={`rounded px-1.5 py-0.5 font-mono text-[10px] ring-1 ${nodeTones[node.status].pill}`}>
          {nodeTones[node.status].label}
        </span>
        <span className="font-mono text-[13px] text-slate-100">{node.nodeId}</span>
        {node.kind !== null && <span className="font-mono text-[11px] text-slate-500">{node.kind}</span>}
      </div>
      <Field label="вход">
        <ValueView value={inputOf(node, render)} />
      </Field>
      {prompt !== null && (
        <Field label="промт">
          <pre className="max-h-60 overflow-auto whitespace-pre-wrap rounded bg-slate-900/70 p-2 font-mono text-[11px] leading-relaxed text-slate-300">
            {prompt}
          </pre>
        </Field>
      )}
      <Field label={node.outputType === null ? "выход" : `выход · ${node.outputType}`}>
        <ValueView value={outputOf(node, render)} />
      </Field>
      {node.error !== null && (
        <Field label="ошибка">
          <p className="rounded border border-red-900/60 bg-red-950/20 px-2 py-1 text-[12px] text-red-300">
            {node.error}
          </p>
        </Field>
      )}
    </div>
  )
}

function CompareFallback() {
  return <p className="p-3 font-mono text-[12px] text-slate-600">сравнение веток недоступно</p>
}

const defaults: Record<RunPanelSlot, RunPanel> = {
  steps: { title: "шаги", Component: StepsFallback, appliesTo: () => true },
  detail: { title: "шаг", Component: DetailFallback, appliesTo: () => true },
  compare: { title: "ветки", Component: CompareFallback, appliesTo: () => false },
}

const panels: Record<RunPanelSlot, RunPanel> = { ...defaults }

export const registerRunPanel = (slot: RunPanelSlot, panel: RunPanel): void => {
  panels[slot] = panel
}

export const runPanelOf = (slot: RunPanelSlot): RunPanel => panels[slot]
