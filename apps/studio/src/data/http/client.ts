export const API_BASE = "/api/v1"

const NOT_FOUND = 404

export class HttpError extends Error {
  readonly status: number
  readonly path: string

  constructor(status: number, path: string) {
    super(`HTTP ${String(status)} ${path}`)
    this.name = "HttpError"
    this.status = status
    this.path = path
  }
}

const request = (path: string, init?: RequestInit): Promise<Response> => fetch(`${API_BASE}${path}`, init)

const ensureOk = (response: Response, path: string): Response => {
  if (!response.ok) throw new HttpError(response.status, path)
  return response
}

const decode = async <T>(response: Response): Promise<T> => {
  const body: unknown = await response.json()
  return body as T
}

export const readJson = async <T>(path: string, init?: RequestInit): Promise<T> =>
  decode<T>(ensureOk(await request(path, init), path))

export const readJsonOrNull = async <T>(path: string, init?: RequestInit): Promise<T | null> => {
  const response = await request(path, init)
  if (response.status === NOT_FOUND) return null
  return decode<T>(ensureOk(response, path))
}

export const postJson = async (path: string, body: unknown): Promise<void> => {
  const init: RequestInit = { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }
  ensureOk(await request(path, init), path)
}
