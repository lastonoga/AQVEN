import { describe, expect, it } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import { foldRun } from "../run/events.js"
import { RunStream } from "./RunStream.js"
import { buildSteps } from "./run-steps.js"
import { columnsOf } from "./run-table.js"
import { finishedEvents, rendersFixture, runFixture, startedEvents } from "./run-steps.fixture.js"
import type { RunEvent } from "../api/index.js"

const table = (events: readonly RunEvent[], selected: string | null = null): string =>
  renderToStaticMarkup(
    <RunStream view={foldRun(events, "ok")} run={runFixture} renders={rendersFixture} ir={null} selectedId={selected} />,
  )

describe("лента прогона", () => {
  it("даёт строку на каждый шаг", () => {
    const markup = table(finishedEvents)
    for (const nodeId of ["load_hotels", "pick", "render"]) expect(markup).toContain(nodeId)
  })

  it("у каждого шага видно, когда он начался и сколько шёл", () => {
    const markup = table(finishedEvents)
    expect(markup).toMatch(/\+\d+ мс|\+\d+\.\d+ с/)
    expect(markup).toMatch(/\d+ мс|\d+\.\d+ с/)
  })

  it("показывает вход, промт и выход без единого клика", () => {
    const markup = table(finishedEvents)
    expect(markup).toContain("вход")
    expect(markup).toContain("промт")
    expect(markup).toContain("выход")
  })

  it("даёт переключатель плотности вместо раскрытия каждой строки", () => {
    const markup = table(finishedEvents)
    for (const label of ["плотно", "обычно", "полно"]) expect(markup).toContain(label)
  })

  it("показывает легенду сигналов с числом задетых шагов", () => {
    expect(table(finishedEvents)).toContain("заглушка исполнителя")
  })

  it("не печатает метрики, которых исполнитель не прислал", () => {
    const steps = buildSteps(foldRun(finishedEvents, "ok"), rendersFixture)
    const columns = columnsOf(steps)
    const markup = table(finishedEvents)
    expect(markup.includes("токенов")).toBe(columns.has("tokens"))
  })

  it("показывает живой прогон, пока событий ещё мало", () => {
    const markup = table(startedEvents)
    expect(markup).toContain("load_hotels")
    expect(markup).toContain("идёт")
  })

  it("честно сообщает, что шагов нет", () => {
    const markup = renderToStaticMarkup(
      <RunStream view={foldRun([], "queued")} run={null} renders={{}} ir={null} selectedId={null} />,
    )
    expect(markup).toContain("шагов ещё нет")
  })
})
