import { formatMs, formatStamp, runLabels, runTones } from "../run/styles.js"
import { navigate, runHref } from "../routing/route.js"
import type { FlowRun, FlowRuns } from "../run-view/flow-runs.js"
import type { RunSelection } from "../run-context.js"

type Props = { runs: FlowRuns; selection: RunSelection; hrefOf: (runId: string | null) => string }

const optionLabel = (row: FlowRun): string => {
  const status = row.status === null ? "?" : runLabels[row.status]
  return `${row.id.slice(0, 8)} · ${status} · ${formatStamp(row.startedAt)}`
}

function StatusPill({ selection }: { selection: RunSelection }) {
  const status = selection.view?.status ?? selection.run?.status ?? null
  if (status === null) return null
  const tone = runTones[status]
  return (
    <span className={`rounded px-1.5 py-0.5 font-mono text-[10px] uppercase ring-1 ${tone.pill}`}>
      {runLabels[status]}
    </span>
  )
}

function Progress({ selection }: { selection: RunSelection }) {
  const view = selection.view
  if (view === null) return null
  const done = view.nodes.filter((node) => node.status !== "pending" && node.status !== "running").length
  return (
    <span className="font-mono text-[11px] text-slate-500">
      узлов <span className="text-slate-300">{`${done}/${view.nodes.length}`}</span> · длит.{" "}
      <span className="text-slate-300">{formatMs(view.durationMs)}</span>
    </span>
  )
}

export function RunPicker({ runs, selection, hrefOf }: Props) {
  const latest = runs.latest

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-slate-800 bg-slate-950/80 px-3 py-1.5">
      <span className="font-mono text-[10px] uppercase tracking-wide text-slate-600">прогон</span>
      <select
        value={selection.runId ?? ""}
        onChange={(event) => navigate(hrefOf(event.target.value === "" ? null : event.target.value))}
        className="max-w-[22rem] rounded bg-slate-900 px-2 py-1 font-mono text-[12px] text-slate-200 ring-1 ring-slate-700"
      >
        <option value="">без прогона</option>
        {runs.rows.map((row) => (
          <option key={row.id} value={row.id}>
            {optionLabel(row)}
          </option>
        ))}
      </select>
      <button
        type="button"
        disabled={latest === null || latest.id === selection.runId}
        onClick={() => latest !== null && navigate(hrefOf(latest.id))}
        className="rounded px-2 py-1 font-mono text-[11px] text-slate-300 ring-1 ring-slate-700 hover:bg-slate-900 disabled:opacity-40"
      >
        последний
      </button>
      <StatusPill selection={selection} />
      <Progress selection={selection} />
      {selection.runId !== null && (
        <a className="font-mono text-[11px] text-sky-400 hover:underline" href={runHref(selection.runId)}>
          открыть прогон
        </a>
      )}
      {selection.error !== null && (
        <span className="font-mono text-[11px] text-red-400">прогон не загрузился: {selection.error}</span>
      )}
      {runs.error !== null && <span className="font-mono text-[11px] text-amber-400">список прогонов: {runs.error}</span>}
      {runs.rows.length === 0 && runs.loaded && (
        <span className="font-mono text-[11px] text-slate-600">прогонов ещё не было</span>
      )}
    </div>
  )
}
