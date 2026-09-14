import { useEffect, useState } from "react"
import type { ReactNode } from "react"
import { RunTimeline } from "../components/RunTimeline.js"
import { ValueView } from "../components/ValueView.js"
import { useRun } from "../run/use-run.js"
import { RunOverlayProvider, overlayOf } from "../run/node-status.js"
import { formatClock, formatMs, formatStamp, nodeTones, runLabels, runTones } from "../run/styles.js"
import { flowHref, flowRunHref, runsHref } from "../routing/route.js"
import type { ApiClient, Render, Run, RunEvent } from "../api/index.js"
import type { RunNodeView, RunView } from "../run/events.js"

type Props = { client: ApiClient; runId: string }

const TICK_MS = 250

const useNow = (active: boolean): number => {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    if (!active) return
    const timer = setInterval(() => setNow(Date.now()), TICK_MS)
    return () => clearInterval(timer)
  }, [active])
  return now
}

const messageOf = (event: RunEvent): string => {
  if (typeof event.payload === "string") return event.payload
  if (typeof event.payload !== "object" || event.payload === null) return ""
  const record = event.payload as Record<string, unknown>
  const found = ["message", "error", "reason"].map((key) => record[key]).find((value) => typeof value === "string")
  return typeof found === "string" ? found : ""
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="font-mono text-[10px] uppercase tracking-wide text-slate-600">{label}</span>
      {children}
    </div>
  )
}

function SimplificationBanner({ items }: { items: string[] }) {
  if (items.length === 0) return null
  return (
    <div className="border-b border-amber-900/60 bg-amber-950/20 px-3 py-2">
      <p className="font-mono text-[11px] uppercase tracking-wide text-amber-400">прогон упрощён · {items.length}</p>
      <ul className="mt-1 flex flex-col gap-0.5">
        {items.map((item) => (
          <li key={item} className="text-[12px] text-amber-200">
            · {item}
          </li>
        ))}
      </ul>
    </div>
  )
}

function Header({ run, view, runId, now }: { run: Run | null; view: RunView; runId: string; now: number }) {
  const tone = runTones[view.status]
  const elapsed = view.startedAt === null ? null : (view.endedAt ?? now) - view.startedAt
  const done = view.nodes.filter((node) => node.status !== "pending" && node.status !== "running").length
  const cells: { label: string; value: string }[] = [
    { label: "начат", value: formatStamp(view.startedAt ?? run?.startedAt ?? null) },
    { label: "длительность", value: formatMs(elapsed) },
    { label: "узлов", value: `${done}/${view.nodes.length}` },
    { label: "ir hash", value: run?.irHash ?? "—" },
  ]
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-slate-800 px-3 py-2">
      <div className="flex items-center gap-2">
        <span className={`rounded px-1.5 py-0.5 font-mono text-[10px] uppercase ring-1 ${tone.pill}`}>
          {runLabels[view.status]}
        </span>
        <span className="font-mono text-[13px] text-slate-200">{runId.slice(0, 8)}</span>
        {run !== null && (
          <a className="font-mono text-[12px] text-sky-400 hover:underline" href={flowHref(run.flow)}>
            {run.flow}
          </a>
        )}
        {run !== null && (
          <a
            className="font-mono text-[11px] text-slate-400 hover:text-slate-200 hover:underline"
            href={flowRunHref(run.flow, runId)}
          >
            по схематике
          </a>
        )}
        <a className="font-mono text-[11px] text-slate-500 hover:underline" href={runsHref}>
          все прогоны
        </a>
      </div>
      {cells.map((cell) => (
        <span key={cell.label} className="font-mono text-[11px] text-slate-500">
          {cell.label} <span className="text-slate-300">{cell.value}</span>
        </span>
      ))}
    </div>
  )
}

function Journal({ events }: { events: RunEvent[] }) {
  if (events.length === 0) return <p className="font-mono text-[12px] text-slate-600">событий нет</p>
  return (
    <ul className="flex flex-col gap-0.5">
      {events.map((event) => (
        <li key={event.seq} className="flex items-baseline gap-2">
          <span className="w-8 shrink-0 text-right font-mono text-[10px] text-slate-700">{event.seq}</span>
          <span className="shrink-0 font-mono text-[10px] text-slate-600">{formatClock(event.at)}</span>
          <span className="shrink-0 font-mono text-[11px] text-slate-300">{event.type}</span>
          {event.nodeId !== undefined && (
            <span className="shrink-0 font-mono text-[11px] text-sky-400">{event.nodeId}</span>
          )}
          <span className="min-w-0 truncate text-[11px] text-slate-500">{messageOf(event)}</span>
        </li>
      ))}
    </ul>
  )
}

function Prompt({ render }: { render: Render | undefined }) {
  if (render?.prompt === undefined || render.prompt === null) return null
  return (
    <Field label="отрисованный промт">
      <pre className="max-h-60 overflow-auto whitespace-pre-wrap rounded bg-slate-900/70 p-2 font-mono text-[11px] leading-relaxed text-slate-300">
        {render.prompt}
      </pre>
    </Field>
  )
}

