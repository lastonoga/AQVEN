import { describe, expect, it } from "vitest"
import { OUTCOME_TONE, PROVENANCE, ROW_SHEET_TAB, TEXT_MARK, VERDICT_OUTCOME, scoreTone } from "./presets"
import { TONES } from "./tone"

describe("presets", () => {
  it("picks the score tone", () => {
    expect(scoreTone(0.844, true)).toBe("loop")
    expect(scoreTone(0.62, false)).toBe("warning")
    expect(scoreTone(0.7, false)).toBe("success")
  })

  it("maps verdicts through outcomes to tones", () => {
    expect(OUTCOME_TONE[VERDICT_OUTCOME.needs_human]).toBe("warning")
    expect(OUTCOME_TONE[VERDICT_OUTCOME.invented]).toBe("destructive")
  })

  it("derives provenance marks from the provenance table", () => {
    expect(TEXT_MARK.human).toEqual({ style: "dashed", tone: PROVENANCE.human.tone })
    expect(TEXT_MARK.generated).toEqual({ style: "chip", tone: "llm" })
    expect(TEXT_MARK.document).toEqual({ style: "chip", tone: "success" })
  })

  it("maps matrix rows to call sheet tabs", () => {
    expect(ROW_SHEET_TAB.columns).toBeNull()
    expect(ROW_SHEET_TAB.postCheck).toBe("assertions")
  })

  it("uses only declared tones", () => {
    const used = Object.values(OUTCOME_TONE)
    expect(used.every((tone) => TONES.includes(tone))).toBe(true)
  })
})
