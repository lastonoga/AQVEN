import { useCallback, useEffect, useMemo, useState } from "react"
import { RunTreeView } from "./RunFlow.js"
import { buildRunTree } from "./run-tree.js"
import { buildSteps, formatTokens, formatUsd } from "./run-steps.js"
import { buildTable, GLYPHS, SIGNAL_LABELS, SIGNAL_TONES, totalsOf } from "./run-table.js"
import { DENSITIES, DENSITY_LABELS, DENSITY_LINES, readDensity, writeDensity } from "./run-density.js"
import { DATA_TEXT, HAIRLINE, MUTED_TEXT, SURFACE, TONE } from "./run-tokens.js"
import { formatMs, nodeTones } from "../run/styles.js"
import type { Density } from "./run-density.js"
import type { RunTotals, SignalKind } from "./run-table.js"
import type { Ir, Render, Run } from "../api/index.js"
import type { RunView } from "../run/events.js"

type Props = {
  view: RunView
  run: Run | null
  renders: Readonly<Record<string, Render>>
  ir: Ir | null
  selectedId: string | null
  onSelectNode?: (nodeId: string) => void
}

const KINDS: readonly SignalKind[] = ["error", "check", "empty", "slow", "stub"]

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <span className="flex items-baseline gap-1">
      <span className={`${MUTED_TEXT} ${TONE["muted"]}`}>{label}</span>
      <span className={`${DATA_TEXT} ${TONE["data"]} tabular-nums`}>{value}</span>
    </span>
  )
}

function Totals({ totals, run }: { totals: RunTotals; run: Run | null }) {
  const status = run?.status === "error" ? "error" : run?.status === "running" ? "running" : "ok"
  const tone = nodeTones[status]
  return (
    <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
      <span className={`rounded px-1.5 py-0.5 font-mono text-[12px] ring-1 ${tone.pill}`}>{tone.label}</span>
      <Metric label="шагов" value={`${totals.done}/${totals.steps}`} />
      <Metric label="время" value={formatMs(totals.ms)} />
      {totals.tokens !== null && <Metric label="токенов" value={formatTokens(totals.tokens)} />}
      {totals.costUsd !== null && <Metric label="стоимость" value={formatUsd(totals.costUsd)} />}
      {totals.lanes > 1 && <Metric label="параллельно" value={`до ${totals.lanes}`} />}
      {totals.errors > 0 && <span className={`${DATA_TEXT} ${TONE["error"]}`}>ошибок {totals.errors}</span>}
      {totals.checksFailed > 0 && (
        <span className={`${DATA_TEXT} ${TONE["error"]}`}>проверок не прошло {totals.checksFailed}</span>
      )}
    </div>
  )
}

function Switch({ density, onPick }: { density: Density; onPick: (next: Density) => void }) {
  return (
    <span className={`flex items-center overflow-hidden rounded border ${HAIRLINE}`}>
      {DENSITIES.map((option) => (
        <button
          key={option}
          type="button"
          onClick={() => onPick(option)}
          className={`px-2 py-1 font-mono text-[12px] ${
            option === density ? `bg-[#1E2A3A] ${TONE["data"]}` : TONE["muted"]
          }`}
        >
          {DENSITY_LABELS[option]}
        </button>
      ))}
    </span>
  )
}

function Legend({ counts }: { counts: ReadonlyMap<SignalKind, number> }) {
  const shown = KINDS.filter((kind) => (counts.get(kind) ?? 0) > 0)
  if (shown.length === 0) return null
  return (
    <div className="flex flex-wrap items-center gap-2.5">
      {shown.map((kind) => (
        <span key={kind} className="font-mono text-[12px]">
          <span className={SIGNAL_TONES[kind]}>{GLYPHS[kind]}</span>
          <span className={`ml-1 tabular-nums ${TONE["data"]}`}>{counts.get(kind)}</span>
          <span className={`ml-1 ${TONE["muted"]}`}>{SIGNAL_LABELS[kind]}</span>
        </span>
      ))}
    </div>
  )
}

export function RunStream({ view, run, renders, ir }: Props) {
  const [density, setDensity] = useState<Density>("normal")
  useEffect(() => setDensity(readDensity()), [])

  const steps = useMemo(() => buildSteps(view, renders), [view, renders])
  const now = run?.endedAt ?? Date.now()
  const table = useMemo(() => buildTable(steps, now), [steps, now])
  const totals = useMemo(() => totalsOf(steps, table.window), [steps, table.window])
  const tree = useMemo(() => buildRunTree(view, renders), [view, renders])

  const onPick = useCallback((next: Density) => {
    setDensity(next)
    writeDensity(next)
  }, [])

  if (steps.length === 0) {
    return (
      <p className={`${DATA_TEXT} ${TONE["muted"]} px-3 py-4`}>
        шагов ещё нет, исполнитель не прислал ни одного события узла
      </p>
    )
  }

  return (
    <div className={`flex min-w-0 flex-col ${SURFACE}`}>
      <div className={`sticky top-0 z-20 flex flex-col gap-1.5 border-b ${HAIRLINE} ${SURFACE} px-3 py-2`}>
        <Totals totals={totals} run={run} />
        <div className="flex flex-wrap items-center gap-4">
          <Switch density={density} onPick={onPick} />
          <Legend counts={table.counts} />
        </div>
      </div>
      <div className="px-3 py-3">
        <RunTreeView tree={tree} ir={ir} lines={DENSITY_LINES[density]} />
      </div>
    </div>
  )
}
