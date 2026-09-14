import { describe, expect, test } from "vitest"
import { VALUE_CHARS, valueLines } from "./value-lines.js"

const block = (value: unknown, lines = 4) => valueLines(value, lines, "", null)

describe("превью печатает пары ключ-значение, а не имена ключей", () => {
  test("объект отдаёт значения полей", () => {
    const found = block({ id: "tkt-48219", text: "Заказ обещали 16 марта", score: 0.87 })
    expect(found.lines.map((line) => line.key)).toEqual(["id", "text", "score"])
    expect(found.lines[1]?.text).toBe("Заказ обещали 16 марта")
  })

  test("число получает свой тон", () => {
    expect(block({ score: 0.87 }).lines[0]?.tone).toBe("number")
  })

  test("незаполненное поле названо пустым, а не пропущено", () => {
    const found = block({ verdict: null, why: "" })
    expect(found.lines[0]).toEqual({ key: "verdict", text: "пусто", tone: "muted" })
  })
})

describe("усечение всегда называет свой размер", () => {
  test("лишние поля посчитаны", () => {
    const wide = Object.fromEntries(Array.from({ length: 9 }, (_, index) => [`f${index}`, index]))
    expect(block(wide, 4).more).toContain("+5")
  })

  test("остаток массива назван числом и всего", () => {
    const list = Array.from({ length: 12 }, (_, index) => ({ id: `kb-${index}` }))
    expect(block(list, 3).more).toBe("ещё 9 из 12")
  })

  test("остаток строки посчитан в строках", () => {
    const text = Array.from({ length: 10 }, (_, index) => `строка ${index}`).join("\n")
    expect(block(text, 4).more).toContain("+6")
  })

  test("крупное значение дополнительно называет вес", () => {
    expect(block({ text: "я".repeat(4000) }).more).toContain("КБ")
  })
})

describe("обрезка", () => {
  test("длинное значение режется по хвосту", () => {
    const found = block({ text: "с".repeat(400) })
    expect(found.lines[0]?.text.length).toBeLessThanOrEqual(VALUE_CHARS)
    expect(found.lines[0]?.text.endsWith("…")).toBe(true)
  })

  test("идентификатор режется по середине, чтобы остался хвост", () => {
    const id = `${"a".repeat(90)}-ХВОСТ`
    const found = block({ id })
    expect(found.lines[0]?.text).toContain("…")
    expect(found.lines[0]?.text.endsWith("ХВОСТ")).toBe(true)
  })

  test("перевод строки внутри значения не ломает строку таблицы", () => {
    expect(block({ text: "первая\nвторая" }).lines[0]?.text).toBe("первая вторая")
  })
})

describe("пустые значения", () => {
  test("null назван пустым", () => {
    expect(block(null).empty).toBe(true)
  })

  test("пустой массив назван пустым", () => {
    expect(block([]).empty).toBe(true)
  })
})
