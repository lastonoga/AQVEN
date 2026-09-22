import createClient from "openapi-fetch"
import type { paths } from "@/api/schema"

export const API_BASE = "/api"

export type ApiProblem = {
  readonly path: readonly (string | number)[]
  readonly code: string
  readonly message: string
}

export type ApiFailure = {
  readonly op: string
  readonly code: string
  readonly message: string
  readonly problems: readonly ApiProblem[]
  readonly retryAfterMs: number | null
}

export class ApiError extends Error {
  readonly status: number
  readonly op: string
  readonly code: string
  readonly problems: readonly ApiProblem[]
  readonly retryAfterMs: number | null

  constructor(status: number, failure: ApiFailure) {
    super(failure.message)
    this.name = "ApiError"
    this.status = status
    this.op = failure.op
    this.code = failure.code
    this.problems = failure.problems
    this.retryAfterMs = failure.retryAfterMs
  }
}

const UNAUTHORIZED = 401
const NOT_FOUND = 404

const FALLBACK_CODES: Readonly<Record<number, string>> = {
  400: "REQUEST_INVALID",
  401: "UNAUTHORIZED",
  403: "FORBIDDEN",
  404: "NOT_FOUND",
  405: "METHOD_NOT_ALLOWED",
  500: "INTERNAL",
}

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> => typeof value === "object" && value !== null

const isList = (value: unknown): value is readonly unknown[] => Array.isArray(value)

const isPathStep = (value: unknown): value is string | number => typeof value === "string" || typeof value === "number"

const textAt = (body: Readonly<Record<string, unknown>>, key: string, fallback: string): string => {
  const value = body[key]
  return typeof value === "string" && value.length > 0 ? value : fallback
}

const problemAt = (value: unknown): ApiProblem | null => {
  if (!isRecord(value)) return null
  const { path, code, message } = value
  if (!isList(path) || typeof code !== "string" || typeof message !== "string") return null
  return { path: path.filter(isPathStep), code, message }
}

const problemsAt = (body: Readonly<Record<string, unknown>>): readonly ApiProblem[] => {
  const rows = body["problems"]
  if (!isList(rows)) return []
  return rows.flatMap((row) => problemAt(row) ?? [])
}

const retryAt = (body: Readonly<Record<string, unknown>>): number | null => {
  const value = body["retry_after_ms"]
  return typeof value === "number" ? value : null
}

export const failureOf = (status: number, body: unknown): ApiFailure => {
  if (!isRecord(body)) {
    return { op: "", code: FALLBACK_CODES[status] ?? "HTTP_ERROR", message: `HTTP ${String(status)}`, problems: [], retryAfterMs: null }
  }
  return {
    op: textAt(body, "op", ""),
    code: textAt(body, "code", FALLBACK_CODES[status] ?? "HTTP_ERROR"),
    message: textAt(body, "message", `HTTP ${String(status)}`),
    problems: problemsAt(body),
    retryAfterMs: retryAt(body),
  }
}

export const apiError = (status: number, body: unknown): ApiError => new ApiError(status, failureOf(status, body))

export const isUnauthorized = (error: unknown): boolean => error instanceof ApiError && error.status === UNAUTHORIZED

export const isNotFound = (error: unknown): boolean => error instanceof ApiError && error.status === NOT_FOUND

const LOCAL_ORIGIN = "http://localhost"

const origin = (): string => (typeof window === "undefined" ? LOCAL_ORIGIN : window.location.origin)

const currentFetch = (request: Request): Promise<Response> => fetch(request)

export const api = createClient<paths>({ baseUrl: origin(), credentials: "same-origin", fetch: currentFetch })

export const unwrap = <T>(result: { readonly data?: T; readonly error?: unknown; readonly response: Response }): T => {
  if (result.data !== undefined) return result.data
  throw apiError(result.response.status, result.error)
}
