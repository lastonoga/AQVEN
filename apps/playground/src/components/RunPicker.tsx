import { useResource } from "../hooks/use-resource.js"
import { startedRuns } from "../run/registry.js"
import { formatMs, formatStamp, runLabels, runTones } from "../run/styles.js"
import { flowHref, navigate, runHref } from "../routing/route.js"
import type { ApiClient, Run, RunStatus } from "../api/index.js"
import type { RunSelection } from "../run-context.js"

type Props = { client: ApiClient; flowId: string; revision: number; selection: RunSelection }

type PickerRun = { id: string; startedAt: number; status: RunStatus | null }

const fromServer = (runs: Run[], flowId: string): PickerRun[] =>
  runs.filter((run) => run.flow === flowId).map((run) => ({ id: run.id, startedAt: run.startedAt, status: run.status }))

const fromRegistry = (flowId: string): PickerRun[] =>
  startedRuns()
    .filter((item) => item.flow === flowId)
    .map((item) => ({ id: item.id, startedAt: item.startedAt, status: null }))

const loadRuns = async (client: ApiClient, flowId: string): Promise<PickerRun[]> => {
  const listed = await client.listRuns()
  const rows = listed === null ? fromRegistry(flowId) : fromServer(listed, flowId)
  return [...rows].sort((a, b) => b.startedAt - a.startedAt)
}

const withSelected = (rows: PickerRun[], selection: RunSelection): PickerRun[] => {
  if (selection.runId === null) return rows
  if (rows.some((row) => row.id === selection.runId)) return rows
  const startedAt = selection.run?.startedAt ?? Date.now()
  return [{ id: selection.runId, startedAt, status: selection.run?.status ?? null }, ...rows]
}

const optionLabel = (row: PickerRun): string => {
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

export function RunPicker({ client, flowId, revision, selection }: Props) {
  const status = selection.view?.status ?? "none"
  const runs = useResource(() => loadRuns(client, flowId), `flow-runs:${flowId}:${revision}:${status}`)
  const rows = withSelected(runs.data ?? [], selection)
  const latest = rows[0] ?? null

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-slate-800 bg-slate-950/80 px-3 py-1.5">
      <span className="font-mono text-[10px] uppercase tracking-wide text-slate-600">прогон</span>
      <select
        value={selection.runId ?? ""}
        onChange={(event) => navigate(flowHref(flowId, event.target.value === "" ? null : event.target.value))}
        className="max-w-[22rem] rounded bg-slate-900 px-2 py-1 font-mono text-[12px] text-slate-200 ring-1 ring-slate-700"
      >
        <option value="">без прогона</option>
        {rows.map((row) => (
          <option key={row.id} value={row.id}>
            {optionLabel(row)}
          </option>
        ))}
      </select>
      <button
        type="button"
        disabled={latest === null || latest.id === selection.runId}
        onClick={() => latest !== null && navigate(flowHref(flowId, latest.id))}
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
      {rows.length === 0 && runs.data !== null && (
        <span className="font-mono text-[11px] text-slate-600">прогонов ещё не было</span>
      )}
    </div>
  )
}
