import { describe, expect, it } from "vitest"
import { EXECUTION_STATUSES, NODE_KINDS, RUN_STATUSES } from "@/domain"
import {
  EXECUTION_STATUS_TONE,
  NODE_KIND,
  PROVENANCE,
  RUN_STATUS_TONE,
  SEVERITY_TONE,
  TEXT_MARK,
  WAIT_STATE_TONE,
} from "./presets"
import { TONES, type Tone } from "./tone"

const tonesOf = (table: Readonly<Record<string, Tone>>): readonly Tone[] => Object.values(table)

describe("presets", () => {
  it("covers every engine node kind", () => {
    expect(Object.keys(NODE_KIND).sort()).toEqual([...NODE_KINDS].sort())
  })

  it("pins the run status tones", () => {
    expect(RUN_STATUSES.map((status) => RUN_STATUS_TONE[status])).toEqual([
      "neutral",
      "primary",
      "warning",
      "success",
      "destructive",
      "neutral",
    ])
  })

  it("pins the execution status tones", () => {
    expect(EXECUTION_STATUSES.map((status) => EXECUTION_STATUS_TONE[status])).toEqual([
      "neutral",
      "primary",
      "success",
      "destructive",
      "neutral",
      "warning",
      "neutral",
    ])
  })

  it("marks timed-out waits and errors as destructive", () => {
    expect(WAIT_STATE_TONE.timed_out).toBe("destructive")
    expect(WAIT_STATE_TONE.waiting).toBe("warning")
    expect(SEVERITY_TONE.error).toBe("destructive")
  })

  it("derives provenance marks from the provenance table", () => {
    expect(TEXT_MARK.human).toEqual({ style: "dashed", tone: PROVENANCE.human.tone })
    expect(TEXT_MARK.generated).toEqual({ style: "chip", tone: "llm" })
    expect(TEXT_MARK.document).toEqual({ style: "chip", tone: "success" })
  })

  it("uses only declared tones", () => {
    const used = [
      ...tonesOf(RUN_STATUS_TONE),
      ...tonesOf(EXECUTION_STATUS_TONE),
      ...tonesOf(WAIT_STATE_TONE),
      ...tonesOf(SEVERITY_TONE),
      ...Object.values(NODE_KIND).map((spec) => spec.tone),
    ]
    expect(used.every((tone) => TONES.includes(tone))).toBe(true)
  })
})
