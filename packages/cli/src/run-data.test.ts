import { describe, expect, it } from "vitest"
import { typeValue } from "./type-values.js"
import { summaryOf, SUMMARY_CHARS } from "./summary.js"
import { checksOf } from "./checks.js"
import { estimateMetrics } from "./metrics.js"
import { runByReadiness, pooled } from "./scheduler.js"
import { renderKey } from "./runs-db.js"
import type { TypeCatalog } from "./ir-types.js"
import type { Emit } from "./schema-values.js"

const emit: Emit = (mime, name) => ({ $media: mime, url: null, name, bytes: 0 })

const catalog: TypeCatalog = {
  Pitch: {
    name: "Pitch",
    kind: "object",
    declared: true,
    description: "Питч подборки",
    example: { title: "Семь ночей в Ларе", body: "Песчаный вход и бассейн", featureIds: ["ft-pool"] },
    schema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Заголовок питча" },
        body: { type: "string", description: "Текст питча" },
        featureIds: { type: "array", items: { type: "string", description: "Факт" } },
      },
      required: ["title", "body", "featureIds"],
    },
  },
  Doc: {
    name: "Doc",
    kind: "object",
    declared: true,
    description: "Документ досье",
    example: { id: "doc-supply-agreement", title: "Договор поставки" },
  },
  Hotel: {
    name: "Hotel",
    kind: "object",
    declared: true,
    description: "Отель",
    schema: {
      type: "object",
      properties: {
        stars: { type: "integer", minimum: -9007199254740991, maximum: 9007199254740991, description: "Звёзды" },
        beach_entry: { type: "string", enum: ["sand", "pebble"], description: "Вход в море" },
        id: { type: "string", description: "Идентификатор отеля" },
      },
      required: ["id", "stars"],
    },
  },
}

const request = (typeName: string, index = 0) => ({ typeName, catalog, emit, index, fallbackText: "подпись узла" })

describe("typeValue: значение строится из ir.types", () => {
  it("берёт пример типа как есть", () => {
    const built = typeValue(request("Pitch"))
    expect(built.source).toBe("example")
    expect(built.value).toEqual(catalog["Pitch"]?.example)
  })

  it("детерминирован: один тип · одно значение", () => {
    expect(typeValue(request("Hotel")).value).toEqual(typeValue(request("Hotel")).value)
    expect(typeValue(request("Pitch")).value).toEqual(typeValue(request("Pitch")).value)
  })

  it("собирает запись по схеме, required идут первыми", () => {
    const built = typeValue(request("Hotel"))
    expect(built.source).toBe("schema")
    expect(Object.keys(built.value as object)).toEqual(["id", "stars", "beach_entry"])
  })

  it("уважает enum и не выпускает бессмысленные границы integer", () => {
    const value = typeValue(request("Hotel")).value as { stars: number; beach_entry: string }
    expect(["sand", "pebble"]).toContain(value.beach_entry)
    expect(Number.isInteger(value.stars)).toBe(true)
    expect(Math.abs(value.stars)).toBeLessThan(1000)
  })

  it("нумерует идентификаторы в копиях примера", () => {
    const first = typeValue(request("Doc", 0)).value as { id: string; title: string }
    const second = typeValue(request("Doc", 1)).value as { id: string; title: string }
    expect(first.id).toBe("doc-supply-agreement")
    expect(second.id).toBe("doc-supply-agreement-2")
    expect(second.title).toBe(first.title)
  })

  it("различает элементы, собранные по схеме", () => {
    const first = typeValue(request("Hotel", 0)).value as { id: string }
    const second = typeValue(request("Hotel", 1)).value as { id: string }
    expect(second.id).not.toBe(first.id)
  })

  it("честно сообщает о необъявленном типе вместо технической заглушки", () => {
    const built = typeValue(request("analysis_out"))
    expect(built.source).toBe("stub")
    expect(built.value).toMatchObject({ text: "подпись узла" })
    expect(JSON.stringify(built.value)).not.toContain("_stub")
  })
})

describe("summaryOf: глагольная подпись исполнения", () => {
  it("склеивает вид узла, описание и факты выхода", () => {
    const summary = summaryOf({
      nodeId: "load_hotels",
      kind: "tool",
      description: "Отели по фильтрам заявки",
      output: [1, 2, 3],
      outputType: "Hotel[]",
      undeclared: false,
      facts: [],
    })
    expect(summary).toBe("загрузил отели по фильтрам заявки · 3 элемента типа Hotel")
  })

  it("режет описание по двоеточию и не выходит за лимит", () => {
    const summary = summaryOf({
      nodeId: "memo",
      kind: "llm",
      description: `Синтезатор: ${"очень длинное пояснение ".repeat(30)}`,
      output: { sections: [1, 2], title: "x" },
      outputType: "Memo",
      undeclared: false,
      facts: [],
    })
    expect(summary.startsWith("собрал синтезатор · ")).toBe(true)
    expect(summary.length).toBeLessThanOrEqual(SUMMARY_CHARS)
  })

  it("отдаёт приоритет фактам обработчика", () => {
    const summary = summaryOf({
      nodeId: "clause_checks",
      kind: "map",
      description: null,
      output: [1],
      outputType: "X[]",
      undeclared: false,
      facts: ["3 из 40 элементов"],
    })
    expect(summary).toBe("обработал clause_checks · 3 из 40 элементов")
  })
})

