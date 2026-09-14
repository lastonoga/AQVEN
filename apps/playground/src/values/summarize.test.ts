import { describe, expect, it } from "vitest"
import { summarize } from "./summarize.js"
import { demoIr, stubDigest, ticket } from "./summary.fixture.js"

const PNG_PIXEL =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="

const LONG = `${"Договор поставки оборудования между ООО «Ветра» и АО «Тепло». ".repeat(1)}${"Сторона обязуется поставить оборудование в срок. ".repeat(40)}`

describe("summarize: объект", () => {
  it("показывает значимые поля со значениями в порядке required", () => {
    const summary = summarize(ticket, "Ticket", demoIr)
    expect(summary.kind).toBe("object")
    expect(summary.text).toBe(
      "id: «tkt-48219» · text: «Заказ обещали в понедельник…» · created_at: 17 марта 2025, 09:12",
    )
    expect(summary.typeLabel).toBe("обращение из пакета")
    expect(summary.count).toBe(3)
  })

  it("называет незаполненные обязательные поля и уводит служебные ключи в хвост", () => {
    const summary = summarize(stubDigest, "Digest", demoIr)
    expect(summary.text).toBe("id: «digest_out_315e3b» · title: «короткий разбор без правок» · score: 0,89")
    expect(summary.detail).toBe("не заполнено: batch_id, headline, stats")
    expect(summary.missing).toEqual(["batch_id", "headline", "stats"])
  })

  it("вложенный объект и вложенный массив сжимаются до счётчика", () => {
    const summary = summarize({ author: { name: "Аня", role: "клиент" }, tags: ["a", "b", "c"] }, "", null)
    expect(summary.text).toBe("author: 2 поля · tags: 3 элемента")
  })

  it("без типа берёт собственные ключи значения", () => {
    const summary = summarize({ задача: "сводка", n: 4 }, "", null)
    expect(summary.text).toBe("задача: «сводка» · n: 4")
  })
})

describe("summarize: массив", () => {
  it("зовёт элементы человеческим именем типа и показывает превью первого", () => {
    const summary = summarize([ticket, ticket, ticket], "Ticket[]", demoIr)
    expect(summary.kind).toBe("array")
    expect(summary.text).toBe("3 обращения")
    expect(summary.count).toBe(3)
    expect(summary.detail.startsWith("id: «tkt-48219»")).toBe(true)
  })

  it("склоняет счётную форму под число", () => {
    expect(summarize(Array(12).fill(ticket), "Ticket[]", demoIr).text).toBe("12 обращений")
    expect(summarize([ticket], "Ticket[]", demoIr).text).toBe("1 обращение")
  })

  it("берёт имя элемента из схемы массива, когда отдельного типа нет", () => {
    const summary = summarize([{ category_id: "cat-1", count: 137 }], "CategoryStat[]", demoIr)
    expect(summary.text).toBe("1 статистика")
    expect(summary.detail).toBe("category_id: «cat-1» · count: 137")
  })

  it("без типа считает элементы", () => {
    expect(summarize([1, 2, 3], "", null).text).toBe("3 элемента")
  })
})

describe("summarize: пусто как диагностика", () => {
  it("нет значения", () => {
    const summary = summarize(null, "Ticket", demoIr)
    expect(summary.kind).toBe("empty")
    expect(summary.text).toBe("— пусто")
    expect(summary.detail).toBe("значения нет · обращение из пакета")
  })

  it("пустой массив", () => {
    const summary = summarize([], "Ticket[]", demoIr)
    expect(summary.kind).toBe("empty")
    expect(summary.detail).toBe("пустой список · обращение из пакета")
  })

  it("объект без заполненных обязательных полей", () => {
    const summary = summarize({ batch_id: "", headline: null, stats: [] }, "Digest", demoIr)
    expect(summary.kind).toBe("empty")
    expect(summary.detail).toBe("не заполнено: batch_id, headline, stats · объект без заполненных полей")
  })

  it("пустая строка", () => {
    expect(summarize("", "Memo", demoIr).detail).toBe("пустая строка · текст меморандума целиком")
  })
})

describe("summarize: скаляры", () => {
  it("длинная строка: первое предложение и остаток знаками", () => {
    const summary = summarize(LONG, "Memo", demoIr)
    expect(summary.kind).toBe("text")
    expect(summary.text).toBe("Договор поставки оборудования между ООО «Ветра»…")
    expect(summary.detail).toBe("+2,0 тыс. знаков")
    expect(summary.count).toBe(LONG.trim().length)
  })

  it("короткая строка вместо остатка показывает имя типа", () => {
    expect(summarize("Готово.", "Memo", demoIr).detail).toBe("текст меморандума целиком")
  })

  it("enum: значение и расшифровка", () => {
    const summary = summarize("billing", "RouteKind", demoIr)
    expect(summary.kind).toBe("enum")
    expect(summary.text).toBe("billing")
    expect(summary.detail).toBe("Деньги: счета, списания, возвраты")
  })

  it("идентификатор: значение и источник допустимого множества", () => {
    const summary = summarize("tkt-48219", "TicketId", demoIr)
    expect(summary.kind).toBe("id")
    expect(summary.detail).toBe("источник: tickets_of_batch()")
  })

  it("дата: человеческий вид, в пояснении исходная строка", () => {
    const summary = summarize("2025-03-17T09:12:00Z", "CreatedAt", demoIr)
    expect(summary.kind).toBe("date")
    expect(summary.text).toBe("17 марта 2025, 09:12")
    expect(summary.detail).toBe("2025-03-17T09:12:00Z")
  })

  it("число: разряды по-русски и имя типа рядом", () => {
    const summary = summarize(0.89, "Score", demoIr)
    expect(summary.text).toBe("0,89")
    expect(summary.detail).toBe("оценка от 0 до 1")
  })

  it("булево словами", () => {
    expect(summarize(true, "", null).text).toBe("да")
    expect(summarize(false, "", null).text).toBe("нет")
  })
})

describe("summarize: медиа и ссылки", () => {
  it("конверт медиа: имя, формат, размер", () => {
    const summary = summarize({ $media: "image/png", url: "/api/blobs/aa", name: "обложка.png", bytes: 41230 }, "", null)
    expect(summary.kind).toBe("image")
    expect(summary.text).toBe("обложка.png · PNG · 40.3 КБ")
  })

  it("base64 из схемы типа становится изображением", () => {
    const summary = summarize(PNG_PIXEL, "Cover", demoIr)
    expect(summary.kind).toBe("image")
    expect(summary.facts.media?.inline).toBe(true)
  })

  it("ссылка без расширения", () => {
    const summary = summarize("https://example.com/page", "", null)
    expect(summary.kind).toBe("link")
    expect(summary.text).toBe("example.com/page")
    expect(summary.detail).toBe("https://example.com/page")
  })
})
