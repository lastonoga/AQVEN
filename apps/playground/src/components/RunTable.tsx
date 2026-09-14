import { useCallback, useMemo, useState } from "react"
import { kindStyle } from "../graph/kinds.js"
import { formatMs, nodeTones } from "../run/styles.js"
import { ValueCell } from "./ValueCell.js"
import { buildTable, filtered, GLYPHS, SIGNAL_LABELS, SIGNAL_TONES } from "./run-table.js"
import { buildSteps, formatTokens, formatUsd } from "./run-steps.js"
import type { Column, SignalKind, Table, TableRow } from "./run-table.js"
import type { RunStep } from "./run-steps.js"
import type { Render, Run } from "../api/index.js"
import type { RunView } from "../run/events.js"

type Props = {
  view: RunView
  run: Run | null
  renders: Readonly<Record<string, Render>>
  selectedId: string | null
  onSelectNode?: (nodeId: string) => void
}

const NOOP = (): void => undefined

const KINDS: readonly SignalKind[] = ["error", "check", "empty", "slow", "stub"]

const WIDTHS: Readonly<Record<Column, string>> = {
  tokens: "4.5rem",
  cost: "4.5rem",
  checks: "3.25rem",
}

const templateOf = (columns: ReadonlySet<Column>): string =>
  [
    "1.5rem",
    "2rem",
    "minmax(0,17rem)",
    "minmax(0,1fr)",
    "minmax(0,11rem)",
    "minmax(0,11rem)",
    ...(Object.keys(WIDTHS) as Column[]).flatMap((column) => (columns.has(column) ? [WIDTHS[column]] : [])),
  ].join(" ")

const titleOf = (step: RunStep): string => step.summary ?? step.description ?? step.nodeId

const toggled = (kinds: ReadonlySet<SignalKind>, kind: SignalKind): Set<SignalKind> => {
  const next = new Set(kinds)
  if (!next.delete(kind)) next.add(kind)
  return next
}

function Legend({
  table,
  active,
  onToggle,
}: {
  table: Table
  active: ReadonlySet<SignalKind>
  onToggle: (kind: SignalKind) => void
}) {
  const shown = KINDS.filter((kind) => (table.counts.get(kind) ?? 0) > 0)
  if (shown.length === 0) return null
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {shown.map((kind) => (
        <button
          key={kind}
          type="button"
          onClick={() => onToggle(kind)}
          title={`показать только: ${SIGNAL_LABELS[kind]}`}
          className={`rounded px-1.5 py-0.5 font-mono text-[11px] ring-1 ${
            active.has(kind) ? "bg-slate-800 ring-slate-600" : "ring-slate-800 hover:bg-slate-900"
          }`}
        >
          <span className={SIGNAL_TONES[kind]}>{GLYPHS[kind]}</span>
          <span className="ml-1 text-slate-400">{table.counts.get(kind)}</span>
          <span className="ml-1 text-slate-600">{SIGNAL_LABELS[kind]}</span>
        </button>
      ))}
    </div>
  )
}

function Scale({ span }: { span: number }) {
  const marks = [0, 0.25, 0.5, 0.75, 1]
  return (
    <span className="relative block h-3">
      {marks.map((mark) => (
        <span
          key={mark}
          className="absolute top-0 font-mono text-[9.5px] text-slate-600"
          style={{ left: `${mark * 100}%`, transform: mark === 1 ? "translateX(-100%)" : "none" }}
        >
          {formatMs(Math.round(span * mark))}
        </span>
      ))}
    </span>
  )
}

function Head({ columns, span }: { columns: ReadonlySet<Column>; span: number | null }) {
  return (
    <div
      className="sticky top-0 z-10 grid items-end gap-x-3 border-b border-slate-800 bg-slate-950 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.08em] text-slate-600"
      style={{ gridTemplateColumns: templateOf(columns) }}
    >
      <span />
      <span>#</span>
      <span>шаг</span>
      <span>{span === null ? "когда" : <Scale span={span} />}</span>
      <span>вход</span>
      <span>выход</span>
      {columns.has("tokens") && <span className="text-right">ткн</span>}
      {columns.has("cost") && <span className="text-right">$</span>}
      {columns.has("checks") && <span className="text-right">✓</span>}
    </div>
  )
}

function Bar({ row }: { row: TableRow }) {
  const tone = nodeTones[row.step.status]
  if (row.bar === null) return <span className="font-mono text-[11px] text-slate-600">—</span>
  return (
    <span className="relative block h-4">
      <span className="absolute inset-x-0 top-1.5 h-1 rounded bg-slate-900" />
      <span
        className={`absolute top-0.5 h-3 rounded ${tone.bar} ${row.bar.running ? "animate-pulse" : ""}`}
        style={{ left: `${row.bar.left}%`, width: `${row.bar.width}%` }}
      />
      <span
        className="absolute top-0 font-mono text-[10px] text-slate-500"
        style={{ left: `calc(${Math.min(row.bar.left + row.bar.width, 88)}% + 6px)` }}
      >
        {formatMs(row.step.durationMs)}
      </span>
    </span>
  )
}