describe("checksOf: проверки выхода", () => {
  const base = { catalog, requiredPaths: [], usdMicros: 100, budgetMicros: null } as const

  it("видит незаполненное обязательное поле", () => {
    const checks = checksOf({ ...base, typeName: "Pitch", source: "schema", output: { title: "t", body: null } })
    expect(checks.find((c) => c.name === "обязательные поля")).toMatchObject({ ok: false })
  })

  it("подтверждает пример типа и непустой выход", () => {
    const checks = checksOf({ ...base, typeName: "Pitch", source: "example", output: catalog["Pitch"]?.example })
    expect(checks.every((c) => c.ok)).toBe(true)
  })

  it("ловит путь, который спрашивает другой узел", () => {
    const checks = checksOf({
      ...base,
      typeName: "Pitch",
      source: "example",
      output: { title: "t", body: "b", featureIds: [] },
      requiredPaths: [["best", "title"]],
    })
    expect(checks.find((c) => c.name === "ссылки других узлов")).toMatchObject({ ok: false })
  })

  it("сравнивает оценку стоимости с бюджетом узла", () => {
    const checks = checksOf({ ...base, typeName: "Pitch", source: "example", output: { a: 1 }, usdMicros: 500, budgetMicros: 100 })
    expect(checks.find((c) => c.name === "бюджет узла")).toMatchObject({ ok: false })
  })
})

describe("estimateMetrics: оценка токенов и стоимости", () => {
  const metricsFor = (node: Record<string, unknown>) =>
    estimateMetrics({
      kind: "llm",
      node,
      flowBudget: { usdMicros: 400000 },
      nodeCount: 10,
      prompt: "x".repeat(300),
      inputs: { a: "y".repeat(90) },
      output: { b: "z".repeat(60) },
      attempt: 1,
    })

  it("считает токены по длине входа и выхода", () => {
    const metrics = metricsFor({ modelRole: "writer_openai" })
    expect(metrics.tokens.total).toBe(metrics.tokens.input + metrics.tokens.output)
    expect(metrics.tokens.input).toBeGreaterThan(metrics.tokens.output)
  })

  it("не выходит за бюджет узла и выводит семейство модели из роли", () => {
    const metrics = metricsFor({ modelRole: "writer_anthropic", budget: { usdMicros: 90000 } })
    expect(metrics.usdMicros).toBeLessThanOrEqual(90000)
    expect(metrics.costUsd).toBeCloseTo(metrics.usdMicros / 1_000_000)
    expect(metrics.provider).toBe("anthropic")
    expect(metrics.attempt).toBe(1)
  })
})

describe("runByReadiness: планировщик по готовности входов", () => {
  it("держит порядок зависимостей и даёт независимым узлам перекрыться", async () => {
    const live: string[] = []
    const peak: number[] = []
    const order: string[] = []
    const deps = new Map<string, string[]>([
      ["a", []],
      ["b", ["a"]],
      ["c", ["a"]],
      ["d", ["b", "c"]],
    ])
    await runByReadiness({
      ids: ["a", "b", "c", "d"],
      deps,
      concurrency: 4,
      now: () => Date.now(),
      run: async (slot) => {
        live.push(slot.id)
        order.push(slot.id)
        peak.push(live.length)
        await new Promise((resolve) => setTimeout(resolve, 20))
        live.splice(live.indexOf(slot.id), 1)
        return true
      },
    })
    expect(order[0]).toBe("a")
    expect(order[3]).toBe("d")
    expect(Math.max(...peak)).toBe(2)
  })

  it("останавливается после отказа узла", async () => {
    const seen: string[] = []
    await runByReadiness({
      ids: ["a", "b"],
      deps: new Map([
        ["a", []],
        ["b", ["a"]],
      ]),
      concurrency: 1,
      now: () => Date.now(),
      run: async (slot) => {
        seen.push(slot.id)
        return false
      },
    })
    expect(seen).toEqual(["a"])
  })

  it("разрывает цикл принудительным запуском", async () => {
    const report = await runByReadiness({
      ids: ["a", "b"],
      deps: new Map([
        ["a", ["b"]],
        ["b", ["a"]],
      ]),
      concurrency: 2,
      now: () => Date.now(),
      run: async () => true,
    })
    expect(report.started).toHaveLength(2)
    expect(report.forced).toContain("a")
  })
})

describe("pooled: ограничение конкурентности", () => {
  it("сохраняет порядок результатов при параллельной работе", async () => {
    let live = 0
    let peak = 0
    const values = await pooled(6, 2, async (index) => {
      live += 1
      peak = Math.max(peak, live)
      await new Promise((resolve) => setTimeout(resolve, 5))
      live -= 1
      return index * 2
    })
    expect(values).toEqual([0, 2, 4, 6, 8, 10])
    expect(peak).toBe(2)
  })
})

describe("renderKey: ключ входа/выхода ветки и итерации", () => {
  it("оставляет базовый рендер под именем узла", () => {
    expect(renderKey({ runId: "r", nodeId: "n", branchKey: "", iteration: 0, input: null, output: null, prompt: null })).toBe("n")
  })

  it("разводит ветки и итерации", () => {
    expect(renderKey({ runId: "r", nodeId: "n", branchKey: "openai", iteration: 0, input: null, output: null, prompt: null })).toBe("n#openai")
    expect(renderKey({ runId: "r", nodeId: "n", branchKey: "", iteration: 2, input: null, output: null, prompt: null })).toBe("n@2")
  })
})
