import { describe, expect, it } from "vitest"
import * as ids from "@/data/ids"
import { liveRuns } from "@/mocks/data/runs"
import { decimalNumber, elapsedMs, inlineJson, latencyText, runRows, tokensText } from "./presenters"

const NOW = new Date("2026-09-17T22:00:00Z")
const REF_TAIL = 6

describe("decimalNumber", () => {
  it("parses every decimal spelling the engine emits", () => {
    expect(decimalNumber("0E-17")).toBe(0)
    expect(decimalNumber("0.00")).toBe(0)
    expect(decimalNumber("0")).toBe(0)
    expect(decimalNumber("0.00110120")).toBeCloseTo(0.0011012)
    expect(decimalNumber("not a number")).toBe(0)
  })
})

describe("latencyText", () => {
  it("keeps milliseconds under a second and switches to seconds above it", () => {
    expect(latencyText(null)).toBeNull()
    expect(latencyText(0)).toBe("0 ms")
    expect(latencyText(94)).toBe("94 ms")
    expect(latencyText(1_400)).toBe("1.4 s")
  })
})

describe("elapsedMs", () => {
  it("measures a finished run from its own timestamps and a live one against now", () => {
    expect(elapsedMs("2026-09-17T20:17:22.522000Z", "2026-09-17T20:17:23.502387Z", NOW)).toBe(980)
    expect(elapsedMs("2026-09-17T21:00:00.000Z", null, NOW)).toBe(3_600_000)
    expect(elapsedMs("nonsense", null, NOW)).toBeNull()
  })
})

describe("runRows", () => {
  const rows = runRows(liveRuns, ids.runId(liveRuns[1]?.run_id ?? ""), NOW)

  it("produces one row per run and marks the selected one", () => {
    expect(rows).toHaveLength(liveRuns.length)
    expect(rows.filter((row) => row.selected).map((row) => row.id)).toEqual([liveRuns[1]?.run_id])
  })

  it("counts finished nodes against every node the run knows about", () => {
    const first = rows[0]
    const counts = liveRuns[0]?.node_counts
    expect(first?.done).toBe((counts?.ok ?? 0) + (counts?.failed ?? 0) + (counts?.skipped ?? 0) + (counts?.cancelled ?? 0))
    expect(first?.total).toBe(first === undefined ? -1 : first.done + (counts?.pending ?? 0) + (counts?.running ?? 0) + (counts?.suspended ?? 0))
    expect(first?.progress).toBeGreaterThan(0)
  })

  it("formats the decimal cost string as money", () => {
    expect(rows.every((row) => row.cost.startsWith("$"))).toBe(true)
  })

  it("reports a fork only for a fork lineage", () => {
    liveRuns.forEach((run, index) => {
      const expected = run.lineage?.relation === "fork" ? `#${run.lineage.parent_run_id.slice(-REF_TAIL)}` : null
      expect(rows[index]?.forkedFrom).toBe(expected)
    })
  })

  it("names the assignee of the first wait, or nobody", () => {
    liveRuns.forEach((run, index) => {
      expect(rows[index]?.waitingOn).toBe(run.waits.at(0)?.assignee ?? null)
    })
  })
})

describe("inlineJson", () => {
  it("pretty-prints an inline value and describes a blob instead", () => {
    expect(inlineJson(null)).toBeNull()
    expect(inlineJson({ kind: "inline", value: { ok: true } })).toBe('{\n  "ok": true\n}')
    expect(
      inlineJson({
        kind: "blob",
        blob_id: "sha256-1",
        sha256: "sha256-1",
        size_bytes: 1865,
        media_type: "image/jpeg",
        preview: "",
        truncated: true,
      }),
    ).toContain("image/jpeg")
  })
})

describe("tokensText", () => {
  it("pairs input and output tokens", () => {
    expect(tokensText(7173, 690)).toBe("7,173 / 690")
  })
})
