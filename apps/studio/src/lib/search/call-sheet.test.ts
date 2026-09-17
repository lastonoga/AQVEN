import { describe, expect, it } from "vitest"
import { CALL_SHEET_DEFAULTS, callSheetSearch } from "./call-sheet"

describe("callSheetSearch", () => {
  it("defaults the tab to model and omits an absent call", () => {
    expect(callSheetSearch({})).toEqual({ callTab: "model" })
  })

  it("parses an empty search to exactly the stripped defaults", () => {
    expect(callSheetSearch({})).toStrictEqual(CALL_SHEET_DEFAULTS)
  })

  it("reads a call and a valid tab", () => {
    expect(callSheetSearch({ call: "call_01HT9", callTab: "prompt" })).toEqual({ call: "call_01HT9", callTab: "prompt" })
  })

  it("falls back to model for an unknown tab", () => {
    expect(callSheetSearch({ call: "call_01HT9", callTab: "answer" })).toEqual({ call: "call_01HT9", callTab: "model" })
  })
})
