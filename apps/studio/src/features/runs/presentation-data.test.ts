import { describe, expect, it } from "vitest"
import { parseDisplayDocument, remainingEntries, renderableDocument, resolvePointer } from "./presentation-data"

const document = {
  version: 1,
  root: { kind: "section", children: [{ kind: "text", path: "/reply/text" }] },
}

describe("presentation document", () => {
  it("accepts the approved tree and resolves escaped JSON Pointers", () => {
    expect(parseDisplayDocument(document)).not.toBeNull()
    expect(parseDisplayDocument({ version: 1, root: { kind: "section", title: null, children: [
      { kind: "field", label: "Status", value: "ok", represented_paths: [], tone: "neutral" },
      { kind: "media", path: "/photo", alt: null },
    ] } })).not.toBeNull()
    expect(resolvePointer({ "a/b": { "~key": "complete" } }, "/a~1b/~0key")).toEqual({ found: true, value: "complete" })
  })

  it("rejects unknown versions, nodes, fields, and missing pointers", () => {
    expect(parseDisplayDocument({ ...document, version: 2 })).toBeNull()
    expect(parseDisplayDocument({ version: 1, root: { kind: "section", children: [{ kind: "html", value: "<b>x</b>" }] } })).toBeNull()
    expect(parseDisplayDocument({ version: 1, root: { kind: "section", children: [{ kind: "text", value: "x", className: "hidden" }] } })).toBeNull()
    expect(resolvePointer({ reply: {} }, "/reply/text")).toEqual({ found: false })
  })

  it("keeps all unrepresented leaves, including children of a container pointer", () => {
    const value = { reply: { text: "Full reply", citations: [{ id: "A", score: 3 }] } }
    const parsed = parseDisplayDocument(document)
    if (parsed === null) throw new Error("document was rejected")
    expect(remainingEntries(value, parsed)).toEqual([
      { path: "reply.citations[0].id", value: "A" },
      { path: "reply.citations[0].score", value: "3" },
    ])
    const container = parseDisplayDocument({ version: 1, root: { kind: "section", children: [{ kind: "text", path: "/reply" }] } })
    if (container === null) throw new Error("container document was rejected")
    expect(remainingEntries(value, container)).toHaveLength(3)
  })

  it("marks media descendants only when the media element renders that value", () => {
    const value = { photo: { $media: "image/png", blob_id: "blob-1", size_bytes: 3 }, note: "kept" }
    const media = parseDisplayDocument({ version: 1, root: { kind: "section", children: [{ kind: "media", path: "/photo" }] } })
    if (media === null) throw new Error("media document was rejected")
    expect(remainingEntries(value, media)).toEqual([{ path: "note", value: "kept" }])
  })

  it("does not treat one nested media item as the whole value", () => {
    const value = { photo: { $media: "image/png", blob_id: "blob-1", size_bytes: 3 }, note: "keep this" }
    const document = { version: 1, root: { kind: "section", children: [{ kind: "media", path: "" }] } }
    const media = [{ slot: "photo", mediaType: "image/png", blobId: "blob-1", bytes: 3, name: null }]
    expect(renderableDocument(document, value, media)).toBeNull()
    expect(renderableDocument(document, "blob preview", media, true)).not.toBeNull()
  })

  it("accepts a card with nested nodes and keeps only unrepresented leaves", () => {
    const value = { case: { title: "Broken strip", rationale: "Full diagnosis", priority: "high", owner: "Mira" } }
    const card = { version: 1, root: { kind: "section", children: [
      { kind: "card", title: "Support case", description: "Review before replying", tone: "warning", children: [
        { kind: "field", label: "Issue", path: "/case/title" },
        { kind: "text", path: "/case/rationale" },
        { kind: "badge", path: "/case/priority" },
      ] },
    ] } }
    const parsed = parseDisplayDocument(card)
    expect(parsed).not.toBeNull()
    if (parsed === null) throw new Error("card was rejected")
    expect(renderableDocument(card, value, [])).not.toBeNull()
    expect(remainingEntries(value, parsed)).toEqual([{ path: "case.owner", value: "Mira" }])
    expect(renderableDocument(card, { case: { title: "Broken strip" } }, [])).toBeNull()
  })

  it("rejects cards without a title or with unsupported properties", () => {
    const root = (card: unknown) => ({ version: 1, root: { kind: "section", children: [card] } })
    expect(parseDisplayDocument(root({ kind: "card", title: "", children: [] }))).toBeNull()
    expect(parseDisplayDocument(root({ kind: "card", children: [] }))).toBeNull()
    expect(parseDisplayDocument(root({ kind: "card", title: "Case", tone: "purple", children: [] }))).toBeNull()
    expect(parseDisplayDocument(root({ kind: "card", title: "Case", html: "<p>x</p>", children: [] }))).toBeNull()
    expect(parseDisplayDocument(root({ kind: "card", title: "Case", description: null, children: [] }))).not.toBeNull()
  })
})
