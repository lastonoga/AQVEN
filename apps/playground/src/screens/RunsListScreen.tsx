import { useResource } from "../hooks/use-resource.js"
import { foldRun } from "../run/events.js"
import { startedRuns } from "../run/registry.js"
import { formatMs, formatStamp, runLabels, runTones } from "../run/styles.js"
import { flowHref, runHref } from "../routing/route.js"
import type { ApiClient, Run } from "../api/index.js"

type Props = { client: ApiClient; revision: number }

type RunRow = {
  run: Run
  nodes: number | null
  simplifications: number | null
}

type Listing = { source: "server" | "local"; rows: RunRow[] }

const DETAIL_LIMIT = 25

const describe = async (client: ApiClient, run: Run): Promise<RunRow> => {
  try {
    const detail = await client.getRun(run.id)
    const view = foldRun(detail.events, detail.run.status)
    return { run: detail.run, nodes: view.nodes.length, simplifications: view.simplifications.length }
  } catch {
    return { run, nodes: null, simplifications: null }
  }
}

const enrich = (client: ApiClient, runs: Run[]): Promise<RunRow[]> =>
  Promise.all(runs.slice(0, DETAIL_LIMIT).map((run) => describe(client, run)))

const localRuns = async (client: ApiClient): Promise<RunRow[]> => {
  const known = startedRuns()
  const loaded = await Promise.all(
    known.map((item) =>
      client
        .getRun(item.id)
        .then((detail) => detail.run)
        .catch(() => null),
    ),
  )
  return enrich(client, loaded.filter((run): run is Run => run !== null))
}

const loadListing = async (client: ApiClient): Promise<Listing> => {
  const fromServer = await client.listRuns()
  if (fromServer !== null) return { source: "server", rows: await enrich(client, fromServer) }
  return { source: "local", rows: await localRuns(client) }
}

const durationOf = (run: Run): number | null => (run.endedAt === undefined ? null : run.endedAt - run.startedAt)

const HEADERS = ["статус", "когда", "воркфлоу", "прогон", "длительность", "узлов", "упрощений"]

function LocalNotice() {
  return (
    <p className="mb-3 rounded border border-amber-900/60 bg-amber-950/20 px-2 py-1.5 text-[11px] leading-relaxed text-amber-300">
      сервер не отдаёт <span className="font-mono">GET /api/runs</span> — показаны только прогоны, запущенные из этого
      браузера
    </p>
  )
}

function Row({ row }: { row: RunRow }) {
  const tone = runTones[row.run.status]
  return (
    <tr className="border-b border-slate-800/70 hover:bg-slate-900/60">
      <td className="py-2 pr-3">
        <span className={`rounded px-1.5 py-0.5 font-mono text-[10px] uppercase ring-1 ${tone.pill}`}>
          {runLabels[row.run.status]}
        </span>
      </td>
      <td className="py-2 pr-4 font-mono text-[12px] text-slate-400">{formatStamp(row.run.startedAt)}</td>
      <td className="py-2 pr-4">
        <a className="font-mono text-[13px] text-slate-300 hover:underline" href={flowHref(row.run.flow)}>
          {row.run.flow}
        </a>
      </td>
      <td className="py-2 pr-4">
        <a className="font-mono text-[13px] text-sky-400 hover:underline" href={runHref(row.run.id)}>
          {row.run.id.slice(0, 8)}
        </a>
      </td>
      <td className="py-2 pr-4 font-mono text-[12px] text-slate-300">{formatMs(durationOf(row.run))}</td>
      <td className="py-2 pr-4 font-mono text-[12px] text-slate-300">{row.nodes ?? "—"}</td>
      <td className="py-2 font-mono text-[12px] text-amber-300">{row.simplifications ?? "—"}</td>
    </tr>
  )
}

export function RunsListScreen({ client, revision }: Props) {
  const listing = useResource(() => loadListing(client), `runs:${revision}`)

  if (listing.error !== null) return <p className="font-mono text-[13px] text-red-400">{listing.error}</p>
  if (listing.data === null) return <p className="font-mono text-[13px] text-slate-500">загрузка…</p>

  const rows = [...listing.data.rows].sort((a, b) => b.run.startedAt - a.run.startedAt)

  return (
    <div>
      {listing.data.source === "local" && <LocalNotice />}
      {rows.length === 0 && (
        <p className="font-mono text-[13px] text-slate-500">прогонов нет — откройте воркфлоу и нажмите «Запустить»</p>
      )}
      {rows.length > 0 && (
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-slate-700 text-left">
              {HEADERS.map((header) => (
                <th
                  key={header}
                  className="pb-2 font-mono text-[11px] font-normal uppercase tracking-wide text-slate-500"
                >
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <Row key={row.run.id} row={row} />
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
