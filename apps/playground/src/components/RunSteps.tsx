import { useCallback, useMemo, useState } from "react"
import { RunStepRow, STEP_GRID } from "./RunStepRow.js"
import { buildSteps, stepSnapshot } from "./run-steps.js"
import type { RunStep } from "./run-steps.js"
import type { Ir, Render, Run } from "../api/index.js"
import type { RunView } from "../run/events.js"

type Props = {
  view: RunView
  run: Run | null
  renders: Readonly<Record<string, Render>>
  ir: Ir | null
  onSelectNode?: (nodeId: string) => void
}

const COLUMNS: readonly string[] = ["#", "узел", "статус", "длит.", "стоим.", "вход", "выход"]

const NOOP = (): void => undefined

const toggled = (ids: ReadonlySet<string>, nodeId: string): ReadonlySet<string> => {
  const next = new Set(ids)
  if (!next.delete(nodeId)) next.add(nodeId)
  return next
}

function Head() {
  return (
    <div
      className={`${STEP_GRID} sticky top-0 z-10 border-b border-slate-800 bg-slate-950 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.08em] text-slate-600`}
    >
      {COLUMNS.map((column) => (
        <span key={column}>{column}</span>
      ))}
    </div>
  )
}

function Toolbar({ steps, expanded, onAll, onNone }: {
  steps: readonly RunStep[]
  expanded: ReadonlySet<string>
  onAll: () => void
  onNone: () => void
}) {
  const done = steps.filter((step) => step.status === "ok" || step.status === "error").length
  return (
    <div className="flex items-center gap-3 border-b border-slate-800 px-2 py-1">
      <span className="font-mono text-[11px] text-slate-500">
        шагов <span className="text-slate-300">{`${done}/${steps.length}`}</span>
      </span>
      <span className="font-mono text-[11px] text-slate-500">
        развёрнуто <span className="text-slate-300">{expanded.size}</span>
      </span>
      <button type="button" onClick={onAll} className="font-mono text-[11px] text-sky-400 hover:underline">
        развернуть все
      </button>
      <button type="button" onClick={onNone} className="font-mono text-[11px] text-sky-400 hover:underline">
        свернуть все
      </button>
    </div>
  )
}

export function RunSteps({ view, run, renders, ir, onSelectNode = NOOP }: Props) {
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set())
  const steps = useMemo(() => buildSteps(view, renders), [view, renders])
  const snapshot = useMemo(() => stepSnapshot(run, renders), [run, renders])
  const onToggle = useCallback((nodeId: string) => setExpanded((ids) => toggled(ids, nodeId)), [])
  const onAll = useCallback(() => setExpanded(new Set(steps.map((step) => step.nodeId))), [steps])
  const onNone = useCallback(() => setExpanded(new Set()), [])

  if (steps.length === 0)
    return (
      <p className="px-3 py-4 font-mono text-[12px] text-slate-500">
        шагов ещё нет — исполнитель не прислал ни одного события узла
      </p>
    )

  return (
    <div className="flex min-w-0 flex-col">
      <Toolbar steps={steps} expanded={expanded} onAll={onAll} onNone={onNone} />
      <Head />
      {steps.map((step) => (
        <RunStepRow
          key={step.nodeId}
          step={step}
          expanded={expanded.has(step.nodeId)}
          ir={ir}
          run={snapshot}
          onToggle={onToggle}
          onSelectNode={onSelectNode}
        />
      ))}
    </div>
  )
}
