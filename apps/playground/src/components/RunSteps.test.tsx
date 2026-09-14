import { describe, expect, it } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import { foldRun } from "../run/events.js"
import { testIr, testRun } from "../refs/fixture.js"
import { RunSteps } from "./RunSteps.js"
import { RunStepDetail } from "./RunStepDetail.js"
import { buildSteps } from "./run-steps.js"
import { PROMPT_TEXT, finishedEvents, rendersFixture, runFixture, startedEvents } from "./run-steps.fixture.js"
import type { RunStep } from "./run-steps.js"
import type { RunEvent } from "../api/index.js"

const stepsOf = (events: readonly RunEvent[]): RunStep[] => buildSteps(foldRun(events, "ok"), rendersFixture)

const stepAt = (nodeId: string): RunStep => {
  const found = stepsOf(finishedEvents).find((step) => step.nodeId === nodeId)
  if (found === undefined) throw new Error(`нет шага ${nodeId}`)
  return found
}

const table = (events: readonly RunEvent[]): string =>
  renderToStaticMarkup(
    <RunSteps view={foldRun(events, "ok")} run={runFixture} renders={rendersFixture} ir={testIr} />,
  )

const detail = (nodeId: string): string =>
  renderToStaticMarkup(
    <RunStepDetail step={stepAt(nodeId)} ir={testIr} run={testRun} onSelectNode={() => undefined} />,
  )

describe("RunSteps", () => {
  it("рисует строку на каждый шаг с колонками таблицы", () => {
    const markup = table(finishedEvents)
    for (const column of ["узел", "статус", "длит.", "стоим.", "вход", "выход"]) expect(markup).toContain(column)
    for (const nodeId of ["load_hotels", "pick", "render"]) expect(markup).toContain(nodeId)
  })

  it("показывает бейджи упрощений прямо в строке", () => {
    expect(table(finishedEvents)).toContain("ответ сгенерирован по схеме")
  })

  it("держит развёрнутую часть закрытой, пока строку не открыли", () => {
    expect(table(finishedEvents)).not.toContain("отрисованный промт")
  })

  it("показывает шаги живого прогона, пока событий ещё мало", () => {
    const markup = table(startedEvents)
    expect(markup).toContain("load_hotels")
    expect(markup).toContain("идёт")
    expect(markup).toContain("ожидает")
  })

  it("честно сообщает, что шагов нет", () => {
    const markup = renderToStaticMarkup(
      <RunSteps view={foldRun([], "queued")} run={null} renders={{}} ir={null} />,
    )
    expect(markup).toContain("шагов ещё нет")
  })
})

describe("RunStepDetail", () => {
  it("для llm-узла показывает слоты, промт, сырой ответ, выход и проверки", () => {
    const markup = detail("render")
    for (const part of ["вход", "распарсенный выход", "отрисованный промт", "сырой ответ", "проверки"])
      expect(markup).toContain(part)
    expect(markup).toContain(PROMPT_TEXT.slice(0, 12))
    expect(markup).toContain("выход валиден по схеме Pitch")
  })

  it("для не-llm узла не рисует пустые блоки промта и ответа", () => {
    const markup = detail("pick")
    expect(markup).not.toContain("отрисованный промт")
    expect(markup).not.toContain("сырой ответ")
    expect(markup).not.toContain("проверки")
  })

  it("держит вход и выход рядом в одной сетке сравнения", () => {
    expect(detail("render")).toContain("lg:grid-cols-2")
  })

  it("показывает метрики шага и признаётся, когда их нет", () => {
    const markup = detail("pick")
    expect(markup).toContain("длительность")
    expect(markup).toContain("стоимость")
    expect(markup).toContain("исполнитель этого не сообщает")
  })

  it("перечисляет упрощения исполнителя полным текстом", () => {
    expect(detail("render")).toContain("промт собран заглушкой, компилятор промтов не подключён")
  })
})
