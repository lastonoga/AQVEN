import { describe, expect, it } from "vitest"
import { RUN_STATUSES } from "@/domain"
import { runId } from "@/data/ids"
import { parseEnum, parseFlag, parseId, parseIndex, parseText } from "./search"

describe("search parsers", () => {
  it("parses enum members only", () => {
    const parseStatus = parseEnum(RUN_STATUSES)
    expect(parseStatus("suspended")).toBe("suspended")
    expect(parseStatus("degraded")).toBeUndefined()
    expect(parseStatus(3)).toBeUndefined()
  })

  it("parses ids from strings and JSON-parsed numbers", () => {
    const parseRun = parseId(runId)
    expect(parseRun("01a0b104-4658-70aa-b49b-7c2586b56d92")).toBe("01a0b104-4658-70aa-b49b-7c2586b56d92")
    expect(parseRun(8247)).toBe("8247")
    expect(parseRun("")).toBeUndefined()
    expect(parseRun(null)).toBeUndefined()
  })

  it("keeps non-empty text and drops the rest", () => {
    expect(parseText("defect")).toBe("defect")
    expect(parseText("")).toBeUndefined()
    expect(parseText(undefined)).toBeUndefined()
  })

  it("accepts zero as an execution index but rejects fractions and negatives", () => {
    expect(parseIndex("0")).toBe(0)
    expect(parseIndex(2)).toBe(2)
    expect(parseIndex(-1)).toBeUndefined()
    expect(parseIndex("1.5")).toBeUndefined()
    expect(parseIndex("x")).toBeUndefined()
  })

  it("parses only the two boolean spellings", () => {
    expect(parseFlag("true")).toBe(true)
    expect(parseFlag(false)).toBe(false)
    expect(parseFlag("yes")).toBeUndefined()
  })
})
