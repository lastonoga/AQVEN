import type { ApiClient } from "./client.js"
import { HttpApiClient } from "./http-client.js"
import { emptyFixtureClient, fixtureClient } from "./fixture-client.js"

const DEFAULT_BASE = "/api"

const factories: Record<string, () => ApiClient> = {
  api: () => new HttpApiClient(import.meta.env.VITE_WF_API_BASE ?? DEFAULT_BASE),
  fixture: fixtureClient,
  empty: emptyFixtureClient,
}

export const createApiClient = (): ApiClient => {
  const requested = import.meta.env.VITE_WF_SOURCE ?? "api"
  const factory = factories[requested] ?? fixtureClient
  return factory()
}

export type { ApiClient, Unsubscribe } from "./client.js"
export type {
  Diagnostic,
  FlowDetail,
  FlowStatus,
  FlowSummary,
  InputField,
  InputFieldUse,
  InputSchema,
  Ir,
  IrNode,
  JsonSchema,
  Render,
  Run,
  RunDetail,
  RunEvent,
  RunStatus,
  ServerEvent,
} from "./types.js"
