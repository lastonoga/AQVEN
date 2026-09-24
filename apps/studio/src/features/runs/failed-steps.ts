import type { ApiExecutionAddress, ApiRunError, ApiRunEvent } from "@/domain"
import { executionKey, prettyJson } from "@/features/trace"
import { isRecord } from "@/lib/sse"

export type FailedStep = {
  readonly key: string
  readonly address: ApiExecutionAddress
  readonly error: ApiRunError | null
}

type NodeFinished = Extract<ApiRunEvent, { type: "node_finished" }>

const MESSAGE_LIMIT = 240
const ELLIPSIS = "…"
const WHITESPACE = /\s+/g
const JSON_START = /^\s*[[{]/

const isFinished = (event: ApiRunEvent): event is NodeFinished => event.type === "node_finished"

const latestFinishes = (events: readonly ApiRunEvent[]): ReadonlyMap<string, NodeFinished> =>
  new Map(events.filter(isFinished).map((event) => [executionKey(event.address), event]))

export const failedSteps = (events: readonly ApiRunEvent[]): readonly FailedStep[] =>
  [...latestFinishes(events)]
    .filter(([, event]) => event.status === "failed")
    .map(([key, event]) => ({ key, address: event.address, error: event.error ?? null }))

export const isListedFailure = (error: ApiRunError, steps: readonly FailedStep[]): boolean => {
  const address = error.address
  if (address === null) return false
  const key = executionKey(address)
  return steps.some((step) => step.key === key && step.error?.code === error.code)
}

export const oneLine = (message: string, limit: number = MESSAGE_LIMIT): string => {
  const line = message.split("\n").find((part) => part.trim().length > 0)?.replace(WHITESPACE, " ").trim() ?? ""
  return line.length <= limit ? line : `${line.slice(0, limit).trimEnd()}${ELLIPSIS}`
}

export const isLongMessage = (message: string, limit: number): boolean => message.length > limit || message.trim().includes("\n")

const nestedJson = (text: string): unknown => {
  if (!JSON_START.test(text)) return text
  try {
    const parsed: unknown = JSON.parse(text)
    return unwrapped(parsed)
  } catch {
    return text
  }
}

function unwrapped(value: unknown): unknown {
  if (typeof value === "string") return nestedJson(value)
  if (Array.isArray(value)) return value.map(unwrapped)
  if (isRecord(value)) return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, unwrapped(item)]))
  return value
}

export const readableResponse = (text: string): string => {
  const value = nestedJson(text)
  return typeof value === "string" ? value : prettyJson(value)
}
