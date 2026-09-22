import type { ApiSpecEvent } from "@/domain"
import { API_BASE } from "@/api/client"

const SPEC_EVENT_TYPES: readonly string[] = ["files_changed", "diagnostics_changed", "resync"]

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> => typeof value === "object" && value !== null

const isSpecEvent = (value: unknown): value is ApiSpecEvent =>
  isRecord(value) && typeof value["seq"] === "number" && typeof value["type"] === "string" && SPEC_EVENT_TYPES.includes(value["type"])

const messageText = (event: Event): string | null => {
  if (!(event instanceof MessageEvent)) return null
  const data: unknown = event.data
  return typeof data === "string" ? data : null
}

const readSpecEvent = (event: Event): ApiSpecEvent | null => {
  const raw = messageText(event)
  if (raw === null) return null
  const parsed: unknown = JSON.parse(raw)
  return isSpecEvent(parsed) ? parsed : null
}

export const specEventsUrl = (): string => `${API_BASE}/events/spec`

const noSubscription = (): void => undefined

export const subscribeToSpecEvents = (onEvent: (event: ApiSpecEvent) => void): (() => void) => {
  if (typeof EventSource === "undefined") return noSubscription
  const source = new EventSource(specEventsUrl())
  const receive = (message: Event): void => {
    const event = readSpecEvent(message)
    if (event !== null) onEvent(event)
  }
  SPEC_EVENT_TYPES.forEach((type) => {
    source.addEventListener(type, receive)
  })
  return () => {
    source.close()
  }
}
