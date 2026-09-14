export type Route =
  | { name: "list" }
  | { name: "flow"; id: string; runId: string | null }
  | { name: "runs" }
  | { name: "run"; runId: string }

type Matcher = { pattern: RegExp; build: (value: string) => Route }

const RUN_PARAM = "run"

const splitQuery = (value: string): { path: string; query: string } => {
  const at = value.indexOf("?")
  if (at < 0) return { path: value, query: "" }
  return { path: value.slice(0, at), query: value.slice(at + 1) }
}

const flowRoute = (value: string): Route => {
  const { path, query } = splitQuery(value)
  return { name: "flow", id: decodeURIComponent(path), runId: new URLSearchParams(query).get(RUN_PARAM) }
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

export const runHref = (runId: string): string => `#/run/${encodeURIComponent(runId)}`
export const runsHref = "#/runs"
export const listHref = "#/"

export const navigate = (href: string): void => {
  window.location.hash = href
}
