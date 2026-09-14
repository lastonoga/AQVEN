import { describe, expect, it } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import { TypeBadge } from "./TypeBadge.js"
import { TypeCard, TypeView } from "./TypeView.js"
import type { Ir } from "../api/index.js"

const baseIr = (): Ir => ({
  flow: "demo",
  version: 1,
  input: "Request",
  output: { type: "ResearchBrief", from: "$brief.out" },
  components: {},
  nodes: {},
})

const irWith = (types: unknown): Ir => Object.assign(baseIr(), { types })

const ir = irWith({
  ResearchBrief: {
    id: "ResearchBrief",
    kind: "record",
    description: "Краткая сводка исследования",
    example: { title: "Рынок отелей" },
    schema: {
      type: "object",
      required: ["title", "tone"],
      properties: {
        title: { type: "string", description: "Заголовок сводки" },
        draft: { type: ["string", "null"] },
        tone: { $ref: "#/$defs/Tone" },
      },
      $defs: { Tone: { type: "string", enum: ["dry", "warm"] } },
    },
  },
  Tone: {
    id: "Tone",
    kind: "enum",
    description: "Тон изложения",
    values: { dry: "Сухой", warm: "Тёплый" },
    schema: { type: "string", enum: ["dry", "warm"] },
  },
})

const markup = (node: Parameters<typeof renderToStaticMarkup>[0]): string => renderToStaticMarkup(node)

describe("TypeView", () => {
  it("показывает вид, описание и поля с описаниями", () => {
    const html = markup(<TypeView type="ResearchBrief" ir={ir} />)
    expect(html).toContain("запись")
    expect(html).toContain("Краткая сводка исследования")
    expect(html).toContain("title")
    expect(html).toContain("Заголовок сводки")
    expect(html).toContain("опц.")
    expect(html).toContain("null")
  })

  it("показывает значения enum с описаниями", () => {
    const html = markup(<TypeView type="Tone" ir={ir} />)
    expect(html).toContain("перечисление")
    expect(html).toContain("dry")
    expect(html).toContain("Сухой")
  })

  it("говорит о незаявленном описании поля прямо", () => {
    const html = markup(<TypeView type="ResearchBrief" ir={ir} />)
    expect(html).toContain("описание поля не объявлено")
  })

  it("тип без схемы показывает, что схема не объявлена", () => {
    const html = markup(<TypeView type="HotelPitch" ir={baseIr()} />)
    expect(html).toContain("не объявлена")
    expect(html).toContain("HotelPitch")
  })

  it("пример значения показывается, когда объявлен", () => {
    const html = markup(<TypeView type="ResearchBrief" ir={ir} />)
    expect(html).toContain("пример значения")
    expect(html).toContain("Рынок отелей")
  })

  it("отсутствие примера названо явно", () => {
    const html = markup(<TypeView type="Tone" ir={ir} />)
    expect(html).toContain("пример значения не объявлен")
  })
})

describe("TypeBadge", () => {
  it("известный тип — кнопка, открывающая тип целиком", () => {
    const html = markup(<TypeBadge type="ResearchBrief" ir={ir} />)
    expect(html).toContain("<button")
    expect(html).toContain("ResearchBrief")
  })

  it("тип без схемы помечен пунктиром и подписью", () => {
    const html = markup(<TypeBadge type="HotelPitch" ir={baseIr()} />)
    expect(html).toContain("без схемы")
    expect(html).toContain("border-dashed")
  })

  it("пустой тип объявлен отсутствующим", () => {
    expect(markup(<TypeBadge type="" ir={ir} />)).toContain("тип не объявлен")
  })
})

describe("TypeCard", () => {
  it("в поповере — вид, описание и первые поля", () => {
    const html = markup(<TypeCard type="ResearchBrief" ir={ir} />)
    expect(html).toContain("запись")
    expect(html).toContain("title")
    expect(html).toContain("Tone")
  })

  it("путь по полям показывается целиком", () => {
    const html = markup(<TypeCard type="ResearchBrief.title" ir={ir} />)
    expect(html).toContain("ResearchBrief.title")
  })
})