function Row({
  row,
  columns,
  selected,
  onSelect,
}: {
  row: TableRow
  columns: ReadonlySet<Column>
  selected: boolean
  onSelect: () => void
}) {
  const { step } = row
  const tone = nodeTones[step.status]
  const kind = kindStyle(step.kind)
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`grid w-full items-start gap-x-3 border-b border-slate-900 px-3 py-2 text-left last:border-b-0 ${
        selected ? "bg-slate-800/60" : "hover:bg-slate-900/50"
      }`}
      style={{ gridTemplateColumns: templateOf(columns) }}
    >
      <span className={`font-mono text-[13px] leading-5 ${row.signal === null ? "" : SIGNAL_TONES[row.signal.kind]}`}>
        {row.signal?.glyph ?? ""}
      </span>
      <span className="font-mono text-[11.5px] leading-5 text-slate-600">{step.index}</span>
      <span className="flex min-w-0 flex-col">
        <span className="flex min-w-0 items-center gap-1.5">
          <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${tone.dot}`} />
          <span
            className={`truncate text-[13px] leading-5 ${step.status === "pending" ? "text-slate-500" : "text-slate-100"}`}
          >
            {titleOf(step)}
          </span>
        </span>
        <span className="flex min-w-0 items-center gap-1.5 pl-3">
          <span className="truncate font-mono text-[10.5px] text-slate-500">{step.nodeId}</span>
          <span className={`shrink-0 rounded px-1 font-mono text-[9.5px] ring-1 ${kind.badge}`}>{kind.label}</span>
        </span>
      </span>
      <Bar row={row} />
      <span className="min-w-0 leading-5">
        <ValueCell value={step.input} />
      </span>
      <span className="min-w-0 leading-5">
        {step.error === null ? (
          <ValueCell value={step.output} />
        ) : (
          <span className="block truncate font-mono text-[11.5px] text-red-300">{step.error}</span>
        )}
      </span>
      {columns.has("tokens") && (
        <span className="text-right font-mono text-[11px] text-slate-400">
          {formatTokens(step.metrics.totalTokens)}
        </span>
      )}
      {columns.has("cost") && (
        <span className="text-right font-mono text-[11px] text-slate-400">{formatUsd(step.metrics.costUsd)}</span>
      )}
      {columns.has("checks") && (
        <span className="text-right font-mono text-[11px] text-slate-400">
          {step.checks.length === 0 ? "—" : `${step.checks.filter((check) => check.ok !== false).length}/${step.checks.length}`}
        </span>
      )}
    </button>
  )
}

export function RunTable({ view, run, renders, selectedId, onSelectNode = NOOP }: Props) {
  const [active, setActive] = useState<ReadonlySet<SignalKind>>(new Set())
  const steps = useMemo(() => buildSteps(view, renders), [view, renders])
  const now = run?.endedAt ?? Date.now()
  const table = useMemo(() => buildTable(steps, now), [steps, now])
  const rows = useMemo(() => filtered(table, active), [table, active])
  const onToggle = useCallback((kind: SignalKind) => setActive((kinds) => toggled(kinds, kind)), [])

  if (steps.length === 0) {
    return (
      <p className="px-3 py-4 font-mono text-[12px] text-slate-500">
        шагов ещё нет — исполнитель не прислал ни одного события узла
      </p>
    )
  }

  const done = steps.filter((step) => step.status === "ok" || step.status === "error").length

  return (
    <div className="flex min-w-0 flex-col">
      <div className="flex flex-wrap items-center gap-3 border-b border-slate-800 px-3 py-1.5">
        <span className="font-mono text-[11.5px] text-slate-500">
          шагов <span className="text-slate-200">{`${done}/${steps.length}`}</span>
        </span>
        <Legend table={table} active={active} onToggle={onToggle} />
        {active.size > 0 && (
          <button
            type="button"
            onClick={() => setActive(new Set())}
            className="font-mono text-[11px] text-sky-400 hover:underline"
          >
            показать все
          </button>
        )}
      </div>
      <Head columns={table.columns} span={table.window?.span ?? null} />
      {rows.map((row) => (
        <Row
          key={row.step.nodeId}
          row={row}
          columns={table.columns}
          selected={row.step.nodeId === selectedId}
          onSelect={() => onSelectNode(row.step.nodeId)}
        />
      ))}
    </div>
  )
}
