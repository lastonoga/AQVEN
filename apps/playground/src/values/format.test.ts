import { describe, expect, it } from "vitest"
import { factsOf } from "./detect.js"
import { clip, mediaLabel, plural, shortValue, sizeLabel, summaryOf } from "./format.js"

describe("format: подписи", () => {
  it("склоняет по-русски", () => {
    expect(plural(1, "элемент", "элемента", "элементов")).toBe("элемент")
    expect(plural(3, "элемент", "элемента", "элементов")).toBe("элемента")
    expect(plural(11, "элемент", "элемента", "элементов")).toBe("элементов")
  })

  it("обрезает и схлопывает пробелы", () => {
    expect(clip("  два   слова ")).toBe("два слова")
    expect(clip("абвгд", 4).endsWith("…")).toBe(true)
  })

  it("размер словами", () => {
    expect(sizeLabel(0)).toBe("размер неизвестен")
    expect(sizeLabel(2048)).toBe("2 КБ")
  })

  it("подпись медиа без размера честно об этом говорит", () => {
    const facts = factsOf({ $media: "video/mp4", url: null, name: "clip.mp4" })
    expect(mediaLabel(facts.media!)).toBe("clip.mp4 · MP4 · размер неизвестен")
  })
})

describe("format: короткое значение поля", () => {
  it("сжимает составные значения до счётчика", () => {
    expect(shortValue({ a: 1, b: 2 })).toBe("2 поля")
    expect(shortValue([1, 2, 3])).toBe("3 элемента")
    expect(shortValue(null)).toBe("—")
  })

  it("текст в кавычках, дата по-русски, булево словом", () => {
    expect(shortValue("Заказ не приехал. Клиент ждёт.")).toBe("«Заказ не приехал.»")
    expect(shortValue("2025-03-17T09:12:00Z")).toBe("17 марта 2025, 09:12")
    expect(shortValue(true)).toBe("да")
  })
})

describe("format: сводка без сведений о типе", () => {
  it("вместо перечня ключей показывает поля со значениями", () => {
    expect(summaryOf(factsOf({ task: "сводка", n: 4 }))).toBe("task: «сводка» · n: 4")
  })

  it("массив без типа считает элементы", () => {
    expect(summaryOf(factsOf([1, 2, 3]))).toBe("3 элемента")
  })

  it("пустое значение — диагностический вид", () => {
    expect(summaryOf(factsOf(null))).toBe("— пусто")
    expect(summaryOf(factsOf([]))).toBe("— пусто")
  })

  it("скаляры и медиа", () => {
    expect(summaryOf(factsOf(7))).toBe("7")
    expect(summaryOf(factsOf(false))).toBe("нет")
    const media = factsOf({ $media: "image/png", url: "/api/blobs/x", name: "cover.png", bytes: 4096 })
    expect(summaryOf(media)).toBe("cover.png · PNG · 4 КБ")
  })

  it("ссылка показывает адрес без протокола", () => {
    expect(summaryOf(factsOf("https://example.com/page"))).toBe("example.com/page")
  })
})
