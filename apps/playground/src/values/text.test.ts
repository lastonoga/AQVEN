import { describe, expect, it } from "vitest"
import { charsNote, clip, dateText, firstSentence, isDateText, linkText, numberText, quoted } from "./text.js"

describe("text: короткие формы", () => {
  it("схлопывает пробелы и обрезает", () => {
    expect(clip("  два   слова ")).toBe("два слова")
    expect(clip("абвгд", 4)).toBe("абв…")
  })

  it("берёт первое предложение", () => {
    expect(firstSentence("Заказ не приехал. Клиент просит возврат.")).toBe("Заказ не приехал.")
    expect(firstSentence("Без точки в конце")).toBe("Без точки в конце")
    expect(firstSentence("Сколько ждать? Уже неделя.")).toBe("Сколько ждать?")
  })

  it("считает остаток текста словами", () => {
    expect(charsNote(0)).toBe("")
    expect(charsNote(2)).toBe("+2 знака")
    expect(charsNote(69)).toBe("+69 знаков")
    expect(charsNote(1800)).toBe("+1,8 тыс. знаков")
  })

  it("числа по-русски", () => {
    expect(numberText(137)).toBe("137")
    expect(numberText(0.89)).toBe("0,89")
    expect(numberText(12050000)).toBe("12 050 000")
  })

  it("даты по-русски и без часового пояса", () => {
    expect(isDateText("2025-03-17T09:12:00Z")).toBe(true)
    expect(isDateText("просто строка")).toBe(false)
    expect(isDateText("2025-13-45")).toBe(false)
    expect(dateText("2025-03-17T09:12:00Z")).toBe("17 марта 2025, 09:12")
    expect(dateText("2025-03-31")).toBe("31 марта 2025")
  })

  it("ссылка без протокола", () => {
    expect(linkText("https://example.com/page")).toBe("example.com/page")
  })

  it("кавычки для текста в ячейке", () => {
    expect(quoted("Заказ обещали в понедельник, а привезли в среду", 20)).toBe("«Заказ обещали в пон…»")
  })
})
