import type {
  Diagnostic,
  FlowDetail,
  FlowSummary,
  InputSchema,
  Run,
  RunDetail,
  ServerEvent,
} from "./types.js"

export type Unsubscribe = () => void

export type ApiClient = {
  readonly source: "api" | "fixture"
  readonly origin: string
  listFlows(): Promise<FlowSummary[]>
  getFlow(id: string): Promise<FlowDetail>
  getDiagnostics(id: string): Promise<Diagnostic[]>
  getInputSchema(id: string): Promise<InputSchema | null>
  startRun(flow: string, input: unknown): Promise<string>
  getRun(runId: string): Promise<RunDetail>
  listRuns(): Promise<Run[] | null>
  subscribe(onEvent: (event: ServerEvent) => void): Unsubscribe
}
