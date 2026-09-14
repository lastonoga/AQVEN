export type FlowMode = "schema" | "run"

export type Route =
  | { name: "list" }
  | { name: "flow"; id: string; mode: FlowMode; runId: string | null }
  | { name: "runs" }
  | { name: "run"; runId: string }

type Matcher = { pattern: RegExp; build: (value: string) => Route }

const RUN_PARAM = "run"
const RUN_SEGMENT = "run"

const splitQuery = (value: string): { path: string; query: string } => {
  const at = value.indexOf("?")
  if (at < 0) return { path: value, query: "" }
  return { path: value.slice(0, at), query: value.slice(at + 1) }
}

const decodeOrNull = (value: string | undefined): string | null => {
  if (value === undefined) return null
  if (value === "") return null
  return decodeURIComponent(value)
}

const flowRoute = (value: string): Route => {
  const { path, query } = splitQuery(value)
  const [head = "", segment, tail] = path.split("/")
  const id = decodeURIComponent(head)
  const remembered = new URLSearchParams(query).get(RUN_PARAM)
  if (segment !== RUN_SEGMENT) return { name: "flow", id, mode: "schema", runId: remembered }
  return { name: "flow", id, mode: "run", runId: decodeOrNull(tail) ?? remembered }
}

const matchers: Matcher[] = [
  { pattern: /^#\/flow\/(.+)$/, build: flowRoute },
  { pattern: /^#\/run\/(.+)$/, build: (value) => ({ name: "run", runId: decodeURIComponent(value) }) },
  { pattern: /^#\/runs\/?$/, build: () => ({ name: "runs" }) },
]

export const parseRoute = (hash: string): Route => {
  for (const matcher of matchers) {
    const value = matcher.pattern.exec(hash)?.[1]
    if (value !== undefined) return matcher.build(value)
    if (matcher.pattern.test(hash)) return matcher.build("")
  }
  return { name: "list" }
}

export const flowHref = (id: string, runId: string | null = null): string => {
  const base = `#/flow/${encodeURIComponent(id)}`
  if (runId === null) return base
  return `${base}?${RUN_PARAM}=${encodeURIComponent(runId)}`
}

export const flowRunHref = (id: string, runId: string | null = null): string => {
  const base = `#/flow/${encodeURIComponent(id)}/${RUN_SEGMENT}`
  if (runId === null) return base
  return `${base}/${encodeURIComponent(runId)}`
}

const modeHrefs: Record<FlowMode, (id: string, runId: string | null) => string> = {
  schema: flowHref,
  run: flowRunHref,
}

export const flowModeHref = (mode: FlowMode, id: string, runId: string | null): string =>
  modeHrefs[mode](id, runId)

export const runHref = (runId: string): string => `#/run/${encodeURIComponent(runId)}`
export const runsHref = "#/runs"
export const listHref = "#/"

export const navigate = (href: string): void => {
  window.location.hash = href
}