function NodeDetails({ node, render }: { node: RunNodeView; render: Render | undefined }) {
  const tone = nodeTones[node.status]
  return (
    <div className="flex flex-col gap-3 p-3">
      <div className="flex items-center gap-2">
        <span className={`rounded px-1.5 py-0.5 font-mono text-[10px] ring-1 ${tone.pill}`}>{tone.label}</span>
        <span className="font-mono text-[13px] text-slate-100">{node.nodeId}</span>
        {node.kind !== null && <span className="font-mono text-[11px] text-slate-500">{node.kind}</span>}
      </div>

      {node.description !== null && <p className="text-[12px] leading-relaxed text-slate-400">{node.description}</p>}

      <div className="flex gap-4 font-mono text-[11px] text-slate-500">
        <span>
          старт <span className="text-slate-300">{formatClock(node.startedAt)}</span>
        </span>
        <span>
          конец <span className="text-slate-300">{formatClock(node.endedAt)}</span>
        </span>
        <span>
          длит. <span className="text-slate-300">{formatMs(node.durationMs)}</span>
        </span>
      </div>

      {node.simplifications.length > 0 && (
        <Field label="упрощения">
          <ul className="flex flex-col gap-0.5">
            {node.simplifications.map((item) => (
              <li key={item} className="text-[12px] text-amber-300">
                · {item}
              </li>
            ))}
          </ul>
        </Field>
      )}

      {node.error !== null && (
        <Field label="ошибка">
          <p className="rounded border border-red-900/60 bg-red-950/20 px-2 py-1 text-[12px] text-red-300">
            {node.error}
          </p>
        </Field>
      )}

      {node.slots !== null && (
        <Field label="слоты входа (ссылки IR)">
          <ValueView value={node.slots} />
        </Field>
      )}

      <Field label="вход">
        <ValueView value={node.input ?? render?.input} />
      </Field>

      <Prompt render={render} />

      <Field label={node.outputType === null ? "выход" : `выход · ${node.outputType}`}>
        <ValueView value={node.output ?? render?.output} />
      </Field>
      <Field label="события узла">
        <Journal events={node.events} />
      </Field>
    </div>
  )
}

function RunOverview({ run, view }: { run: Run | null; view: RunView }) {
  return (
    <div className="flex flex-col gap-3 p-3">
      <Field label="вход прогона">
        <ValueView value={view.input ?? run?.input} />
      </Field>

      {view.output !== undefined && (
        <Field label={view.outputType === null ? "выход прогона" : `выход прогона · ${view.outputType}`}>
          <ValueView value={view.output} />
        </Field>
      )}
      {view.error !== null && (
        <Field label="ошибка прогона">
          <p className="rounded border border-red-900/60 bg-red-950/20 px-2 py-1 text-[12px] text-red-300">
            {view.error}
          </p>
        </Field>
      )}
      {view.unrecognized.length > 0 && (
        <Field label="события вне словаря">
          <Journal events={view.unrecognized} />
        </Field>
      )}
      <Field label="журнал">
        <Journal events={view.nodes.flatMap((node) => node.events).sort((a, b) => a.seq - b.seq)} />
      </Field>
    </div>
  )
}

export function RunScreen({ client, runId }: Props) {
  const { run, view, renders, error, loading } = useRun(client, runId)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const now = useNow(view.status === "running" || view.status === "queued")

  if (error !== null) {
    return (
      <div className="p-4">
        <p className="font-mono text-[13px] text-red-400">{error}</p>
        <a className="mt-2 inline-block font-mono text-[12px] text-sky-400 hover:underline" href={runsHref}>
          ← к прогонам
        </a>
      </div>
    )
  }

  if (loading && run === null) return <p className="p-4 font-mono text-[13px] text-slate-500">загрузка прогона…</p>

  const selected = view.nodes.find((node) => node.nodeId === selectedId) ?? null

  return (
    <RunOverlayProvider overlay={overlayOf(runId, view)}>
      <div className="flex h-full min-h-0 flex-col">
        <Header run={run} view={view} runId={runId} now={now} />
        <SimplificationBanner items={view.simplifications} />
        <div className="flex min-h-0 flex-1">
          <div className="min-w-0 flex-1 overflow-auto py-1">
            <RunTimeline view={view} now={now} selectedId={selectedId} onSelect={setSelectedId} />
          </div>
          <aside className="w-[26rem] shrink-0 overflow-auto border-l border-slate-800 bg-slate-950/60">
            {selected === null ? (
              <RunOverview run={run} view={view} />
            ) : (
              <NodeDetails node={selected} render={renders[selected.nodeId]} />
            )}
          </aside>
        </div>
      </div>
    </RunOverlayProvider>
  )
}
