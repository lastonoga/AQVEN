import type { ApiClient, Unsubscribe } from "./client.js"
import type {
  Diagnostic,
  FlowDetail,
  FlowSummary,
  InputSchema,
  RunDetail,
  Run,
  ServerEvent,
} from "./types.js"

const readJson = async <T>(response: Response, what: string): Promise<T> => {
  if (response.ok) return (await response.json()) as T
  throw new Error(`${what}: HTTP ${response.status} ${response.statusText}`)
}

const JSON_TYPE = "application/json"

const isJson = (response: Response): boolean =>
  (response.headers.get("content-type") ?? "").includes(JSON_TYPE)

const STREAM_EVENT_NAMES = ["message", "synth", "diagnostics", "synth_error", "run"] as const

const KNOWN_EVENTS = new Set<string>(["synth", "diagnostics", "synth_error", "run"])

const isServerEvent = (value: unknown): value is ServerEvent =>
  typeof value === "object" && value !== null && KNOWN_EVENTS.has(String((value as { t?: unknown }).t))

const parseEvent = (raw: string): ServerEvent | null => {
  try {
    const parsed: unknown = JSON.parse(raw)
    return isServerEvent(parsed) ? parsed : null
  } catch {
    return null
  }
}

export class HttpApiClient implements ApiClient {
  readonly source = "api" as const

  constructor(private readonly base: string) {}

  get origin(): string {
    return this.base
  }

  private async get<T>(path: string, what: string): Promise<T> {
    const response = await fetch(`${this.base}${path}`, { headers: { accept: "application/json" } })
    return readJson<T>(response, what)
  }

  listFlows(): Promise<FlowSummary[]> {
    return this.get<FlowSummary[]>("/flows", "GET /flows")
  }

  getFlow(id: string): Promise<FlowDetail> {
    return this.get<FlowDetail>(`/flows/${encodeURIComponent(id)}`, `GET /flows/${id}`)
  }

  getDiagnostics(id: string): Promise<Diagnostic[]> {
    return this.get<Diagnostic[]>(`/flows/${encodeURIComponent(id)}/diagnostics`, `GET /flows/${id}/diagnostics`)
  }

  private async getOptional<T>(path: string): Promise<T | null> {
    const response = await fetch(`${this.base}${path}`, { headers: { accept: JSON_TYPE } })
    if (!response.ok) return null
    if (!isJson(response)) return null
    return (await response.json()) as T
  }

  getInputSchema(id: string): Promise<InputSchema | null> {
    return this.getOptional<InputSchema>(`/flows/${encodeURIComponent(id)}/input-schema`)
  }

  listRuns(): Promise<Run[] | null> {
    return this.getOptional<Run[]>("/runs")
  }

  async getRun(runId: string): Promise<RunDetail> {
    const path = `/runs/${encodeURIComponent(runId)}`
    const response = await fetch(`${this.base}${path}`, { headers: { accept: JSON_TYPE } })
    if (!isJson(response)) throw new Error(`GET ${path}: сервер не отдал JSON, эндпоинт прогона не реализован`)
    return readJson<RunDetail>(response, `GET ${path}`)
  }

  async startRun(flow: string, input: unknown): Promise<string> {
    const response = await fetch(`${this.base}/runs`, {
      method: "POST",
      headers: { "content-type": JSON_TYPE, accept: JSON_TYPE },
      body: JSON.stringify({ flow, input }),
    })
    if (!isJson(response)) throw new Error("POST /runs: сервер не отдал JSON, запуск не реализован")
    const body = (await response.json()) as { runId?: unknown; error?: unknown; message?: unknown }
    if (!response.ok) throw new Error(`POST /runs: ${String(body.error ?? response.status)} ${String(body.message ?? "")}`.trim())
    if (typeof body.runId !== "string") throw new Error("POST /runs: в ответе нет runId")
    return body.runId
  }

  subscribe(onEvent: (event: ServerEvent) => void): Unsubscribe {
    const stream = new EventSource(`${this.base}/events`)
    const handle = (message: MessageEvent<string>): void => {
      const event = parseEvent(message.data)
      if (event === null) return
      onEvent(event)
    }
    for (const name of STREAM_EVENT_NAMES) stream.addEventListener(name, handle)
    return () => {
      for (const name of STREAM_EVENT_NAMES) stream.removeEventListener(name, handle)
      stream.close()
    }
  }
}
