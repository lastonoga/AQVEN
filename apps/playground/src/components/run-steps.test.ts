import { describe, expect, it } from "vitest"
import { foldRun } from "../run/events.js"
import { testIr, testRun } from "../refs/fixture.js"
import { buildSteps, formatTokens, formatUsd, stepBadges, stepSlots, stepSnapshot } from "./run-steps.js"
import { PROMPT_TEXT, RAW_TEXT, finishedEvents, rendersFixture, runFixture, startedEvents } from "./run-steps.fixture.js"
import type { RunStep } from "./run-steps.js"

const stepsOf = (): RunStep[] => buildSteps(foldRun(finishedEvents, "ok"), rendersFixture)

const stepAt = (nodeId: string): RunStep => {
  const found = stepsOf().find((step) => step.nodeId === nodeId)
  if (found === undefined) throw new Error(`нет шага ${nodeId}`)
  return found
}

describe("buildSteps", () => {
  it("нумерует шаги в порядке исполнения", () => {
    expect(stepsOf().map((step) => [step.index, step.nodeId])).toEqual([
      [1, "load_hotels"],
      [2, "pick"],
      [3, "render"],
    ])
  })

  it("показывает шаги ещё до их завершения", () => {
    const steps = buildSteps(foldRun(startedEvents, "running"), {})
    expect(steps.map((step) => step.status)).toEqual(["running", "pending", "pending"])
    expect(steps[0]?.durationMs).toBeNull()
  })

  it("берёт вид узла, длительность и тип выхода из событий", () => {
    const step = stepAt("load_hotels")
    expect(step.kind).toBe("tool")
    expect(step.durationMs).toBe(90)
    expect(step.outputType).toBe("Hotel[]")
    expect(step.status).toBe("ok")
  })

  it("берёт промт из записи прогона, а сырой ответ и проверки из события", () => {
    const step = stepAt("render")
    expect(step.prompt).toBe(PROMPT_TEXT)
    expect(step.rawResponse).toBe(RAW_TEXT)
    expect(step.checks).toEqual([{ name: "schema", ok: true, message: "выход валиден по схеме Pitch" }])
  })

  it("не выдумывает промт, ответ и проверки для не-llm узлов", () => {
    const step = stepAt("pick")
    expect(step.prompt).toBeNull()
    expect(step.rawResponse).toBeNull()
    expect(step.checks).toEqual([])
  })

  it("читает токены и стоимость, когда исполнитель их прислал", () => {
    expect(stepAt("render").metrics).toEqual({
      inputTokens: 1_200,
      outputTokens: 300,
      totalTokens: 1_500,
      costUsd: 0.0123,
    })
  })

  it("оставляет метрики пустыми, когда их нет", () => {
    expect(stepAt("pick").metrics).toEqual({
      inputTokens: null,
      outputTokens: null,
      totalTokens: null,
      costUsd: null,
    })
  })

  it("кладёт вход и выход шага рядом", () => {
    const step = stepAt("render")
    expect(step.input).toEqual({ best: { id: "h2", name: "Бриз" }, locale: "ru", limit: 3 })
    expect(step.output).toEqual({ text: "Бриз — лучший вариант по цене и морю", tone: "нейтральный" })
  })

  it("меняет подпись шага, когда приходит новое событие", () => {
    const before = buildSteps(foldRun(startedEvents, "running"), {})[0]?.signature
    const after = stepAt("load_hotels").signature
    expect(before).not.toBe(after)
  })

  it("не трогает подписи чужих шагов, когда событие пришло по одному узлу", () => {
    const earlier = buildSteps(foldRun(finishedEvents.slice(0, 4), "running"), {})
    const later = buildSteps(foldRun(finishedEvents.slice(0, 5), "running"), {})
    const signature = (steps: RunStep[], nodeId: string): string | undefined =>
      steps.find((step) => step.nodeId === nodeId)?.signature
    expect(signature(later, "load_hotels")).toBe(signature(earlier, "load_hotels"))
    expect(signature(later, "pick")).not.toBe(signature(earlier, "pick"))
  })
})

describe("stepBadges", () => {
  it("сворачивает длинные упрощения в короткие бейджи", () => {
    expect(stepAt("render").badges.map((badge) => badge.label)).toEqual([
      "ответ сгенерирован по схеме",
      "промт собран заглушкой",
      "ретраи выключены",
    ])
  })

  it("схлопывает одинаковые бейджи и собирает исходный текст в подсказку", () => {
    const badges = stepBadges(["ретраи выключены", "ретраи выключены (в IR defaults.retry.attempts: 2)"])
    expect(badges).toHaveLength(1)
    expect(badges[0]?.title.split("\n")).toHaveLength(2)
  })

  it("не теряет упрощение, для которого нет правила", () => {
    expect(stepBadges(["нечто новое от исполнителя"])).toEqual([
      { label: "нечто новое от исполнителя", title: "нечто новое от исполнителя" },
    ])
  })

  it("подрезает слишком длинный текст без правила", () => {
    const badges = stepBadges(["исполнитель прислал очень длинное объяснение упрощения прогона"])
    expect(badges[0]?.label).toHaveLength(30)
    expect(badges[0]?.title).toContain("очень длинное объяснение")
  })
})

describe("stepSlots", () => {
  it("разбирает слоты резолвером refs: имя, тип, значение", () => {
    const slots = stepSlots(stepAt("render"), testIr, testRun)
    expect(slots.map((slot) => slot.name)).toEqual(["best", "locale", "limit"])
    expect(slots[0]?.provenance?.ref?.text).toBe("$pick.out.best")
    expect(slots[0]?.type).toBe("Choice.best")
    expect(slots[0]?.value).toEqual({ id: "h2", name: "Бриз" })
    expect(slots.every((slot) => slot.known)).toBe(true)
  })

  it("показывает слот, записанный прогоном, даже если его нет в IR", () => {
    const step = { ...stepAt("render"), slots: null }
    const slots = stepSlots(step, testIr, testRun)
    expect(slots.map((slot) => slot.name)).toEqual(["best", "locale", "limit"])
    expect(slots[1]?.provenance).toBeNull()
    expect(slots[1]?.value).toBe("ru")
  })

  it("работает без IR", () => {
    expect(stepSlots(stepAt("pick"), null, null).map((slot) => slot.name)).toEqual(["scores"])
  })
})

describe("stepSnapshot", () => {
  it("без прогона снимка нет", () => {
    expect(stepSnapshot(null, rendersFixture)).toBeNull()
  })

  it("кладёт вход прогона и записи узлов в снимок для резолвера", () => {
    const snapshot = stepSnapshot(runFixture, rendersFixture)
    expect(snapshot?.input).toEqual({ locale: "ru", topic: "море" })
    expect(snapshot?.renders["render"]?.output).toEqual({
      text: "Бриз — лучший вариант по цене и морю",
      tone: "нейтральный",
    })
  })
})

describe("форматирование", () => {
  it("токены", () => {
    expect(formatTokens(null)).toBe("—")
    expect(formatTokens(1_500)).toMatch(/^1\s500$/)
  })

  it("стоимость", () => {
    expect(formatUsd(null)).toBe("—")
    expect(formatUsd(0)).toBe("$0")
    expect(formatUsd(0.0123)).toBe("$0.0123")
    expect(formatUsd(2.5)).toBe("$2.50")
  })
})
