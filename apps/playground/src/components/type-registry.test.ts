import { describe, expect, it } from "vitest"
import {
  fieldsOf,
  kindOf,
  labelOf,
  readRegistry,
  resolveType,
  structureOf,
  valueDescriptionsOf,
} from "./type-registry.js"
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

const brief = {
  id: "ResearchBrief",
  kind: "record",
  description: "Краткая сводка исследования",
  example: { title: "Рынок отелей", sections: [{ heading: "Спрос" }] },
  schema: {
    type: "object",
    title: "ResearchBrief",
    required: ["title", "sections"],
    properties: {
      title: { type: "string", description: "Заголовок сводки" },
      note: { type: ["string", "null"], description: "Примечание" },
      sections: { type: "array", items: { $ref: "#/$defs/Section" } },
      tone: { $ref: "#/$defs/Tone" },
    },
    $defs: {
      Section: {
        type: "object",
        title: "Section",
        required: ["heading"],
        properties: { heading: { type: "string", description: "Заголовок раздела" } },
      },
      Tone: { type: "string", enum: ["dry", "warm", "sharp"] },
    },
  },
}

const tone = {
  id: "Tone",
  kind: "enum",
  description: "Тон изложения",
  values: { dry: "Сухой", warm: "Тёплый", sharp: "Резкий" },
  schema: { type: "string", enum: ["dry", "warm", "sharp"] },
}

const registryIr = (): Ir => irWith({ ResearchBrief: brief, Tone: tone })

describe("readRegistry", () => {
  it("читает реестр из карты типов", () => {
    const registry = readRegistry(registryIr())
    expect(Object.keys(registry).sort()).toEqual(["ResearchBrief", "Tone"])
    expect(registry["ResearchBrief"]?.description).toBe("Краткая сводка исследования")
    expect(registry["ResearchBrief"]?.hasExample).toBe(true)
  })

  it("читает реестр из массива типов по полю id", () => {
    const registry = readRegistry(irWith([tone]))
    expect(registry["Tone"]?.kind).toBe("enum")
  })

  it("без ir.types реестр пуст", () => {
    expect(readRegistry(baseIr())).toEqual({})
    expect(readRegistry(null)).toEqual({})
  })

  it("описания значений enum собираются из values", () => {
    const registry = readRegistry(registryIr())
    expect(registry["Tone"]?.valueDescriptions["warm"]).toBe("Тёплый")
  })
})

describe("resolveType", () => {
  const registry = readRegistry(registryIr())

  it("корневой тип разрешается в схему и вид", () => {
    const link = resolveType(registry, "ResearchBrief")
    expect(link.schema).not.toBeNull()
    expect(kindOf(link)).toBe("record")
  })

  it("неизвестный тип остаётся без схемы", () => {
    const link = resolveType(registry, "HotelPitch")
    expect(link.entry).toBeNull()
    expect(link.schema).toBeNull()
    expect(kindOf(link)).toBe("")
  })

  it("путь по полям ведёт к схеме поля", () => {
    const link = resolveType(registry, "ResearchBrief.title")
    expect(link.path).toEqual(["title"])
    expect(link.schema?.["type"]).toBe("string")
  })

  it("шаг через массив снимает items", () => {
    const link = resolveType(registry, "ResearchBrief.sections.heading")
    expect(link.schema?.["description"]).toBe("Заголовок раздела")
  })

  it("суффикс массива в имени типа игнорируется", () => {
    expect(resolveType(registry, "ResearchBrief[]").schema).not.toBeNull()
  })
})

describe("структура типа", () => {
  const registry = readRegistry(registryIr())
  const link = resolveType(registry, "ResearchBrief")

  it("поля несут обязательность, nullable и описание", () => {
    const fields = fieldsOf(link.schema, link.context)
    expect(fields.map((field) => field.name)).toEqual(["title", "note", "sections", "tone"])
    const note = fields.find((field) => field.name === "note")
    expect(note?.required).toBe(false)
    expect(note?.nullable).toBe(true)
    expect(note?.description).toBe("Примечание")
  })

  it("метка типа поля показывает массив и nullable", () => {
    const fields = fieldsOf(link.schema, link.context)
    const labels = Object.fromEntries(fields.map((field) => [field.name, labelOf(field.schema, link.context)]))
    expect(labels["title"]).toBe("string")
    expect(labels["note"]).toBe("string | null")
    expect(labels["sections"]).toBe("Section[]")
    expect(labels["tone"]).toBe("Tone")
  })

  it("вложенная запись раскрывается через $defs", () => {
    const fields = fieldsOf(link.schema, link.context)
    const sections = fields.find((field) => field.name === "sections")
    const inner = structureOf(sections?.schema ?? null, link.context)
    expect(inner.shape).toBe("fields")
  })

  it("enum-поле раскрывается значениями с описаниями из реестра", () => {
    const fields = fieldsOf(link.schema, link.context)
    const toneField = fields.find((field) => field.name === "tone")
    const inner = structureOf(toneField?.schema ?? null, link.context)
    expect(inner.shape === "values" ? inner.values : []).toEqual(["dry", "warm", "sharp"])
    expect(valueDescriptionsOf(toneField?.schema ?? null, link.context)["sharp"]).toBe("Резкий")
  })
})
