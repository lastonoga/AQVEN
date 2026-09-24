import { afterEach, describe, expect, it, vi } from "vitest"
import type { ApiSpecEvent } from "@/domain"
import { EVENTS_URL, SPEC_FEED } from "@/api/events"
import { FakeEventStream } from "@/test/event-source"
import { projectEventStream, readProjectEvent } from "./project-events"

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

  it("reads a well-formed event of every spec and research type and rejects anything else", () => {
    const types = ["files_changed", "diagnostics_changed", "resync", "series_started", "series_progress", "series_status_changed", "finding_written", "experiment_changed"]
    expect(types.map((type) => readProjectEvent({ ...PROGRESS, type })?.type)).toEqual(types)
    expect(readProjectEvent(PROGRESS)).toEqual(PROGRESS)
    expect(readProjectEvent({ ...PROGRESS, type: "series_status" })).toBeNull()
    expect(readProjectEvent({ ...PROGRESS, seq: "4" })).toBeNull()
    expect(readProjectEvent(null)).toBeNull()
  })

  it("follows the spec feed of the tab stream and hands each project event to the listener", async () => {
    FakeEventStream.reset()
    vi.stubGlobal("EventSource", FakeEventStream)
    const received: ApiSpecEvent[] = []
    const close = projectEventStream((event) => {
      received.push(event)
    })
    await Promise.resolve()
    const source = FakeEventStream.latestOn(EVENTS_URL)
    expect(source.url).toBe(`${EVENTS_URL}?follow=${encodeURIComponent(`${SPEC_FEED}@0`)}`)
    source.emit(SPEC_FEED, PROGRESS)
    source.emit(SPEC_FEED, { ...PROGRESS, seq: 5, type: "series_status" })
    close()
    await Promise.resolve()
    expect(FakeEventStream.opened).toHaveLength(1)
    expect(received.map((event) => event.seq)).toEqual([4])
    expect(source.closed).toBe(true)
  })
})
