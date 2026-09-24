import { afterEach, describe, expect, it, vi } from "vitest"
import type { ApiSpecEvent } from "@/domain"
import { API_BASE } from "@/api/client"
import { FakeEventStream } from "@/test/event-source"
import { PROJECT_EVENT_TYPES, projectEventStream, projectEventsUrl, readProjectEvent } from "./project-events"

const PROGRESS = {
  type: "series_progress",
  seq: 4,
  at: "2026-09-24T10:00:00Z",
  tree_hash: "sha256-tree",
  series_id: "01a0c100-0000-7000-8000-000000000001",
  experiment_id: "reply_noninferior_mistral",
  flow_id: "support_case",
  done: 3,
  total: 12,
  spend_usd: "0.03",
}

describe("project event stream", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("listens for every spec and research event type on the project channel", () => {
    expect(projectEventsUrl()).toBe(`${API_BASE}/events/spec`)
    expect(new Set(PROJECT_EVENT_TYPES)).toEqual(
      new Set([
        "files_changed",
        "diagnostics_changed",
        "resync",
        "series_started",
        "series_progress",
        "series_status_changed",
        "finding_written",
        "experiment_changed",
      ]),
    )
  })

  it("reads a well-formed event and rejects anything else", () => {
    expect(readProjectEvent(PROGRESS)).toEqual(PROGRESS)
    expect(readProjectEvent({ ...PROGRESS, type: "series_status" })).toBeNull()
    expect(readProjectEvent({ ...PROGRESS, seq: "4" })).toBeNull()
    expect(readProjectEvent(null)).toBeNull()
  })

  it("opens one EventSource and hands each frame to the listener", () => {
    FakeEventStream.reset()
    vi.stubGlobal("EventSource", FakeEventStream)
    const received: ApiSpecEvent[] = []
    const close = projectEventStream((event) => {
      received.push(event)
    })
    const source = FakeEventStream.latestOn(projectEventsUrl())
    source.emit("series_progress", PROGRESS)
    source.emit("series_status", { ...PROGRESS, type: "series_status" })
    close()
    expect(FakeEventStream.opened).toHaveLength(1)
    expect(received.map((event) => event.seq)).toEqual([4])
    expect(source.closed).toBe(true)
  })
})
