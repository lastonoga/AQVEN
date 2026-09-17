import { describe, expect, it } from "vitest"
import type { RunSummary } from "@/domain"
import { isoDateTime, runId } from "@/data/ids"
import { runChips } from "./run-chips"

const RUNS: readonly RunSummary[] = [
  {
    id: runId("8247"),
    status: "degraded",
    origin: { kind: "fork", of: runId("8241") },
    costUsd: 0.4187,
    durationS: 18.42,
    assertions: { passed: 44, total: 48 },
    startedAt: isoDateTime("2026-09-16T10:00:00.000Z"),
  },
  {
    id: runId("8233"),
    status: "failed",
    origin: { kind: "baseline" },
    costUsd: 0.1904,
    durationS: 7.1,
    assertions: { passed: 31, total: 48 },
    startedAt: isoDateTime("2026-09-14T12:00:00.000Z"),
  },
]

describe("runChips", () => {
  it("marks the newest run as latest and selects the resolved run", () => {
    expect(runChips(RUNS, runId("8233"))).toEqual([
      {
        id: "8247",
        ref: "#8247",
        status: "degraded",
        tone: "warning",
        ratio: "44/48",
        cost: "$0.4187",
        selected: false,
        latest: true,
        startedAt: "2026-09-16T10:00:00.000Z",
      },
      {
        id: "8233",
        ref: "#8233",
        status: "failed",
        tone: "destructive",
        ratio: "31/48",
        cost: "$0.1904",
        selected: true,
        latest: false,
        startedAt: "2026-09-14T12:00:00.000Z",
      },
    ])
  })

  it("selects nothing when no run resolved", () => {
    expect(runChips(RUNS, null).some((chip) => chip.selected)).toBe(false)
  })
})
