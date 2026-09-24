import type { ApiSpecEvent } from "@/domain"
import { followFeed, SPEC_FEED } from "@/api/events"
import { isRecord, type Unsubscribe } from "@/lib/sse"

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

const isProjectEventType = (value: unknown): value is ProjectEventType => typeof value === "string" && Object.hasOwn(EVENT_TYPES, value)

const isProjectEvent = (value: unknown): value is ApiSpecEvent =>
  isRecord(value) && typeof value["seq"] === "number" && isProjectEventType(value["type"])

export const readProjectEvent = (value: unknown): ApiSpecEvent | null => (isProjectEvent(value) ? value : null)

export const projectEventStream: ProjectEventStream = (onEvent) => followFeed({ feed: SPEC_FEED, after: 0, read: readProjectEvent, onEvent })
