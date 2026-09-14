import { describe, expect, it } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import { ValueCell } from "./ValueCell.js"
import { MediaValue } from "./MediaValue.js"
import { ValueView } from "./ValueView.js"
import { factsOf, hintFor } from "../values/index.js"
import type { MediaRef } from "../values/index.js"

const image = { $media: "image/svg+xml", url: "/api/blobs/aa", name: "stub.svg", bytes: 1024 }
const video = { $media: "video/mp4", url: null, poster: "/api/blobs/bb", name: "clip.mp4", note: "видео не сгенерировано" }
const audio = { $media: "audio/wav", url: "/api/blobs/cc", name: "tone.wav", bytes: 9644 }

const mediaOf = (value: unknown): MediaRef => {
  const found = factsOf(value).media
  if (found === null) throw new Error("ожидалось медиа")
  return found
}

describe("ValueCell", () => {
  it("миниатюра и подпись для изображения", () => {
    const html = renderToStaticMarkup(<ValueCell value={image} />)
    expect(html).toContain('src="/api/blobs/aa"')
    expect(html).toContain("stub.svg")
    expect(html).toContain("1 КБ")
  })

  it("одна строка с обрезкой для текста", () => {
    const html = renderToStaticMarkup(<ValueCell value={"строка ".repeat(40)} />)
    expect(html).toContain("truncate")
    expect(html).toContain("…")
  })

  it("у большого значения показан полный размер", () => {
    const big = { text: "я".repeat(4000) }
    const html = renderToStaticMarkup(<ValueCell value={big} />)
    expect(html).toContain("КБ")
  })

  it("пусто вместо пустоты", () => {
    expect(renderToStaticMarkup(<ValueCell value={null} />)).toContain("—")
  })
})

describe("MediaValue", () => {
  it("изображение рисуется картинкой", () => {
    const html = renderToStaticMarkup(<MediaValue media={mediaOf(image)} kind="image" />)
    expect(html).toContain("<img")
    expect(html).toContain('src="/api/blobs/aa"')
  })

  it("видео без дорожки показывает кадр и причину, а не пустоту", () => {
    const html = renderToStaticMarkup(<MediaValue media={mediaOf(video)} kind="video" />)
    expect(html).toContain('src="/api/blobs/bb"')
    expect(html).toContain("видео не сгенерировано")
  })

  it("аудио рисуется проигрывателем", () => {
    const html = renderToStaticMarkup(<MediaValue media={mediaOf(audio)} kind="audio" />)
    expect(html).toContain("<audio")
    expect(html).toContain("tone.wav")
  })

  it("файл отдаётся ссылкой на скачивание с размером", () => {
    const file = { $media: "application/pdf", url: "/api/blobs/dd", name: "act.pdf", bytes: 2048 }
    const html = renderToStaticMarkup(<MediaValue media={mediaOf(file)} kind="file" />)
    expect(html).toContain('download="act.pdf"')
    expect(html).toContain("2 КБ")
  })

  it("нет источника — честная заглушка", () => {
    const empty = { $media: "image/png", name: "нет.png" }
    const html = renderToStaticMarkup(<MediaValue media={mediaOf(empty)} kind="image" />)
    expect(html).toContain("источник не задан")
    expect(html).not.toContain("<img")
  })
})

describe("ValueView с медиа", () => {
  it("разворачивает изображение", () => {
    expect(renderToStaticMarkup(<ValueView value={image} />)).toContain('src="/api/blobs/aa"')
  })

  it("не ломает объекты", () => {
    const html = renderToStaticMarkup(<ValueView value={{ a: 1, b: "текст" }} />)
    expect(html).toContain("объект · 2 поля")
  })

  it("одного contentMediaType без contentEncoding мало: строка остаётся строкой", () => {
    const raw = "AAAA".repeat(20)
    const html = renderToStaticMarkup(<ValueView value={raw} hint={hintFor("image/png")} />)
    expect(html).not.toContain("<img")
  })
})
