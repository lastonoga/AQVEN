import type { ApiClient, Unsubscribe } from "./client.js"
import type { Diagnostic, FlowDetail, FlowSummary, InputSchema, Run, RunDetail } from "./types.js"
import { fixtureDetails, fixtureDiagnostics, fixtureFlows } from "../fixtures/data.js"

const LATENCY_MS = 40

const delayed = <T>(value: T): Promise<T> =>
  new Promise((resolve) => setTimeout(() => resolve(value), LATENCY_MS))

export class FixtureApiClient implements ApiClient {
  readonly source = "fixture" as const
  readonly origin = "src/fixtures/data.ts"

  constructor(private readonly flows: FlowSummary[]) {}

  listFlows(): Promise<FlowSummary[]> {
    return delayed(this.flows)
  }

  getFlow(id: string): Promise<FlowDetail> {
    const detail = fixtureDetails[id]
    if (detail === undefined) return Promise.reject(new Error(`в фикстуре нет IR для «${id}»`))
    return delayed(detail)
  }

  getDiagnostics(id: string): Promise<Diagnostic[]> {
    return delayed(fixtureDiagnostics[id] ?? [])
  }

  getInputSchema(): Promise<InputSchema | null> {
    return delayed(null)
  }

  listRuns(): Promise<Run[] | null> {
    return delayed(null)
  }

  getRun(runId: string): Promise<RunDetail> {
    return Promise.reject(new Error(`в фикстуре нет прогона «${runId}»`))
  }

  startRun(flow: string): Promise<string> {
    return Promise.reject(new Error(`фикстура не исполняет воркфлоу «${flow}»`))
  }

  subscribe(): Unsubscribe {
    return () => undefined
  }
}

export const fixtureClient = (): ApiClient => new FixtureApiClient(fixtureFlows)
export const emptyFixtureClient = (): ApiClient => new FixtureApiClient([])
