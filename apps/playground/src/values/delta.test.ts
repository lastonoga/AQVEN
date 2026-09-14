import { describe, expect, it } from "vitest"
import { deltaOf } from "./delta.js"

describe("deltaOf: короткая разница входа и выхода", () => {
  it("совпадает", () => {
    const delta = deltaOf({ a: 1, b: [1, 2] }, { a: 1, b: [1, 2] })
    expect(delta.kind).toBe("same")
    expect(delta.text).toBe("совпадает")
  })

  it("добавлены поля", () => {
    const delta = deltaOf({ a: 1 }, { a: 1, b: 2, c: 3 })
    expect(delta.kind).toBe("added")
    expect(delta.text).toBe("добавлено 2 поля")
    expect(delta.added).toBe(2)
  })

  it("удалены поля", () => {
    const delta = deltaOf({ a: 1, b: 2 }, { a: 1 })
    expect(delta.kind).toBe("removed")
    expect(delta.text).toBe("удалено 1 поле")
    expect(delta.removed).toBe(1)
  })

  it("изменены значения", () => {
    const delta = deltaOf({ a: 1, b: 2 }, { a: 1, b: 5 })
    expect(delta.kind).toBe("changed")
    expect(delta.text).toBe("изменено 1 значение")
    expect(delta.changed).toBe(1)
  })

  it("смешанная правка считает всё сразу", () => {
    const delta = deltaOf({ a: 1, b: 2, c: 3 }, { a: 9, c: 3, d: 4, e: 5 })
    expect(delta.kind).toBe("changed")
    expect(delta.text).toBe("+2 · −1 · изменено 1 · поля")
    expect([delta.added, delta.removed, delta.changed]).toEqual([2, 1, 1])
  })

  it("сменилась форма", () => {
    const delta = deltaOf({ a: 1 }, [1, 2])
    expect(delta.kind).toBe("reshaped")
    expect(delta.text).toBe("сменилась форма: объект → массив")
  })

  it("ошибка на выходе", () => {
    const delta = deltaOf({ q: 1 }, { error: "модель вернула невалидный JSON" })
    expect(delta.kind).toBe("error")
    expect(delta.text).toBe("ошибка · модель вернула невалидный JSON")
  })

  it("исключение тоже ошибка", () => {
    expect(deltaOf({ q: 1 }, new Error("таймаут")).kind).toBe("error")
  })

  it("пустой выход — отдельный сигнал", () => {
    expect(deltaOf({ a: 1 }, null).kind).toBe("empty")
    expect(deltaOf({ a: 1 }, []).text).toBe("— пусто на выходе")
  })

  it("массивы: рост, усадка и правка на месте", () => {
    expect(deltaOf([1, 2], [1, 2, 3, 4]).text).toBe("добавлено 2 элемента")
    expect(deltaOf([1, 2, 3], [1]).text).toBe("удалено 2 элемента")
    expect(deltaOf([1, 2, 3], [1, 9, 3]).text).toBe("изменено 1 элемент")
  })

  it("пустой вход считается началом", () => {
    expect(deltaOf(null, { a: 1, b: 2 }).text).toBe("добавлено 2 поля")
    expect(deltaOf(null, [1, 2, 3]).text).toBe("добавлено 3 элемента")
    expect(deltaOf(null, 42).text).toBe("появилось значение")
  })

  it("скаляры меняются без подробностей", () => {
    const delta = deltaOf(5, 7)
    expect(delta.kind).toBe("changed")
    expect(delta.text).toBe("значение изменилось")
  })

  it("вложенная правка видна на верхнем уровне", () => {
    const before = { stats: [{ count: 1 }], headline: "Есть" }
    const after = { stats: [{ count: 2 }], headline: "Есть" }
    expect(deltaOf(before, after).text).toBe("изменено 1 значение")
  })

  it("кириллические ключи считаются наравне", () => {
    expect(deltaOf({ задача: 1 }, { задача: 1, ответ: 2 }).text).toBe("добавлено 1 поле")
  })
})
