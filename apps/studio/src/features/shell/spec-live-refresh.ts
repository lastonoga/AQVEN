import type { ApiSpecEvent } from "@/domain"
import { API_BASE } from "@/api/client"
import { isRecord, subscribeEvents, type Unsubscribe } from "@/lib/sse"

const SPEC_EVENT_TYPES: readonly string[] = ["files_changed", "diagnostics_changed", "resync"]

const isSpecEvent = (value: unknown): value is ApiSpecEvent =>
  isRecord(value) && typeof value["seq"] === "number" && typeof value["type"] === "string" && SPEC_EVENT_TYPES.includes(value["type"])

const specEventOf = (value: unknown): ApiSpecEvent | null => (isSpecEvent(value) ? value : null)

export const specEventsUrl = (): string => `${API_BASE}/events/spec`

export const subscribeToSpecEvents = (onEvent: (event: ApiSpecEvent) => void): Unsubscribe =>
  subscribeEvents({ url: specEventsUrl(), types: SPEC_EVENT_TYPES, read: specEventOf, onEvent })
