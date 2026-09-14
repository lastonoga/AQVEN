import { describe, expect, it } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import { foldRun } from "../run/events.js"
import { testIr, testRun } from "../refs/fixture.js"
import { RunStepDetail } from "./RunStepDetail.js"
import { buildSteps } from "./run-steps.js"
import { PROMPT_TEXT, finishedEvents, rendersFixture } from "./run-steps.fixture.js"
import type { RunStep } from "./run-steps.js"

const stepAt = (nodeId: string): RunStep => {
  const found = buildSteps(foldRun(finishedEvents, "ok"), rendersFixture).find((step) => step.nodeId === nodeId)
  if (found === undefined) throw new Error(`нет шага ${nodeId}`)
  return found
}

const detail = (nodeId: string): string =>
  renderToStaticMarkup(
    <RunStepDetail step={stepAt(nodeId)} ir={testIr} run={testRun} onSelectNode={() => undefined} />,
  )

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
