import { describe, expect, it } from "vitest"
import { factsOf } from "./detect.js"
import { hintFor, hintOf } from "./hint.js"

const PNG_PIXEL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="

describe("factsOf: простые виды", () => {
  it("пустые значения", () => {
    expect(factsOf(undefined).kind).toBe("empty")
    expect(factsOf(null).kind).toBe("empty")
    expect(factsOf("").kind).toBe("empty")
  })

  it("скаляры", () => {
    expect(factsOf("привет").kind).toBe("text")
    expect(factsOf(42).kind).toBe("number")
    expect(factsOf(true).kind).toBe("boolean")
  })

  it("составные", () => {
    expect(factsOf([1, 2]).kind).toBe("array")
    expect(factsOf({ a: 1 }).kind).toBe("object")
  })

  it("считает размер значения", () => {
    expect(factsOf("абв").bytes).toBe(6)
    expect(factsOf({ a: 1 }).bytes).toBeGreaterThan(0)
  })
})

describe("factsOf: медиа по самому значению", () => {
  it("data-URI изображения", () => {
    const facts = factsOf(PNG_PIXEL)
    expect(facts.kind).toBe("image")
    expect(facts.media?.mime).toBe("image/png")
    expect(facts.media?.inline).toBe(true)
    expect(facts.media?.bytes).toBeGreaterThan(60)
  })

  it("http-ссылка с расширением", () => {
    expect(factsOf("https://cdn.example.com/a/b.png").kind).toBe("image")
    expect(factsOf("https://cdn.example.com/a/b.mp4").kind).toBe("video")
    expect(factsOf("https://cdn.example.com/a/b.wav").kind).toBe("audio")
    expect(factsOf("https://cdn.example.com/a/b.pdf").kind).toBe("file")
  })

  it("http-ссылка без расширения — просто ссылка", () => {
    const facts = factsOf("https://example.com/page")
    expect(facts.kind).toBe("link")
    expect(facts.media?.src).toBe("https://example.com/page")
  })

  it("корневой путь считается ссылкой только для /api/ и файлов", () => {
    expect(factsOf("/api/blobs/abc").kind).toBe("link")
    expect(factsOf("/static/cover.png").kind).toBe("image")
    expect(factsOf("/просто текст со слешем").kind).toBe("text")
  })

  it("имя файла достаётся из ссылки", () => {
    expect(factsOf("https://cdn.example.com/a/cover.png").media?.name).toBe("cover.png")
  })
})

describe("factsOf: медиа по конверту", () => {
  const envelope = {
    $media: "image/svg+xml",
    url: "/api/blobs/deadbeef",
    name: "stub.svg",
    bytes: 512,
  }

  it("читает mime, ссылку, имя и размер", () => {
    const facts = factsOf(envelope)
    expect(facts.kind).toBe("image")
    expect(facts.media?.src).toBe("/api/blobs/deadbeef")
    expect(facts.media?.name).toBe("stub.svg")
    expect(facts.bytes).toBe(512)
  })

  it("конверт без ссылки честно сообщает причину", () => {
    const facts = factsOf({ $media: "video/mp4", url: null, name: "clip.mp4", note: "видео не сгенерировано" })
    expect(facts.kind).toBe("video")
    expect(facts.media?.src).toBe("")
    expect(facts.media?.note).toBe("видео не сгенерировано")
  })

  it("забирает кадр-заставку", () => {
    const facts = factsOf({ $media: "video/mp4", url: null, poster: "/api/blobs/aa" })
    expect(facts.media?.poster).toBe("/api/blobs/aa")
  })

  it("неизвестный mime конверта — файл", () => {
    expect(factsOf({ $media: "application/x-custom", url: "/api/blobs/x" }).kind).toBe("file")
  })
})

describe("factsOf: медиа по реестру типов", () => {
  it("contentMediaType из схемы делает строку изображением", () => {
    const hint = hintOf({ kind: "scalar", schema: { type: "string", contentMediaType: "image/png", contentEncoding: "base64" } })
    const raw = PNG_PIXEL.slice(PNG_PIXEL.indexOf(",") + 1)
    const facts = factsOf(raw, hint)
    expect(facts.kind).toBe("image")
    expect(facts.media?.inline).toBe(true)
    expect(facts.media?.src.startsWith("data:image/png;base64,")).toBe(true)
  })

  it("format: uri без расширения и с подсказкой mime", () => {
    const hint = hintOf({ schema: { type: "string", format: "uri", contentMediaType: "audio/mpeg" } })
    const facts = factsOf("https://cdn.example.com/track", hint)
    expect(facts.kind).toBe("audio")
  })

  it("подсказка не ломает обычный текст", () => {
    expect(factsOf("просто строка", hintFor("image/png")).kind).toBe("text")
  })

  it("mime из значения важнее подсказки", () => {
    expect(factsOf("https://cdn.example.com/a.mp4", hintFor("image/png")).kind).toBe("video")
  })
})
