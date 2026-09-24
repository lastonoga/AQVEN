import { createContext, useContext } from "react"
import type { HealthSnapshot, ServerSignal } from "./monitor"

export type ServerNotice = { readonly signal: ServerSignal; readonly serial: number }

export type ServerHealthValue = {
  readonly snapshot: HealthSnapshot
  readonly checkNow: () => Promise<void>
  readonly notice: ServerNotice | null
  readonly dismissNotice: () => void
}

export const ServerHealthContext = createContext<ServerHealthValue | null>(null)

export function useServerHealth(): ServerHealthValue {
  const value = useContext(ServerHealthContext)
  if (value === null) throw new Error("ServerHealthProvider is required")
  return value
}
