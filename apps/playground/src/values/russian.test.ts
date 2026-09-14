import { describe, expect, it } from "vitest"
import { countedNoun, nounFormsOf, plural } from "./russian.js"

describe("russian: счётные формы", () => {
  it("склоняет по числу", () => {
    expect(plural(1, "элемент", "элемента", "элементов")).toBe("элемент")
    expect(plural(3, "элемент", "элемента", "элементов")).toBe("элемента")
    expect(plural(11, "элемент", "элемента", "элементов")).toBe("элементов")
    expect(plural(21, "элемент", "элемента", "элементов")).toBe("элемент")
  })

  it("строит формы существительных по знакомым окончаниям", () => {
    expect(nounFormsOf("документ")).toEqual(["документ", "документа", "документов"])
    expect(nounFormsOf("обращение")).toEqual(["обращение", "обращения", "обращений"])
    expect(nounFormsOf("заявка")).toEqual(["заявка", "заявки", "заявок"])
    expect(nounFormsOf("карточка")).toEqual(["карточка", "карточки", "карточек"])
    expect(nounFormsOf("статистика")).toEqual(["статистика", "статистики", "статистик"])
    expect(nounFormsOf("статья")).toEqual(["статья", "статьи", "статей"])
    expect(nounFormsOf("позиция")).toEqual(["позиция", "позиции", "позиций"])
    expect(nounFormsOf("правило")).toEqual(["правило", "правила", "правил"])
    expect(nounFormsOf("случай")).toEqual(["случай", "случая", "случаев"])
    expect(nounFormsOf("товарищ")).toEqual(["товарищ", "товарища", "товарищей"])
  })

  it("молчит там, где правило ненадёжно", () => {
    expect(nounFormsOf("холодное")).toBeNull()
    expect(nounFormsOf("отрендеренный")).toBeNull()
    expect(nounFormsOf("голоса")).toBeNull()
    expect(nounFormsOf("заметки")).toBeNull()
    expect(nounFormsOf("письмо")).toBeNull()
    expect(nounFormsOf("уровень")).toBeNull()
    expect(nounFormsOf("досье")).toBeNull()
    expect(nounFormsOf("Issue")).toBeNull()
    expect(nounFormsOf("")).toBeNull()
  })

  it("даёт счётную форму по числу", () => {
    expect(countedNoun(12, "документ")).toBe("документов")
    expect(countedNoun(2, "документ")).toBe("документа")
    expect(countedNoun(1, "обращение")).toBe("обращение")
    expect(countedNoun(3, "обращение")).toBe("обращения")
    expect(countedNoun(5, "голоса")).toBeNull()
  })
})
