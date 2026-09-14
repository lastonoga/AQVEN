import { describe, expect, it } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import { FanCompare } from "./FanCompare.js"
import { FanCompareTab, fanTabVisible } from "./FanCompareTab.js"
import { fanInput, fanIr, fanNodes, fanRenders, fanSelection } from "./fan.fixture.js"
import { RunSnapshotProvider } from "./run-context.js"
import { RunProvider } from "../run-context.js"
import type { IrNode } from "../api/index.js"

const bodyOf = (nodeId: string): IrNode => {
  const body = fanNodes[nodeId]
  if (body === undefined) throw new Error(`нет узла ${nodeId}`)
  return body
}

const markup = (nodeId: string): string =>
  renderToStaticMarkup(
    <RunProvider selection={fanSelection}>
      <FanCompare nodeId={nodeId} body={bodyOf(nodeId)} ir={fanIr} />
    </RunProvider>,
  )

const columns = (html: string): string => {
  const match = /grid-template-columns:([^"]+)"/.exec(html)
  return match?.[1] ?? ""
}

describe("FanCompare", () => {
  it("рисует таблицу веера parallel: колонки веток и строки срезов", () => {
    const html = markup("opinions")
    expect(html).toContain("параллельные ветки")
    expect(html).toContain("openai")
    expect(html).toContain("anthropic")
    expect(html).toContain("Выход")
    expect(html).toContain("Время")
    expect(html).toContain("Стоимость")
    expect(html).toContain("Статус")
  })

  it("одинаковый вход стоит над таблицей один раз", () => {
    const html = markup("opinions")
    expect(html).toContain("общее для всех веток")
    expect(html).toContain("вход · один на все")
    expect(html.match(/рынок/g)?.length).toBe(1)
  })

  it("в промтах подсвечен различающийся фрагмент, а не весь текст", () => {
    const html = markup("opinions")
    expect(html).toContain("bg-amber-950/60")
    expect(html).toContain(">0.9<")
    expect(html).toContain(">0.8<")
    expect(html).toContain("роль writer температура")
  })

  it("колонки одной ширины и выровнены по строкам", () => {
    expect(columns(markup("opinions"))).toContain("repeat(2,")
  })

  it("веер шире четырёх веток уходит в горизонтальную прокрутку", () => {
    const html = markup("drafts")
    expect(html).toContain("overflow-x-auto")
    expect(columns(html)).toContain("repeat(4,")
    expect(html).toContain("общий промт дивергенции")
  })

  it("для map показывает первые итерации и число остальных", () => {
    const html = markup("solutions")
    expect(html).toContain("итераций 5")
    expect(html).toContain("ещё 1")
    expect(html).toContain("итерация 4")
    expect(html).not.toContain("итерация 5")
  })

  it("узел без веера ничего не рисует", () => {
    const html = renderToStaticMarkup(
      <RunProvider selection={fanSelection}>
        <FanCompare nodeId="opinion_openai" body={bodyOf("opinion_openai")} ir={fanIr} />
      </RunProvider>,
    )
    expect(html).toBe("")
  })
})

describe("FanCompare в инспекторе", () => {
  const snapshotMarkup = (nodeId: string): string =>
    renderToStaticMarkup(
      <RunSnapshotProvider value={{ input: fanInput, renders: fanRenders }}>
        <FanCompareTab
          nodeId={nodeId}
          body={bodyOf(nodeId)}
          ir={fanIr}
          known={new Set(Object.keys(fanNodes))}
          step={1}
          total={Object.keys(fanNodes).length}
          run={{ input: fanInput, renders: fanRenders }}
          onSelectNode={() => undefined}
        />
      </RunSnapshotProvider>,
    )

  it("берёт значения из снимка прогона, когда контекста прогона нет", () => {
    const html = snapshotMarkup("opinions")
    expect(html).toContain("openai")
    expect(html).toContain("stance")
    expect(html).not.toContain("ожидает")
  })

  it("вкладка видна только для веерных узлов", () => {
    const context = {
      nodeId: "opinion_openai",
      body: bodyOf("opinion_openai"),
      ir: fanIr,
      known: new Set(Object.keys(fanNodes)),
      step: 1,
      total: 1,
      run: null,
      onSelectNode: () => undefined,
    }
    expect(fanTabVisible({ ...context, nodeId: "opinions", body: bodyOf("opinions") })).toBe(true)
    expect(fanTabVisible(context)).toBe(false)
  })
})
