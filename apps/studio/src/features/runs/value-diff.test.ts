import { describe, expect, it } from "vitest"
import { changedFields, diffValues, leavesOf } from "./value-diff"

describe("diffValues", () => {
  it("flattens nested objects and arrays into leaf paths", () => {
    const leaves = leavesOf({ reply: { text: "hi", citations: [{ id: "a" }, { id: "b" }] }, empty: {}, none: [] })
    expect([...leaves.keys()]).toEqual(["reply.text", "reply.citations[0].id", "reply.citations[1].id", "empty", "none"])
    expect(leaves.get("empty")?.text).toBe("{}")
    expect(leaves.get("reply.text")?.text).toBe("hi")
  })

  it("marks same, changed and one-sided fields in the order of the left value", () => {
    const diffs = diffValues({ a: 1, b: "x", c: true }, { a: 1, b: "y", d: null })
    expect(diffs).toEqual([
      { path: "a", left: "1", right: "1", state: "same" },
      { path: "b", left: "x", right: "y", state: "changed" },
      { path: "c", left: "true", right: null, state: "onlyLeft" },
      { path: "d", left: null, right: "null", state: "onlyRight" },
    ])
  })

  it("tells a string from a number with the same text", () => {
    expect(diffValues({ a: "1" }, { a: 1 })[0]?.state).toBe("changed")
  })

  it("compares a plain value at the root path", () => {
    expect(diffValues("draft", "final")).toEqual([{ path: "", left: "draft", right: "final", state: "changed" }])
  })

  it("treats a missing side as having no fields", () => {
    expect(diffValues(undefined, { a: 1 })).toEqual([{ path: "a", left: null, right: "1", state: "onlyRight" }])
    expect(diffValues(undefined, undefined)).toEqual([])
  })

  it("keeps only the changed fields", () => {
    expect(changedFields(diffValues({ a: 1, b: 2 }, { a: 1, b: 3 })).map((diff) => diff.path)).toEqual(["b"])
  })
})
