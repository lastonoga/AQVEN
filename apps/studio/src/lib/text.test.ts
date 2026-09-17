import { describe, expect, it } from "vitest"
import { codeLines, comparisonLines, diffLines, plainLines, splitInlineCode, templateLines } from "./text"

describe("templateLines", () => {
  it("marks slot references longest first with the slot provenance", () => {
    const lines = templateLines("Audience $persona.\nCandidates:\n$ranked.items[0..2] and $ranked", [
      { provenance: "static", label: "persona" },
      { provenance: "generated", label: "ranked.items[0..2]" },
      { provenance: "data", label: "ranked" },
    ])
    expect(lines).toEqual([
      ["Audience ", { text: "$persona", mark: "static" }, "."],
      ["Candidates:"],
      [{ text: "$ranked.items[0..2]", mark: "generated" }, " and ", { text: "$ranked", mark: "data" }],
    ])
  })

  it("keeps plain lines when there are no slots", () => {
    expect(templateLines("a\n\nb", [])).toEqual([["a"], [], ["b"]])
  })
})

describe("codeLines", () => {
  it("splits trailing comments into comment runs", () => {
    expect(codeLines("max_tokens: 8192  # raised in r42\n// whole line\nurl: http://x#y")).toEqual([
      ["max_tokens: 8192  ", { text: "# raised in r42", mark: "comment" }],
      [{ text: "// whole line", mark: "comment" }],
      ["url: http://x#y"],
    ])
  })
})

describe("plainLines", () => {
  it("splits text into single-run lines and drops empty text", () => {
    expect(plainLines("a\n\nb")).toEqual([["a"], [""], ["b"]])
    expect(plainLines("")).toEqual([])
  })
})

describe("diffLines", () => {
  it("prefixes and marks every diff line", () => {
    expect(
      diffLines([
        { op: "add", text: "max_tokens: 8192" },
        { op: "remove", text: "max_tokens: 4096" },
      ]),
    ).toEqual([[{ text: "+ max_tokens: 8192", mark: "add" }], [{ text: "− max_tokens: 4096", mark: "remove" }]])
  })
})

describe("comparisonLines", () => {
  it("pads the labels to the design spacing", () => {
    expect(comparisonLines("300 m", "1.2 km", { actual: "actual:", expected: "expected:" })).toEqual([
      ["actual:  300 m"],
      ["expected: 1.2 km"],
    ])
  })
})

describe("splitInlineCode", () => {
  it("turns backtick spans into code runs", () => {
    expect(splitInlineCode("Schema failed on `hooks: string[3]` — the model returned `five`")).toEqual([
      "Schema failed on ",
      { text: "hooks: string[3]", mark: "code" },
      " — the model returned ",
      { text: "five", mark: "code" },
    ])
  })

  it("returns plain text untouched", () => {
    expect(splitInlineCode("no code")).toEqual(["no code"])
  })
})
