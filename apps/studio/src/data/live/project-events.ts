import type { ApiSpecEvent } from "@/domain"
import { API_BASE } from "@/api/client"
import { isRecord, subscribeEvents, type Unsubscribe } from "@/lib/sse"

export type ProjectEventType = ApiSpecEvent["type"]

export type ProjectEventStream = (onEvent: (event: ApiSpecEvent) => void) => Unsubscribe

const EVENT_TYPES: Readonly<Record<ProjectEventType, ProjectEventType>> = {
  files_changed: "files_changed",
  diagnostics_changed: "diagnostics_changed",
  resync: "resync",
  series_started: "series_started",
  series_progress: "series_progress",
  series_status_changed: "series_status_changed",
  finding_written: "finding_written",
  experiment_changed: "experiment_changed",
}

export const PROJECT_EVENT_TYPES: readonly ProjectEventType[] = Object.values(EVENT_TYPES)

const isProjectEventType = (value: unknown): value is ProjectEventType => typeof value === "string" && Object.hasOwn(EVENT_TYPES, value)

const isProjectEvent = (value: unknown): value is ApiSpecEvent =>
  isRecord(value) && typeof value["seq"] === "number" && isProjectEventType(value["type"])

export const readProjectEvent = (value: unknown): ApiSpecEvent | null => (isProjectEvent(value) ? value : null)

export const projectEventsUrl = (): string => `${API_BASE}/events/spec`

export const projectEventStream: ProjectEventStream = (onEvent) =>
  subscribeEvents({ url: projectEventsUrl(), types: PROJECT_EVENT_TYPES, read: readProjectEvent, onEvent })
