import { describe, expect, it } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import { registerRunPanel, runPanelOf } from "./slots.js"
import type { RunPanelProps } from "./slots.js"
import type { Ir, Render } from "../api/index.js"
import type { RunSelection } from "../run-context.js"
import type { RunNodeView, RunView } from "../run/events.js"

const ir: Ir = {
  flow: "demo",
  version: 1,
  input: "Request",
  output: { type: "Brief", from: "$brief.out" },
  components: {},
  nodes: { brief: { kind: "llm" } },
}

const node = (nodeId: string, input: unknown, output: unknown): RunNodeView => ({
  nodeId,
  kind: "llm",
  description: null,
  status: "ok",
  order: 0,
  startedAt: 0,
  endedAt: 10,
  durationMs: 10,
  progress: null,
  simplifications: [],
  slots: null,
  input,
  output,
  outputType: "Brief",
  error: null,
  events: [],
})

const view = (nodes: RunNodeView[]): RunView => ({
  status: "ok",
  startedAt: 0,
  endedAt: 10,
  durationMs: 10,
  nodes,
  simplifications: [],
  input: { topic: "отели" },
  output: null,
  outputType: null,
  error: null,
  unrecognized: [],
})

const render = (nodeId: string, prompt: string): Render => ({
  runId: "r1",
  nodeId,
  input: { topic: "отели" },
  output: { title: "Рынок отелей" },
  prompt,
})

const selectionOf = (nodes: RunNodeView[], renders: Record<string, Render>): RunSelection => ({
  runId: "r1",
  run: null,
  view: view(nodes),
  nodes: new Map(nodes.map((item) => [item.nodeId, item])),
  renders,
  loading: false,
  error: null,
})

const propsOf = (nodeId: string | null): RunPanelProps => ({
  ir,
  selection: selectionOf([node("brief", { topic: "отели" }, { title: "Рынок отелей" })], {
    brief: render("brief", "составь сводку про отели"),
  }),
  nodeId,
  onSelectNode: () => undefined,
})

const markupOf = (slot: "steps" | "detail" | "compare", nodeId: string | null): string => {
  const Panel = runPanelOf(slot).Component
  return renderToStaticMarkup(<Panel {...propsOf(nodeId)} />)
}

describe("панели режима прогона", () => {
  it("таблица шагов показывает вход, промт и выход", () => {
    const html = markupOf("steps", null)
    expect(html).toContain("brief")
    expect(html).toContain("составь сводку про отели")
    expect(html).toContain("Рынок отелей")
  })

  it("детали шага просят выбрать узел, пока он не выбран", () => {
    expect(markupOf("detail", null)).toContain("выберите шаг")
  })

  it("детали шага показывают промт выбранного узла", () => {
    expect(markupOf("detail", "brief")).toContain("составь сводку про отели")
  })

  it("сравнение веток по умолчанию не подключено", () => {
    expect(runPanelOf("compare").appliesTo(propsOf("brief"))).toBe(false)
  })

  it("панель подменяется через реестр", () => {
    const original = runPanelOf("compare")
    registerRunPanel("compare", {
      title: "ветки",
      Component: () => <p>таблица веток</p>,
      appliesTo: () => true,
    })
    expect(markupOf("compare", "brief")).toContain("таблица веток")
    expect(runPanelOf("compare").appliesTo(propsOf("brief"))).toBe(true)
    registerRunPanel("compare", original)
    expect(runPanelOf("compare").appliesTo(propsOf("brief"))).toBe(false)
  })
})
