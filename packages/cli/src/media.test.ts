import { describe, expect, it } from "vitest"
import { makeMedia, mimeOfName, mimeOfType } from "./media.js"
import type { MediaBlob } from "./media.js"

const rnd = (): number => 0.42

const sink = (): { blobs: MediaBlob[]; store: (blob: MediaBlob) => void } => {
  const blobs: MediaBlob[] = []
  return { blobs, store: (blob) => void blobs.push(blob) }
}

describe("mimeOfName: имя поля или типа", () => {
  it("узнаёт медийные имена", () => {
    expect(mimeOfName("coverImage")).toBe("image/png")
    expect(mimeOfName("cover_image")).toBe("image/png")
    expect(mimeOfName("photos")).toBe("image/png")
    expect(mimeOfName("videoClip")).toBe("video/mp4")
    expect(mimeOfName("Voiceover")).toBe("audio/wav")
  })

  it("не ловит слова, где медийный корень случайно внутри", () => {
    expect(mimeOfName("invoice")).toBe("")
    expect(mimeOfName("ConsensusInvoice")).toBe("")
    expect(mimeOfName("InvoiceRecord")).toBe("")
    expect(mimeOfName("title")).toBe("")
  })
})

describe("mimeOfType: реестр типов важнее имени", () => {
  const types = {
    Cover: { kind: "scalar", schema: { type: "string", contentMediaType: "image/png" } },
    Note: { kind: "scalar", schema: { type: "string" } },
  }

  it("берёт contentMediaType из схемы", () => {
    expect(mimeOfType(types, "Cover")).toBe("image/png")
  })

  it("без объявления падает на имя типа", () => {
    expect(mimeOfType(types, "Note")).toBe("")
    expect(mimeOfType(types, "AvatarRef")).toBe("image/png")
  })
})

describe("makeMedia: фиктивный провайдер", () => {
  it("для изображения кладёт настоящий SVG и возвращает ссылку", () => {
    const { blobs, store } = sink()
    const envelope = makeMedia({ store }, "abc", "image/png", "Cover", rnd)
    expect(envelope.$media).toBe("image/svg+xml")
    expect(envelope.url).toBe("/api/blobs/abc")
    expect(envelope.bytes).toBe(blobs[0]?.body.length)
    expect(new TextDecoder().decode(blobs[0]?.body).startsWith("<svg")).toBe(true)
    expect(envelope.note).toContain("вместо image/png")
  })

  it("для аудио кладёт проигрываемый WAV", () => {
    const { blobs, store } = sink()
    const envelope = makeMedia({ store }, "def", "audio/mpeg", "Voiceover", rnd)
    expect(envelope.$media).toBe("audio/wav")
    expect(new TextDecoder().decode(blobs[0]?.body.slice(0, 4))).toBe("RIFF")
    expect(new TextDecoder().decode(blobs[0]?.body.slice(8, 12))).toBe("WAVE")
  })

  it("для видео честно говорит, что дорожки нет, но даёт кадр", () => {
    const { blobs, store } = sink()
    const envelope = makeMedia({ store }, "ghi", "video/mp4", "Reel", rnd)
    expect(envelope.url).toBeNull()
    expect(envelope.poster).toBe("/api/blobs/ghip")
    expect(envelope.note).toContain("видео")
    expect(blobs).toHaveLength(1)
  })

  it("без хранилища отдаёт конверт без ссылки и объясняет почему", () => {
    const envelope = makeMedia({ store: null }, "jkl", "image/png", "Cover", rnd)
    expect(envelope.url).toBeNull()
    expect(envelope.note).toContain("блоб не создан")
  })
})
