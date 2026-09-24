import { createEventMux } from "@/lib/sse"
import { API_BASE } from "./client"

export const EVENTS_URL = `${API_BASE}/events`

export const EVENTS_RETRY_MS = 3000

export const SPEC_FEED = "spec"

export const runFeed = (runId: string): string => `run:${runId}`

export const chatFeed = (sessionId: string): string => `chat:${sessionId}`

export const followFeed = createEventMux({ url: EVENTS_URL, retryMs: EVENTS_RETRY_MS })
