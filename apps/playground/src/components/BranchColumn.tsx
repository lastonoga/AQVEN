import { ValueView } from "./ValueView.js"
import { nodeTones, formatMs } from "../run/styles.js"
import type { ReactNode } from "react"
import type { DiffPart } from "./prompt-diff.js"
import type { FanBranch, FanRow, FanRowKind } from "./fan-model.js"

export type BranchCellProps = {
  row: FanRow
  branch: FanBranch
  parts: readonly DiffPart[]
  onSelectNode?: (nodeId: string) => void
}

const MISSING = "нет данных"

const formatMicros = (micros: number | null): string => {
  if (micros === null) return "—"
  return `$${(micros / 1_000_000).toFixed(4)}`
}

function Missing({ text = MISSING }: { text?: string }) {
  return <span className="font-mono text-[11px] text-slate-600">{text}</span>
}

function AxisCell({ row, branch }: BranchCellProps) {
  const value = branch.axes[row.axis] ?? ""
  if (value === "") return <Missing text="—" />
  return <span className="break-words font-mono text-[12px] text-teal-300">{value}</span>
}

function InputCell({ branch }: BranchCellProps) {
  if (!branch.input.known) return <Missing />
  return <ValueView value={branch.input.value} depth={1} />
}

function PromptCell({ branch, parts }: BranchCellProps) {
  if (branch.prompt === null) return <Missing text="промт не записан" />
  return (
    <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded bg-slate-900/60 p-1.5 font-mono text-[11px] leading-relaxed">
      {parts.map((part, index) => (
        <span
          key={`${index}-${part.text.slice(0, 8)}`}
          className={part.same ? "text-slate-500" : "rounded bg-amber-950/60 text-amber-200"}
        >
          {part.text}
        </span>
      ))}
    </pre>
  )
}

function OutputCell({ branch }: BranchCellProps) {
  if (branch.error !== null && !branch.output.known) {
    return <span className="break-words text-[11.5px] text-red-300">{branch.error}</span>
  }
  if (!branch.output.known) return <Missing />
  return <ValueView value={branch.output.value} depth={1} />
}

function DurationCell({ branch }: BranchCellProps) {
  return <span className="font-mono text-[12px] text-slate-300">{formatMs(branch.durationMs)}</span>
}

function CostCell({ branch }: BranchCellProps) {
  return <span className="font-mono text-[12px] text-slate-300">{formatMicros(branch.costMicros)}</span>
}

function StatusCell({ branch }: BranchCellProps) {
  const tone = nodeTones[branch.status]
  return <span className={`rounded px-1.5 py-0.5 font-mono text-[10px] ring-1 ${tone.pill}`}>{tone.label}</span>
}

const cells: Record<FanRowKind, (props: BranchCellProps) => ReactNode> = {
  axis: AxisCell,
  input: InputCell,
  prompt: PromptCell,
  output: OutputCell,
  duration: DurationCell,
  cost: CostCell,
  status: StatusCell,
}

export function BranchCell(props: BranchCellProps) {
  const Cell = cells[props.row.kind]
  return (
    <div className="min-w-0 border-l border-slate-800 px-2 py-1.5">
      <Cell {...props} />
    </div>
  )
}

function NodeLink({ nodeId, onSelectNode }: { nodeId: string; onSelectNode?: (nodeId: string) => void }) {
  if (onSelectNode === undefined) {
    return <span className="truncate font-mono text-[11px] text-slate-500">{nodeId}</span>
  }
  return (
    <button
      type="button"
      onClick={() => onSelectNode(nodeId)}
      title="выделить узел ветки на схеме"
      className="truncate font-mono text-[11px] text-sky-400 hover:underline"
    >
      {nodeId}
    </button>
  )
}

export function BranchHeader({ branch, onSelectNode }: { branch: FanBranch; onSelectNode?: (nodeId: string) => void }) {
  const tone = nodeTones[branch.status]
  return (
    <div className="flex min-w-0 flex-col gap-0.5 border-l border-slate-800 bg-slate-900/40 px-2 py-1.5">
      <div className="flex min-w-0 items-center gap-1.5">
        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${tone.dot}`} />
        <span className="min-w-0 truncate text-[12px] text-slate-100" title={branch.label}>
          {branch.label}
        </span>
      </div>
      {branch.nodeId !== null && <NodeLink nodeId={branch.nodeId} onSelectNode={onSelectNode} />}
    </div>
  )
}
