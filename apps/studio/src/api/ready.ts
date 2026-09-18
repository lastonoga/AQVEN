import { API_BASE } from "./client"

export const SERVER_PHASES = ["starting", "ready", "stopping"] as const
export type ServerPhase = (typeof SERVER_PHASES)[number]

export type ServerReady = { readonly phase: ServerPhase } | { readonly phase: "unreachable" }

const phaseOf = (body: unknown): ServerPhase => {
  const status = (body as { readonly status?: unknown } | null)?.status
  return SERVER_PHASES.find((phase) => phase === status) ?? "starting"
}

export const readServerPhase = async (): Promise<ServerReady> => {
  const response = await fetch(`${API_BASE}/ready`, { credentials: "same-origin" }).catch(() => null)
  if (response === null || !response.ok) return { phase: "unreachable" }
  return { phase: phaseOf(await response.json()) }
}
