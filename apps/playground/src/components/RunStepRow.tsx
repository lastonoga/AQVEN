import { memo } from "react"
import { kindStyle } from "../graph/kinds.js"
import { formatMs, nodeTones } from "../run/styles.js"
import { RunStepDetail } from "./RunStepDetail.js"
import { ValueCell } from "./ValueCell.js"
import { formatUsd } from "./run-steps.js"
import type { RunStep, StepBadge } from "./run-steps.js"
import type { Ir } from "../api/index.js"
import type { RunSnapshot } from "../refs/index.js"

export const STEP_GRID =
  "grid grid-cols-[1.75rem_minmax(0,12rem)_4.75rem_4rem_4rem_minmax(0,1fr)_minmax(0,1fr)] items-start gap-x-2"

type Props = {
  step: RunStep
  expanded: boolean
  ir: Ir | null
  run: RunSnapshot | null
  onToggle: (nodeId: string) => void
  onSelectNode: (nodeId: string) => void
}

const BADGE = "rounded bg-amber-950 px-1 py-[1px] font-mono text-[10px] text-amber-300 ring-1 ring-amber-900"

const BADGE_LIMIT = 3

function Badges({ badges }: { badges: readonly StepBadge[] }) {
  if (badges.length === 0) return null
  const shown = badges.slice(0, BADGE_LIMIT)
  const rest = badges.slice(BADGE_LIMIT)
  return (
    <span className="mt-0.5 flex flex-wrap items-center gap-1 pl-[1.75rem]">
      {shown.map((badge) => (
        <span key={badge.label} className={BADGE} title={badge.title}>
          {badge.label}
        </span>
      ))}
      {rest.length > 0 && (
        <span className={BADGE} title={rest.map((badge) => badge.title).join("\n")}>
          +{rest.length}
        </span>
      )}
    </span>
  )
}

const timingOf = (step: RunStep): string => {
  if (step.progress !== null) return `${step.progress.index}/${step.progress.total}`
  return formatMs(step.durationMs)
}

function Row({ step, expanded, ir, run, onToggle, onSelectNode }: Props) {
  const tone = nodeTones[step.status]
  const kind = kindStyle(step.kind)
  return (
    <div className="border-b border-slate-900 last:border-b-0">
      <button
        type="button"
        onClick={() => onToggle(step.nodeId)}
        className={`w-full px-2 py-1 text-left ${expanded ? "bg-slate-900/80" : "hover:bg-slate-900/50"}`}
        title={expanded ? "свернуть шаг" : "развернуть шаг"}
      >
        <span className={STEP_GRID}>
          <span className="flex items-baseline gap-1 font-mono text-[11px] text-slate-600">
            <span className="w-2 shrink-0">{expanded ? "▾" : "▸"}</span>
            {step.index}
          </span>
          <span className="flex min-w-0 items-center gap-1.5">
            <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${tone.dot}`} />
            <span
              className={`truncate font-mono text-[12px] ${step.status === "pending" ? "text-slate-500" : "text-slate-200"}`}
              title={step.description ?? step.nodeId}
            >
              {step.nodeId}
            </span>
            <span className={`shrink-0 rounded px-1 font-mono text-[10px] ring-1 ${kind.badge}`} title={kind.title}>
              {kind.label}
            </span>
          </span>
          <span className={`justify-self-start rounded px-1.5 py-0.5 font-mono text-[10px] ring-1 ${tone.pill}`}>
            {tone.label}
          </span>
          <span className="font-mono text-[11px] text-slate-400">{timingOf(step)}</span>
          <span className="font-mono text-[11px] text-slate-400" title="стоимость шага">
            {formatUsd(step.metrics.costUsd)}
          </span>
          <span className="min-w-0">
            <ValueCell value={step.input} />
          </span>
          <span className="min-w-0">
            {step.error === null ? (
              <ValueCell value={step.output} />
            ) : (
              <span className="block truncate font-mono text-[11.5px] text-red-300">{step.error}</span>
            )}
          </span>
        </span>
        <Badges badges={step.badges} />
      </button>
      {expanded && <RunStepDetail step={step} ir={ir} run={run} onSelectNode={onSelectNode} />}
    </div>
  )
}

const same = (a: Props, b: Props): boolean =>
  a.step.signature === b.step.signature &&
  a.step.index === b.step.index &&
  a.step.nodeId === b.step.nodeId &&
  a.expanded === b.expanded &&
  a.ir === b.ir &&
  a.run === b.run &&
  a.onToggle === b.onToggle &&
  a.onSelectNode === b.onSelectNode

export const RunStepRow = memo(Row, same)
