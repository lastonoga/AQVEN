import { describe, expect, it } from "vitest"
import { isBinaryMedia, valueCell } from "./values"

describe("valueCell", () => {
  it("keeps a binary blob as a playable media reference instead of treating its preview as text", () => {
    const ref = {
      kind: "blob" as const, blob_id: "sha256-audio", sha256: "sha256-audio", size_bytes: 32044,
      media_type: "audio/wav", preview: "", truncated: false,
    }
    const cell = valueCell(ref, "binary response body")
    expect(isBinaryMedia(ref)).toBe(true)
    expect(cell?.media).toEqual([{ slot: "sha256-audio", mediaType: "audio/wav", blobId: "sha256-audio", bytes: 32044, name: null }])
  })

  it("finds media inside a complete JSON blob", () => {
    const value = { note: "Ready", clip: { $media: "video/mp4", blob_id: "sha256-clip", size_bytes: 120, name: "clip.mp4", poster_blob_id: "sha256-poster" } }
    const cell = valueCell({
      kind: "blob", blob_id: "sha256-json", sha256: "sha256-json", size_bytes: 300,
      media_type: "application/json", preview: "{", truncated: true,
    }, JSON.stringify(value))
    expect(cell?.media).toEqual([{ slot: "clip", mediaType: "video/mp4", blobId: "sha256-clip", bytes: 120, name: "clip.mp4", posterBlobId: "sha256-poster" }])
  })

  it("uses the complete loaded blob instead of its truncated preview", () => {
    const message = "x".repeat(10_000)
    const fullText = JSON.stringify({ message })
    const cell = valueCell({
      kind: "blob",
      blob_id: "blob_1",
      sha256: "sha256-1",
      media_type: "application/json",
      size_bytes: fullText.length,
      preview: '{"message":"x',
      truncated: true,
    }, fullText)
    expect(cell?.value).toEqual({ message })
    expect(cell?.text).toBe(fullText)
    expect(cell?.incomplete).toBe(false)
  })

  it("loads mixed-case JSON MIME types as complete structured values", () => {
    const ref = {
      kind: "blob" as const,
      blob_id: "blob_mixed_json",
      sha256: "sha256-mixed-json",
      media_type: "Application/Vnd.Example+JSON; charset=UTF-8",
      size_bytes: 100,
      preview: '{"reply":',
      truncated: true,
    }
    expect(isBinaryMedia(ref)).toBe(false)
    const cell = valueCell(ref, '{"reply":"complete"}')
    expect(cell?.value).toEqual({ reply: "complete" })
    expect(cell?.incomplete).toBe(false)
  })

  it("loads mixed-case text MIME types as complete text", () => {
    const ref = {
      kind: "blob" as const,
      blob_id: "blob_mixed_text",
      sha256: "sha256-mixed-text",
      media_type: "Text/Plain; charset=UTF-8",
      size_bytes: 100,
      preview: "partial",
      truncated: true,
    }
    expect(isBinaryMedia(ref)).toBe(false)
    const cell = valueCell(ref, "complete text")
    expect(cell?.value).toBe("complete text")
    expect(cell?.incomplete).toBe(false)
  })

  it("keeps JSON-looking text/plain bytes as an exact string", () => {
    const objectText = '{"reply":"quoted"}'
    const quotedText = '"literal quotation"'
    const ref = {
      kind: "blob" as const,
      blob_id: "blob_text",
      sha256: "sha256-text",
      media_type: "text/plain",
      size_bytes: objectText.length,
      preview: quotedText,
      truncated: true,
    }
    expect(valueCell(ref)?.value).toBe(quotedText)
    const complete = valueCell(ref, objectText)
    expect(complete?.value).toBe(objectText)
    expect(complete?.text).toBe(objectText)
    expect(complete?.incomplete).toBe(false)
  })

  it("treats text/json as text, matching the Python blob reader", () => {
    const ref = {
      kind: "blob" as const,
      blob_id: "blob_text_json",
      sha256: "sha256-text-json",
      media_type: "Text/JSON; charset=UTF-8",
      size_bytes: 18,
      preview: "partial",
      truncated: true,
    }
    expect(valueCell(ref, '{"reply":"complete"}')?.value).toBe('{"reply":"complete"}')
  })

  it("identifies a truncated preview when the full blob cannot be loaded", () => {
    const cell = valueCell({
      kind: "blob",
      blob_id: "blob_2",
      sha256: "sha256-2",
      media_type: "application/json",
      size_bytes: 10_000,
      preview: '{"message":"partial',
      truncated: true,
    })
    expect(cell?.incomplete).toBe(true)
    expect(cell?.text).toBe('{"message":"partial')
  })
})
