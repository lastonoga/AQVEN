import { describe, expect, it } from "vitest"
import { factsOf } from "./detect.js"
import { clip, mediaLabel, plural, sizeLabel, summaryOf } from "./format.js"

describe("format: подписи", () => {
  it("склоняет по-русски", () => {
    expect(plural(1, "элемент", "элемента", "элементов")).toBe("элемент")
    expect(plural(3, "элемент", "элемента", "элементов")).toBe("элемента")
    expect(plural(11, "элемент", "элемента", "элементов")).toBe("элементов")
    expect(plural(21, "элемент", "элемента", "элементов")).toBe("элемент")
  })

  it("обрезает и схлопывает пробелы", () => {
    expect(clip("  два   слова ")).toBe("два слова")
    expect(clip("абвгд", 4).endsWith("…")).toBe(true)
  })

  it("размер словами", () => {
    expect(sizeLabel(0)).toBe("размер неизвестен")
    expect(sizeLabel(2048)).toBe("2 КБ")
  })
})

describe("format: сводка значения", () => {
  it("пусто, скаляры, массив, объект", () => {
    expect(summaryOf(factsOf(null))).toBe("—")
    expect(summaryOf(factsOf(7))).toBe("7")
    expect(summaryOf(factsOf(false))).toBe("false")
    expect(summaryOf(factsOf([1, 2, 3]))).toBe("массив · 3 элемента")
    expect(summaryOf(factsOf({ a: 1, b: 2 }))).toBe("{ a, b }")
  })

  it("медиа показывает имя, формат и размер", () => {
    const facts = factsOf({ $media: "image/png", url: "/api/blobs/x", name: "cover.png", bytes: 4096 })
    expect(summaryOf(facts)).toBe("cover.png · PNG · 4 КБ")
  })

  it("ссылка показывает адрес", () => {
    expect(summaryOf(factsOf("https://example.com/page"))).toBe("https://example.com/page")
  })

  it("подпись медиа без размера честно об этом говорит", () => {
    const facts = factsOf({ $media: "video/mp4", url: null, name: "clip.mp4" })
    expect(mediaLabel(facts.media!)).toBe("clip.mp4 · MP4 · размер неизвестен")
  })
})
