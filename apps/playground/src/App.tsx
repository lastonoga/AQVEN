import { useMemo } from "react"
import type { ReactNode } from "react"
import { createApiClient } from "./api/index.js"
import { useRoute } from "./routing/use-route.js"
import { listHref, runsHref } from "./routing/route.js"
import { useServerEvents } from "./hooks/use-server-events.js"
import { FlowListScreen } from "./screens/FlowListScreen.js"
import { FlowGraphScreen } from "./screens/FlowGraphScreen.js"
import { RunScreen } from "./screens/RunScreen.js"
import { RunsListScreen } from "./screens/RunsListScreen.js"
import { RunLauncher } from "./components/RunLauncher.js"
import type { ApiClient } from "./api/index.js"
import type { EventState } from "./hooks/use-server-events.js"
import type { Route } from "./routing/route.js"

const sourceLabels: Record<ApiClient["source"], string> = {
  api: "живой API",
  fixture: "фикстура",
}

function SourceBadge({ client }: { client: ApiClient }) {
  const tone = client.source === "api" ? "text-emerald-400" : "text-amber-400"
  return (
    <span className="font-mono text-[11px] text-slate-500">
      источник <span className={tone}>{sourceLabels[client.source]}</span> · {client.origin}
    </span>
  )
}

function SynthErrorBanner({ state }: { state: EventState }) {
  if (state.synthError === null) return null
  return (
    <div className="border-b border-red-900 bg-red-950/40 px-4 py-2 font-mono text-[12px] text-red-300">
      синтез упал: {state.synthError.flow} · {state.synthError.file} — {state.synthError.message}
    </div>
  )
}

const crumbLabels: Record<Route["name"], (route: Route) => string> = {
  list: () => "",
  flow: (route) => (route.name === "flow" ? route.id : ""),
  runs: () => "прогоны",
  run: (route) => (route.name === "run" ? route.runId.slice(0, 8) : ""),
}

function Crumbs({ route }: { route: Route }) {
  if (route.name === "list") return <span className="font-mono text-[13px] text-slate-200">воркфлоу</span>
  return (
    <span className="font-mono text-[13px] text-slate-200">
      <a className="text-sky-400 hover:underline" href={listHref}>
        воркфлоу
      </a>
      <span className="px-1.5 text-slate-600">/</span>
      {crumbLabels[route.name](route)}
    </span>
  )
}

export function App() {
  const client = useMemo(() => createApiClient(), [])
  const route = useRoute()
  const events = useServerEvents(client)

  const screens: Record<Route["name"], () => ReactNode> = {
    list: () => <FlowListScreen client={client} revision={events.revision} />,
    flow: () =>
      route.name === "flow" ? (
        <FlowGraphScreen client={client} flowId={route.id} runId={route.runId} revision={events.revision} />
      ) : null,
    runs: () => <RunsListScreen client={client} revision={events.revision} />,
    run: () => (route.name === "run" ? <RunScreen client={client} runId={route.runId} /> : null),
  }

  const layouts: Record<Route["name"], string> = {
    list: "overflow-auto p-4",
    runs: "overflow-auto p-4",
    flow: "min-h-0",
    run: "min-h-0",
  }

  return (
    <div className="flex h-full flex-col bg-slate-950">
      <header className="flex shrink-0 items-center justify-between border-b border-slate-800 px-4 py-2">
        <div className="flex items-center gap-3">
          <span className="font-mono text-[12px] font-semibold tracking-wide text-slate-400">wf playground</span>
          <Crumbs route={route} />
        </div>
        <div className="flex items-center gap-3">
          {events.synthMs !== null && (
            <span className="font-mono text-[11px] text-slate-500">синтез {events.synthMs} мс</span>
          )}
          <SourceBadge client={client} />
          <a className="font-mono text-[12px] text-slate-400 hover:text-slate-200 hover:underline" href={runsHref}>
            прогоны
          </a>
          {route.name === "flow" && <RunLauncher client={client} flowId={route.id} />}
        </div>
      </header>
      <SynthErrorBanner state={events} />
      <main className={`flex-1 ${layouts[route.name]}`}>{screens[route.name]()}</main>
    </div>
  )
}
