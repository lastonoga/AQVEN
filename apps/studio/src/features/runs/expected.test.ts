import { describe, expect, it } from "vitest"
import { compareExpected, datasetItemOf, expectedCaseOf } from "./expected"

const ITEM = { datasetId: "support_case_cases", caseName: "strip_flicker_credit" }

describe("datasetItemOf", () => {
  it("splits a dataset item id into the dataset and the case", () => {
    expect(datasetItemOf("support_case_cases/strip_flicker_credit")).toEqual(ITEM)
  })

  it("rejects ids without a dataset or a case", () => {
    expect(datasetItemOf(null)).toBeNull()
    expect(datasetItemOf(undefined)).toBeNull()
    expect(datasetItemOf("support_case_cases")).toBeNull()
    expect(datasetItemOf("/strip")).toBeNull()
    expect(datasetItemOf("support_case_cases/")).toBeNull()
  })
})

describe("expectedCaseOf", () => {
  it("is ready only when the case has an expected output", () => {
    expect(expectedCaseOf(ITEM, { name: ITEM.caseName, inputs: {}, expected_output: { status: "resolved" } })).toEqual({
      kind: "ready",
      item: ITEM,
      expected: { status: "resolved" },
    })
    expect(expectedCaseOf(ITEM, { name: ITEM.caseName, inputs: {} })).toEqual({ kind: "none" })
    expect(expectedCaseOf(ITEM, { name: ITEM.caseName, inputs: {}, expected_output: null })).toEqual({ kind: "none" })
  })

  it("keeps the case name when the case could not be read", () => {
    expect(expectedCaseOf(ITEM, null)).toEqual({ kind: "unavailable", item: ITEM })
    expect(expectedCaseOf(null, null)).toEqual({ kind: "none" })
  })
})

describe("compareExpected", () => {
  it("checks every expected field and leaves the extra actual fields unchecked", () => {
    const comparison = compareExpected(
      { status: "resolved", resolution: { action: "reship" }, tier: "strong" },
      { status: "rejected", resolution: { action: "reship", summary: "sent" } },
    )
    expect(comparison.rows).toEqual([
      { path: "status", expected: "resolved", actual: "rejected", state: "mismatch" },
      { path: "resolution.action", expected: "reship", actual: "reship", state: "match" },
      { path: "tier", expected: "strong", actual: null, state: "missing" },
    ])
    expect(comparison.checked).toBe(3)
    expect(comparison.matched).toBe(1)
    expect(comparison.extra).toBe(1)
  })

  it("counts a full match", () => {
    const comparison = compareExpected({ a: [1, 2] }, { a: [1, 2] })
    expect(comparison.matched).toBe(comparison.checked)
    expect(comparison.checked).toBe(2)
  })
})
