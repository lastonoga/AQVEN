import { API_BASE, api, apiError, unwrap } from "@/api/client"
import { healthOf, type ServerHealth, type ServerSource } from "@/api/server"

const HEALTH_PATH = `${API_BASE}/health`

const LOCAL_ORIGIN = "http://localhost"

const REQUEST: RequestInit = { credentials: "same-origin", cache: "no-store", headers: { Accept: "application/json" } }

const origin = (): string => (typeof window === "undefined" ? LOCAL_ORIGIN : window.location.origin)

const bodyOf = async (response: Response): Promise<unknown> => {
  try {
    const body: unknown = await response.json()
    return body
  } catch {
    return null
  }
}

const health = async (): Promise<ServerHealth> => {
  const response = await fetch(new URL(HEALTH_PATH, origin()), REQUEST)
  const body = await bodyOf(response)
  const report = healthOf(body)
  if (report === null) throw apiError(response.status, body)
  return report
}

export const server: ServerSource = {
  health,
  status: async () => unwrap(await api.GET("/api/status")),
}
