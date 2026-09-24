import type { ApiRunEvent, ApiRunSnapshot, RunId, RunStatus } from "@/domain"
import { followFeed, runFeed } from "@/api/events"
import type { BlobText } from "@/features/call-sheet"
import { isRecord } from "@/lib/sse"

export type RunEventType = ApiRunEvent["type"]

export type RunEventEffect = "append" | "refresh" | "finish"

export type RunEventStream = (runId: RunId, afterSeq: number, onEvent: (event: ApiRunEvent) => void) => () => void

export type RunView = {
  readonly snapshot: ApiRunSnapshot
  readonly events: readonly ApiRunEvent[]
  readonly blobs: readonly BlobText[]
}

export type LiveOverlay = {
  readonly runId: string
  readonly snapshot: ApiRunSnapshot | null
  readonly events: readonly ApiRunEvent[]
  readonly blobs: readonly BlobText[]
  readonly finished: boolean
}

export const RUN_EVENT_EFFECT: Readonly<Record<RunEventType, RunEventEffect>> = {
  run_started: "append",
  node_started: "refresh",
  inference_input_captured: "append",
  inference_prompt_captured: "append",
  inference_checks_captured: "append",
  node_attempt_failed: "append",
  node_progress: "append",
  map_item_recovered: "refresh",
  node_output_delta: "append",
  node_attempt_discarded: "refresh",
  node_suspended: "refresh",
  node_resumed: "refresh",
  node_answer_ignored: "refresh",
  node_wait_timed_out: "refresh",
  node_wait_escalated: "refresh",
  node_finished: "refresh",
  loop_iteration_finished: "refresh",
  loop_exited: "refresh",
  run_suspended: "refresh",
  run_resumed: "refresh",
  run_finished: "finish",
}

const LIVE_STATUSES: ReadonlySet<RunStatus> = new Set<RunStatus>(["queued", "running", "suspended"])

export const isLiveStatus = (status: RunStatus): boolean => LIVE_STATUSES.has(status)

export const isRunEvent = (value: unknown): value is ApiRunEvent =>
  isRecord(value) &&
  typeof value["seq"] === "number" &&
  typeof value["run_id"] === "string" &&
  typeof value["type"] === "string" &&
  Object.hasOwn(RUN_EVENT_EFFECT, value["type"])

export const readRunEvent = (raw: string): ApiRunEvent | null => {
  const parsed: unknown = JSON.parse(raw)
  return isRunEvent(parsed) ? parsed : null
}

const runEventOf = (runId: RunId) => (value: unknown): ApiRunEvent | null => (isRunEvent(value) && value.run_id === runId ? value : null)

export const eventSourceStream: RunEventStream = (runId, afterSeq, onEvent) =>
  followFeed({ feed: runFeed(runId), after: afterSeq, read: runEventOf(runId), onEvent })

const bySeq = (left: ApiRunEvent, right: ApiRunEvent): number => left.seq - right.seq

export const mergeEvents = (base: readonly ApiRunEvent[], extra: readonly ApiRunEvent[]): readonly ApiRunEvent[] => {
  if (extra.length === 0) return base
  const known = new Set(base.map((event) => event.seq))
  const added = extra.filter((event) => !known.has(event.seq))
  if (added.length === 0) return base
  return [...base, ...added].sort(bySeq)
}

export const mergeBlobs = (base: readonly BlobText[], extra: readonly BlobText[]): readonly BlobText[] => {
  if (extra.length === 0) return base
  const known = new Set(base.map((blob) => blob.blobId))
  const added = extra.filter((blob) => !known.has(blob.blobId))
  return added.length === 0 ? base : [...base, ...added]
}

export const lastSeqOf = (snapshot: ApiRunSnapshot, events: readonly ApiRunEvent[]): number =>
  events.reduce((highest, event) => Math.max(highest, event.seq), snapshot.last_seq)

export const emptyOverlay = (runId: string): LiveOverlay => ({ runId, snapshot: null, events: [], blobs: [], finished: false })

export const overlayFor = (overlay: LiveOverlay, runId: string): LiveOverlay => (overlay.runId === runId ? overlay : emptyOverlay(runId))

const newerSnapshot = (base: ApiRunSnapshot, live: ApiRunSnapshot | null): ApiRunSnapshot =>
  live !== null && live.last_seq > base.last_seq ? live : base

export const mergeLive = (base: RunView, overlay: LiveOverlay): RunView => {
  if (overlay.runId !== base.snapshot.run_id) return base
  return {
    snapshot: newerSnapshot(base.snapshot, overlay.snapshot),
    events: mergeEvents(base.events, overlay.events),
    blobs: mergeBlobs(base.blobs, overlay.blobs),
  }
}
