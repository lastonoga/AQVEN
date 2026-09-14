import { describe, expect, it } from "vitest"
import { diffPrompts, promptParts } from "./prompt-diff.js"

const diffText = (parts: readonly { text: string; same: boolean }[]): string =>
  parts.filter((part) => !part.same).map((part) => part.text).join("|")

describe("diffPrompts", () => {
  it("одинаковые промты целиком общие", () => {
    const parts = diffPrompts(["роль: writer\nзадача: ответ", "роль: writer\nзадача: ответ"])
    expect(parts).toHaveLength(2)
    expect(parts.every((branch) => branch.every((part) => part.same))).toBe(true)
  })

  it("подсвечивает только различающийся фрагмент", () => {
    const parts = diffPrompts([
      "роль модели writer температура 0.3 задача ответить",
      "роль модели writer температура 1.1 задача ответить",
    ])
    expect(diffText(parts[0] ?? [])).toBe("0.3")
    expect(diffText(parts[1] ?? [])).toBe("1.1")
  })

  it("общий текст остаётся общим при вставке в одну ветку", () => {
    const parts = diffPrompts(["а б в", "а б в", "а новое б в"])
    expect(diffText(parts[0] ?? [])).toBe("")
    expect(diffText(parts[2] ?? [])).toContain("новое")
  })

  it("фрагмент, различающийся хотя бы в одной ветке, подсвечен во всех", () => {
    const parts = diffPrompts(["тон сухой", "тон сухой", "тон тёплый"])
    expect(diffText(parts[0] ?? [])).toBe("сухой")
    expect(diffText(parts[1] ?? [])).toBe("сухой")
    expect(diffText(parts[2] ?? [])).toBe("тёплый")
  })

  it("склеивает соседние токены одного вида в один фрагмент", () => {
    const parts = diffPrompts(["один два три", "один два три"])
    expect(parts[0]).toEqual([{ text: "один два три", same: true }])
  })

  it("длинные промты не роняют разбор", () => {
    const long = Array.from({ length: 4000 }, (_, index) => `слово${index}`).join(" ")
    const parts = diffPrompts([long, `${long} хвост`])
    expect(diffText(parts[1] ?? [])).toContain("хвост")
  })
})

describe("promptParts", () => {
  it("ветка без промта даёт пустой список фрагментов", () => {
    const parts = promptParts([null, "текст"])
    expect(parts[0]).toEqual([])
    expect(parts[1]?.length).toBeGreaterThan(0)
  })
})
