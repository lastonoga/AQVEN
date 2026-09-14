import { describe, expect, it } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import { foldRun } from "../run/events.js"
import { RunTable } from "./RunTable.js"
import { buildSteps } from "./run-steps.js"
import { columnsOf } from "./run-table.js"
import { finishedEvents, rendersFixture, runFixture, startedEvents } from "./run-steps.fixture.js"
import type { RunEvent } from "../api/index.js"

const table = (events: readonly RunEvent[], selected: string | null = null): string =>
  renderToStaticMarkup(
    <RunTable view={foldRun(events, "ok")} run={runFixture} renders={rendersFixture} selectedId={selected} />,
  )

describe("таблица прогона", () => {
  it("даёт строку на каждый шаг", () => {
    const markup = table(finishedEvents)
    for (const nodeId of ["load_hotels", "pick", "render"]) expect(markup).toContain(nodeId)
  })

  it("показывает шкалу времени вместо отдельного экрана таймлайна", () => {
    const markup = table(finishedEvents)
    expect(markup).toContain("width:")
    expect(markup).toContain("left:")
  })

  it("не требует раскрывать строку, чтобы увидеть вход и выход", () => {
    const markup = table(finishedEvents)
    expect(markup).toContain("вход")
    expect(markup).toContain("выход")
    expect(markup).not.toContain("отрисованный промт")
  })

  it("показывает легенду сигналов с числом задетых шагов", () => {
    expect(table(finishedEvents)).toContain("заглушка исполнителя")
  })

  it("прячет колонки, под которые исполнитель ничего не пишет", () => {
    const steps = buildSteps(foldRun(finishedEvents, "ok"), rendersFixture)
    const columns = columnsOf(steps)
    const markup = table(finishedEvents)
    expect(markup.includes(">ткн<")).toBe(columns.has("tokens"))
    expect(markup.includes(">$<")).toBe(columns.has("cost"))
  })

  it("показывает живой прогон, пока событий ещё мало", () => {
    const markup = table(startedEvents)
    expect(markup).toContain("load_hotels")
    expect(markup).toContain("animate-pulse")
  })

  it("подсвечивает выбранный шаг", () => {
    expect(table(finishedEvents, "pick")).toContain("bg-slate-800/60")
  })

  it("честно сообщает, что шагов нет", () => {
    const markup = renderToStaticMarkup(
      <RunTable view={foldRun([], "queued")} run={null} renders={{}} selectedId={null} />,
    )
    expect(markup).toContain("шагов ещё нет")
  })
})
