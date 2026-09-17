import { describe, expect, it } from "vitest"
import { CALL_SHEET_TABS } from "@/domain"
import { runId } from "@/data/ids"
import { parseEnum, parseFlag, parseId, parsePaths, parsePositiveInt } from "./params"

describe("search parsers", () => {
  it("parses enum members only", () => {
    const parseTab = parseEnum(CALL_SHEET_TABS)
    expect(parseTab("prompt")).toBe("prompt")
    expect(parseTab("answer")).toBeUndefined()
    expect(parseTab(3)).toBeUndefined()
  })

  it("parses ids from strings and JSON-parsed numbers", () => {
    const parseRun = parseId(runId)
    expect(parseRun("8247")).toBe("8247")
    expect(parseRun(8247)).toBe("8247")
    expect(parseRun("")).toBeUndefined()
    expect(parseRun(null)).toBeUndefined()
  })

  it("parses positive integers", () => {
    expect(parsePositiveInt(4)).toBe(4)
    expect(parsePositiveInt("4")).toBe(4)
    expect(parsePositiveInt(0)).toBeUndefined()
    expect(parsePositiveInt(1.5)).toBeUndefined()
    expect(parsePositiveInt("x")).toBeUndefined()
  })

  it("parses flags", () => {
    expect(parseFlag(true)).toBe(true)
    expect(parseFlag("false")).toBe(false)
    expect(parseFlag("yes")).toBeUndefined()
    expect(parseFlag(1)).toBeUndefined()
  })

  it("parses column path lists", () => {
    expect(parsePaths(["personas/persona_b2b", "personas/persona_b2b/iteration_3"])).toEqual([
      "personas/persona_b2b",
      "personas/persona_b2b/iteration_3",
    ])
    expect(parsePaths([])).toEqual([])
    expect(parsePaths(["ok", 3])).toBeUndefined()
    expect(parsePaths("personas")).toBeUndefined()
  })
})
