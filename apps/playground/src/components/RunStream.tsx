import { useCallback, useEffect, useMemo, useState } from "react"
import { kindStyle } from "../graph/kinds.js"
import { formatMs, nodeTones } from "../run/styles.js"
import { ValueLines } from "./ValueLines.js"
import { buildTable, filtered, GLYPHS, SIGNAL_LABELS, SIGNAL_TONES, totalsOf } from "./run-table.js"
import { buildSteps, formatTokens, formatUsd } from "./run-steps.js"
import { DENSITIES, DENSITY_LABELS, linesFor, readDensity, writeDensity } from "./run-density.js"
import { DATA_TEXT, HAIRLINE, MUTED_TEXT, SURFACE, TONE } from "./run-tokens.js"
import type { Density } from "./run-density.js"
import type { RunTotals, SignalKind, TableRow } from "./run-table.js"
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

const NOOP = (): void => undefined

const KINDS: readonly SignalKind[] = ["error", "check", "empty", "slow", "stub"]

const BAR_WIDTH = 220

const COLUMNS = "grid gap-x-5 gap-y-3 md:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)_minmax(0,1.3fr)]"

const CAP = "max-w-[640px]"

const PROBLEM_KINDS: readonly SignalKind[] = ["error", "check", "empty"]

const countProblems = (counts: ReadonlyMap<SignalKind, number>): number =>
  PROBLEM_KINDS.reduce((total, kind) => total + (counts.get(kind) ?? 0), 0)

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <span className="flex items-baseline gap-1">
      <span className={`${MUTED_TEXT} ${TONE["muted"]}`}>{label}</span>
      <span className={`${DATA_TEXT} ${TONE["data"]} tabular-nums`}>{value}</span>
    </span>
  )
}

