import { describe, expect, it } from "vitest"
import { formatBytes, previewLabel, previewOf } from "./preview.js"

describe("previewOf", () => {
  it("маленькое значение не режется", () => {
    const preview = previewOf({ id: "h1" })
    expect(preview.truncated).toBe(false)
    expect(preview.bytes).toBe(preview.totalBytes)
    expect(JSON.parse(preview.text)).toEqual({ id: "h1" })
  })

  it("большое значение режется и сообщает полный размер", () => {
    const big = Array.from({ length: 5000 }, (_, i) => ({ id: i, text: "длинная строка" }))
    const preview = previewOf(big)
    expect(preview.truncated).toBe(true)
    expect(preview.bytes).toBeLessThanOrEqual(2048)
    expect(preview.totalBytes).toBeGreaterThan(100000)
  })

  it("лимит настраивается", () => {
    const preview = previewOf("я".repeat(1000), 64)
    expect(preview.bytes).toBeLessThanOrEqual(64)
    expect(preview.truncated).toBe(true)
  })

  it("обрезка не оставляет битый символ", () => {
    const preview = previewOf("я".repeat(1000), 31)
    expect(preview.text.includes("�")).toBe(false)
  })

  it("undefined и null не ломают превью", () => {
    expect(previewOf(undefined).text).toBe("undefined")
    expect(previewOf(null).text).toBe("null")
  })

  it("пустой массив", () => {
    expect(previewOf([]).text).toBe("[]")
  })
})

describe("formatBytes и previewLabel", () => {
  it("байты, килобайты, мегабайты", () => {
    expect(formatBytes(512)).toBe("512 Б")
    expect(formatBytes(2048)).toBe("2 КБ")
    expect(formatBytes(3 * 1024 * 1024)).toBe("3 МБ")
  })

  it("подпись усечения показывает обе величины", () => {
    const label = previewLabel({ text: "", bytes: 2048, totalBytes: 348160, truncated: true })
    expect(label).toBe("показано 2 КБ из 340 КБ")
  })

  it("без усечения показывает только полный размер", () => {
    expect(previewLabel({ text: "", bytes: 10, totalBytes: 10, truncated: false })).toBe("10 Б")
  })
})
