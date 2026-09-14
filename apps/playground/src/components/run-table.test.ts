import { describe, expect, test } from "vitest"
import { barOf, buildTable, columnsOf, filtered, signalOf, slowFloorOf, windowOf } from "./run-table.js"
import type { RunStep, StepCheck } from "./run-steps.js"

const step = (patch: Partial<RunStep>): RunStep => ({
  index: 1,
  nodeId: "node",
  kind: "llm",
  description: null,
  summary: null,
  status: "ok",
  startedAt: 1000,
  durationMs: 100,
  progress: null,
  slots: null,
  input: { a: 1 },
  output: { b: 2 },
  outputType: "Out",
  prompt: null,
  rawResponse: null,
  checks: [],
  metrics: { inputTokens: null, outputTokens: null, totalTokens: null, costUsd: null },
  badges: [],
  simplifications: [],
  error: null,
  signature: "s",
  ...patch,
})

const failed: StepCheck = { name: "схема", ok: false, message: "ожидался объект" }

describe("колонки прячутся, когда исполнитель их не заполняет", () => {
  test("пустые метрики убирают колонки целиком", () => {
    expect([...columnsOf([step({}), step({})])]).toEqual([])
  })

  test("одна заполненная строка возвращает колонку", () => {
    const rich = step({ metrics: { inputTokens: 10, outputTokens: 5, totalTokens: 15, costUsd: null } })
    expect([...columnsOf([step({}), rich])]).toEqual(["tokens"])
  })

  test("проверки и стоимость показываются независимо", () => {
    const priced = step({ metrics: { inputTokens: null, outputTokens: null, totalTokens: null, costUsd: 0.01 } })
    const checked = step({ checks: [failed] })
    expect([...columnsOf([priced, checked])].sort()).toEqual(["checks", "cost"])
  })
})

describe("сигналы", () => {
  test("ошибка важнее всех остальных признаков", () => {
    const broken = step({ status: "error", error: "сломалось", checks: [failed], simplifications: ["заглушка"] })
    expect(signalOf(broken, null)?.kind).toBe("error")
  })

  test("проваленная проверка важнее пустого выхода", () => {
    expect(signalOf(step({ checks: [failed], output: null }), null)?.kind).toBe("check")
  })

  test("пустой выход при успехе — отдельный сигнал", () => {
    expect(signalOf(step({ output: [] }), null)?.kind).toBe("empty")
    expect(signalOf(step({ output: {} }), null)?.kind).toBe("empty")
    expect(signalOf(step({ output: "" }), null)?.kind).toBe("empty")
  })

  test("медленный шаг отмечается только при заданном пороге", () => {
    expect(signalOf(step({ durationMs: 900 }), null)).toBeNull()
    expect(signalOf(step({ durationMs: 900 }), 500)?.kind).toBe("slow")
  })

  test("упрощения исполнителя дают самый слабый сигнал", () => {
    expect(signalOf(step({ simplifications: ["модель не вызвана"] }), null)?.kind).toBe("stub")
  })

  test("здоровый шаг не имеет сигнала", () => {
    expect(signalOf(step({}), 500)).toBeNull()
  })
})

describe("порог медленного шага", () => {
  test("на коротком прогоне порога нет", () => {
    expect(slowFloorOf([step({}), step({}), step({})])).toBeNull()
  })

  test("порог не опускается ниже пола в 40 мс", () => {
    const quick = Array.from({ length: 10 }, () => step({ durationMs: 1 }))
    expect(slowFloorOf(quick)).toBe(40)
  })
})

describe("шкала времени", () => {
  const steps = [
    step({ nodeId: "a", startedAt: 1000, durationMs: 100 }),
    step({ nodeId: "b", startedAt: 1100, durationMs: 300 }),
  ]

  test("окно охватывает весь прогон", () => {
    expect(windowOf(steps, 2000)).toEqual({ from: 1000, span: 400 })
  })

  test("полоса отражает начало и длительность", () => {
    const window = windowOf(steps, 2000)
    expect(barOf(steps[1] as RunStep, window, 2000)).toMatchObject({ left: 25, width: 75, running: false })
  })

  test("шаг без старта не получает полосы", () => {
    expect(barOf(step({ startedAt: null }), windowOf(steps, 2000), 2000)).toBeNull()
  })

  test("идущий шаг тянется до текущего момента", () => {
    const live = step({ nodeId: "c", startedAt: 1000, durationMs: null, status: "running" })
    const bar = barOf(live, windowOf([live], 1500), 1500)
    expect(bar?.running).toBe(true)
    expect(bar?.width).toBeGreaterThan(90)
  })
})

describe("таблица целиком", () => {
  const steps = [
    step({ nodeId: "a", status: "error", error: "упал" }),
    step({ nodeId: "b", simplifications: ["заглушка"] }),
    step({ nodeId: "c" }),
  ]

  test("считает сигналы по видам", () => {
    const table = buildTable(steps, 2000)
    expect(table.counts.get("error")).toBe(1)
    expect(table.counts.get("stub")).toBe(1)
  })

  test("фильтр без выбора показывает всё", () => {
    expect(filtered(buildTable(steps, 2000), new Set()).length).toBe(3)
  })

  test("фильтр по виду оставляет только его", () => {
    const only = filtered(buildTable(steps, 2000), new Set(["error"] as const))
    expect(only.map((row) => row.step.nodeId)).toEqual(["a"])
  })
})