function Totals({ totals, run }: { totals: RunTotals; run: Run | null }) {
  const tone = nodeTones[run?.status === "error" ? "error" : run?.status === "running" ? "running" : "ok"]
  return (
    <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
      <span className={`rounded px-1.5 py-0.5 font-mono text-[12px] ring-1 ${tone.pill}`}>{tone.label}</span>
      <Metric label="шагов" value={`${totals.done}/${totals.steps}`} />
      <Metric label="время" value={formatMs(totals.ms)} />
      {totals.tokens !== null && <Metric label="токенов" value={formatTokens(totals.tokens)} />}
      {totals.costUsd !== null && <Metric label="стоимость" value={formatUsd(totals.costUsd)} />}
      {totals.lanes > 1 && <Metric label="параллельно" value={`до ${totals.lanes}`} />}
      {totals.errors > 0 && (
        <span className={`${DATA_TEXT} ${TONE["error"]} tabular-nums`}>ошибок {totals.errors}</span>
      )}
      {totals.checksFailed > 0 && (
        <span className={`${DATA_TEXT} ${TONE["error"]} tabular-nums`}>проверок не прошло {totals.checksFailed}</span>
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

function Filters({
  counts,
  active,
  onToggle,
  onOnlyProblems,
  problems,
}: {
  counts: ReadonlyMap<SignalKind, number>
  active: ReadonlySet<SignalKind>
  onToggle: (kind: SignalKind) => void
  onOnlyProblems: () => void
  problems: number
}) {
  const shown = KINDS.filter((kind) => (counts.get(kind) ?? 0) > 0)
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {problems > 0 && (
        <button
          type="button"
          onClick={onOnlyProblems}
          className={`rounded px-2 py-1 font-mono text-[12px] ring-1 ring-[#7F2A24] ${TONE["error"]} hover:bg-[#2A1512]`}
        >
          только проблемные {problems}
        </button>
      )}
      {shown.map((kind) => (
        <button
          key={kind}
          type="button"
          onClick={() => onToggle(kind)}
          title={SIGNAL_LABELS[kind]}
          className={`rounded px-2 py-1 font-mono text-[12px] ring-1 ${
            active.has(kind) ? "bg-[#1E2A3A] ring-[#2E3E52]" : `ring-transparent hover:bg-[#151E2C]`
          }`}
        >
          <span className={SIGNAL_TONES[kind]}>{GLYPHS[kind]}</span>
          <span className={`ml-1 tabular-nums ${TONE["data"]}`}>{counts.get(kind)}</span>
          <span className={`ml-1 ${TONE["muted"]}`}>{SIGNAL_LABELS[kind]}</span>
        </button>
      ))}
    </div>
  )
}

function Bar({ row }: { row: TableRow }) {
  const tone = nodeTones[row.step.status]
  if (row.bar === null) return <span style={{ width: BAR_WIDTH }} />
  return (
    <span className="relative block h-2.5 shrink-0" style={{ width: BAR_WIDTH }}>
      <span className="absolute inset-x-0 top-1 h-0.5 rounded bg-[#1E2A3A]" />
      <span
        className={`absolute top-0 h-2.5 rounded-sm ${tone.bar} ${row.bar.running ? "animate-pulse" : ""}`}
        style={{ left: `${row.bar.left}%`, width: `${row.bar.width}%` }}
      />
    </span>
  )
}

function Head({ row, selected, onSelect }: { row: TableRow; selected: boolean; onSelect: () => void }) {
  const { step } = row
  const tone = nodeTones[step.status]
  const kind = kindStyle(step.kind)
  const passed = step.checks.filter((check) => check.ok !== false).length
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`flex h-8 w-full items-center gap-2 px-3 text-left ${selected ? "bg-[#16202F]" : ""}`}
    >
      <span className={`h-4 w-[3px] shrink-0 rounded-sm ${tone.bar}`} />
      <span className={`${MUTED_TEXT} ${TONE["muted"]} w-5 shrink-0 tabular-nums`}>{step.index}</span>
      <span className={`w-4 shrink-0 text-center font-mono text-[13px] ${row.signal === null ? "" : SIGNAL_TONES[row.signal.kind]}`}>
        {row.signal?.glyph ?? ""}
      </span>
      <span className={`truncate text-[14px] font-medium ${TONE["data"]}`}>
        {step.summary ?? step.description ?? step.nodeId}
      </span>
      <span className={`${MUTED_TEXT} ${TONE["muted"]} shrink-0 truncate`}>{step.nodeId}</span>
      <span className={`shrink-0 rounded px-1 font-mono text-[11px] ring-1 ${kind.badge}`}>{kind.label}</span>
      <span className="ml-auto flex shrink-0 items-center gap-4">
        <Bar row={row} />
        <span className={`${DATA_TEXT} ${TONE["data"]} w-16 text-right tabular-nums`}>{formatMs(step.durationMs)}</span>
        {step.metrics.totalTokens !== null && (
          <span className={`${DATA_TEXT} ${TONE["number"]} w-20 text-right tabular-nums`}>
            {formatTokens(step.metrics.totalTokens)}
          </span>
        )}
        {step.metrics.costUsd !== null && (
          <span className={`${DATA_TEXT} ${TONE["number"]} w-16 text-right tabular-nums`}>
            {formatUsd(step.metrics.costUsd)}
          </span>
        )}
        {step.checks.length > 0 && (
          <span
            className={`${DATA_TEXT} w-16 text-right tabular-nums ${
              passed === step.checks.length ? TONE["ok"] : TONE["error"]
            }`}
          >
            пров. {passed}/{step.checks.length}
          </span>
        )}
      </span>
    </button>
  )
}

function Body({ row, ir, lines }: { row: TableRow; ir: Ir | null; lines: number }) {
  const { step } = row
  if (lines === 0) return null
  return (
    <div className={`${COLUMNS} px-3 pb-3 pl-[1.6rem]`}>
      <div className={`min-w-0 ${CAP}`}>
        <ValueLines value={step.input} ir={ir} lines={lines} />
      </div>
      <div className={`min-w-0 md:col-span-2 xl:col-span-1 ${CAP}`}>
        {step.prompt === null || step.prompt === "" ? (
          <span className={`${MUTED_TEXT} ${TONE["muted"]}`}>промта нет</span>
        ) : (
          <ValueLines value={step.prompt} ir={ir} lines={lines} />
        )}
      </div>
      <div className={`min-w-0 md:order-none ${CAP}`}>
        {step.error === null ? (
          <ValueLines value={step.output} typeName={step.outputType ?? ""} ir={ir} lines={lines} />
        ) : (
          <span className={`${DATA_TEXT} ${TONE["error"]} whitespace-pre-wrap`}>{step.error}</span>
        )}
      </div>
    </div>
  )
}

function Step({
  row,
  ir,
  density,
  selected,
  onSelect,
}: {
  row: TableRow
  ir: Ir | null
  density: Density
  selected: boolean
  onSelect: () => void
}) {
  return (
    <article className={`border-b ${HAIRLINE} last:border-b-0`}>
      <Head row={row} selected={selected} onSelect={onSelect} />
      <Body row={row} ir={ir} lines={linesFor(density, row.signal?.kind ?? null)} />
    </article>
  )
}

const toggled = (kinds: ReadonlySet<SignalKind>, kind: SignalKind): Set<SignalKind> => {
  const next = new Set(kinds)
  if (!next.delete(kind)) next.add(kind)
  return next
}

export function RunStream({ view, run, renders, ir, selectedId, onSelectNode = NOOP }: Props) {
  const [active, setActive] = useState<ReadonlySet<SignalKind>>(new Set())
  const [density, setDensity] = useState<Density>("normal")

  useEffect(() => setDensity(readDensity()), [])

  const steps = useMemo(() => buildSteps(view, renders), [view, renders])
  const now = run?.endedAt ?? Date.now()
  const table = useMemo(() => buildTable(steps, now), [steps, now])
  const totals = useMemo(() => totalsOf(steps, table.window), [steps, table.window])
  const rows = useMemo(() => filtered(table, active), [table, active])

  const onToggle = useCallback((kind: SignalKind) => setActive((kinds) => toggled(kinds, kind)), [])
  const onPick = useCallback((next: Density) => {
    setDensity(next)
    writeDensity(next)
  }, [])
  const onOnlyProblems = useCallback(() => setActive(new Set(PROBLEM_KINDS)), [])

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
        <div className="flex flex-wrap items-center gap-3">
          <Switch density={density} onPick={onPick} />
          <Filters
            counts={table.counts}
            active={active}
            onToggle={onToggle}
            onOnlyProblems={onOnlyProblems}
            problems={countProblems(table.counts)}
          />
          {active.size > 0 && (
            <button
              type="button"
              onClick={() => setActive(new Set())}
              className={`font-mono text-[12px] ${TONE["link"]} hover:underline`}
            >
              показать все {table.rows.length}
            </button>
          )}
        </div>
      </div>

      {density !== "tight" && (
        <div
          className={`${COLUMNS} sticky top-[5.4rem] z-10 border-b ${HAIRLINE} ${SURFACE} px-3 pb-1 pl-[1.6rem] pt-1`}
        >
          <span className={`${MUTED_TEXT} ${TONE["muted"]} uppercase tracking-[0.08em]`}>вход</span>
          <span className={`${MUTED_TEXT} ${TONE["muted"]} uppercase tracking-[0.08em] md:col-span-2 xl:col-span-1`}>
            промт
          </span>
          <span className={`${MUTED_TEXT} ${TONE["muted"]} uppercase tracking-[0.08em]`}>выход</span>
        </div>
      )}

      {rows.map((row) => (
        <Step
          key={row.step.nodeId}
          row={row}
          ir={ir}
          density={density}
          selected={row.step.nodeId === selectedId}
          onSelect={() => onSelectNode(row.step.nodeId)}
        />
      ))}
    </div>
  )
}
