import { describe, expect, it } from "vitest"
import type { CallColumn } from "@/domain"
import { callId, columnId } from "@/data/ids"
import { columnPaint, outputAccent, outputPaint } from "./paint"

const column = (patch: Partial<CallColumn>): CallColumn => ({ id: columnId("c"), callId: callId("call_c"), name: "c", ...patch })

describe("columnPaint", () => {
  it("paints failed columns destructive before every other rule", () => {
    expect(columnPaint(column({ status: "failed", flags: ["best"] }), true)).toEqual({ surface: "destructive" })
    expect(columnPaint(column({ check: { checks: [{ name: "shot 4 shows a logo", pass: false }] } }), false)).toEqual({ surface: "destructive" })
    expect(columnPaint(column({ output: { kind: "verdict", verdict: "invented" } }), false)).toEqual({ surface: "destructive" })
  })

  it("paints best over open and open over muted statuses", () => {
    expect(columnPaint(column({ flags: ["best"] }), true)).toEqual({ surface: "success" })
    expect(columnPaint(column({ status: "degraded" }), true)).toEqual({ surface: "llm" })
  })

  it("mutes degraded, cached, idle, waiting, skipped, aborted and selected columns", () => {
    const muted = [
      column({ status: "degraded" }),
      column({ status: "cached" }),
      column({ status: "idle" }),
      column({ status: "waiting" }),
      column({ status: "skipped" }),
      column({ status: "aborted" }),
      column({ flags: ["selected"] }),
    ]
    expect(muted.map((item) => columnPaint(item, false))).toEqual(muted.map(() => ({ surface: "subtle" })))
  })

  it("leaves ok columns and passing verdicts unpainted", () => {
    expect(columnPaint(column({ status: "ok" }), false)).toEqual({})
    expect(columnPaint(column({ output: { kind: "verdict", verdict: "approved" } }), false)).toEqual({})
  })
})

describe("outputAccent", () => {
  it("has no accent in headed groups", () => {
    expect(outputAccent(column({ status: "ok" }), true)).toBeUndefined()
    expect(outputPaint(column({ status: "ok" }), true)).toEqual({})
  })

  it("prefers the output status, then the column status, then best, then intermediate", () => {
    expect(outputAccent(column({ status: "ok", output: { kind: "status", status: "awaiting" } }), false)).toBe("warning")
    expect(outputAccent(column({ status: "cached" }), false)).toBe("neutral")
    expect(outputAccent(column({ status: "degraded" }), false)).toBe("warning")
    expect(outputAccent(column({ flags: ["best"] }), false)).toBe("success")
    expect(outputAccent(column({ output: { kind: "status", status: "aborted" } }), false)).toBe("loop")
    expect(outputPaint(column({}), false)).toEqual({ accent: "neutral" })
  })
})
