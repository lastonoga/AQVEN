import { describe, expect, it } from "vitest"
import { fanOf, fanRows, isFanNode } from "./fan-model.js"
import { emptyFacts, fanFacts, fanIr, fanNodes } from "./fan.fixture.js"
import type { FanModel } from "./fan-model.js"

const bodyOf = (nodeId: string) => {
  const body = fanNodes[nodeId]
  if (body === undefined) throw new Error(`нет узла ${nodeId}`)
  return body
}

const modelFor = (nodeId: string, picked?: readonly number[]): FanModel => {
  const model = fanOf({ nodeId, body: bodyOf(nodeId), ir: fanIr, facts: fanFacts, picked })
  if (model === null) throw new Error(`узел ${nodeId} не веер`)
  return model
}

const rowIds = (model: FanModel): string[] => fanRows(model).map((row) => row.id)

describe("isFanNode", () => {
  it("узнаёт parallel, map и дивергентный call", () => {
    expect(isFanNode(bodyOf("opinions"))).toBe(true)
    expect(isFanNode(bodyOf("solutions"))).toBe(true)
    expect(isFanNode(bodyOf("drafts"))).toBe(true)
  })

  it("обычный узел веером не считает", () => {
    expect(isFanNode(bodyOf("opinion_openai"))).toBe(false)
    expect(isFanNode({ kind: "call", component: "judge", in: {} })).toBe(false)
    expect(isFanNode(null)).toBe(false)
  })
})

describe("веер parallel", () => {
  const model = modelFor("opinions")

  it("колонка на ветку с узлом-источником", () => {
    expect(model.kind).toBe("parallel")
    expect(model.branches.map((branch) => branch.label)).toEqual(["openai", "anthropic"])
    expect(model.branches.map((branch) => branch.nodeId)).toEqual(["opinion_openai", "opinion_anthropic"])
  })

  it("одинаковый вход показан один раз и не повторяется в колонках", () => {
    expect(model.sharedInput?.value).toEqual({ brief: { topic: "рынок" } })
    expect(rowIds(model)).not.toContain("input")
  })

  it("различия веток становятся строками, совпадения уходят в общее", () => {
    expect(rowIds(model)).toContain("axis:modelRole")
    expect(rowIds(model)).toContain("axis:temperature")
    expect(rowIds(model)).not.toContain("axis:fn")
    expect(model.common.map((fact) => fact.value)).toContain("write_opinion")
  })

  it("срезы выхода, времени, стоимости и статуса идут после различий", () => {
    expect(rowIds(model).slice(-4)).toEqual(["output", "duration", "cost", "status"])
  })

  it("берёт статус, время и ошибку ветки из прогона", () => {
    const [first, second] = model.branches
    expect(first?.output.value).toEqual({ stance: "buy", thesis: "брать" })
    expect(first?.durationMs).toBe(640)
    expect(second?.status).toBe("error")
    expect(second?.error).toBe("ветка не ответила")
  })

  it("промты веток различаются — срез промта остаётся в таблице", () => {
    expect(model.sharedPrompt).toBeNull()
    expect(rowIds(model)).toContain("prompt")
  })
})

describe("веер map", () => {
  const model = modelFor("solutions")

  it("показывает первые колонки и знает общее число итераций", () => {
    expect(model.total).toBe(5)
    expect(model.picked).toEqual([0, 1, 2, 3])
    expect(model.branches.map((branch) => branch.label)).toEqual([
      "итерация 1",
      "итерация 2",
      "итерация 3",
      "итерация 4",
    ])
  })

  it("даёт выбрать конкретную итерацию", () => {
    const picked = modelFor("solutions", [4])
    expect(picked.branches.map((branch) => branch.index)).toEqual([4])
    expect(picked.branches[0]?.output.value).toEqual({ answer: "решение 5" })
  })

  it("вход итерации собран резолвером ссылок из $item и $input", () => {
    expect(model.branches[0]?.input.value).toEqual({
      problem: { question: "куда вложить" },
      overrides: { seed: 11 },
    })
  })

  it("ось различия итераций берётся из элемента", () => {
    expect(model.branches.map((branch) => branch.axes["seed"])).toEqual(["11", "22", "33", "44"])
    expect(rowIds(model)).toContain("axis:seed")
  })

  it("время итерации считается по событиям прогресса", () => {
    expect(model.branches[0]?.durationMs).toBe(100)
    expect(model.branches[1]?.durationMs).toBe(200)
  })

  it("промта по итерации нет — срез скрыт, причина названа", () => {
    expect(rowIds(model)).not.toContain("prompt")
    expect(model.notes.join(" ")).toContain("промт")
  })
})

describe("веер diverge", () => {
  const model = modelFor("drafts")

  it("строит колонки по оси vary", () => {
    expect(model.kind).toBe("diverge")
    expect(model.branches).toHaveLength(4)
    expect(model.branches.map((branch) => branch.label)).toEqual([
      "Персона analyst",
      "Персона marketer",
      "Персона engineer",
      "Персона support_lead",
    ])
  })

  it("выход ветки — элемент массива выхода узла", () => {
    expect(model.branches.map((branch) => branch.output.value)).toEqual([
      { ideas: 1 },
      { ideas: 2 },
      { ideas: 3 },
      { ideas: 4 },
    ])
  })

  it("общий вход и общий промт вынесены наверх", () => {
    expect(model.sharedInput?.known).toBe(true)
    expect(model.sharedPrompt).toBe("общий промт дивергенции")
    expect(rowIds(model)).toEqual(["axis:persona", "output", "duration", "cost", "status"])
  })

  it("параметры вызова попадают в общее", () => {
    const facts = model.common.map((fact) => `${fact.label}=${fact.value}`)
    expect(facts).toContain("Компонент=diverge")
    expect(facts).toContain("Генератор=idea_set")
    expect(facts).toContain("Видимость=изолированная")
  })
})

describe("веер без прогона", () => {
  it("строит колонки и различия по одной схеме", () => {
    const model = fanOf({ nodeId: "opinions", body: bodyOf("opinions"), ir: fanIr, facts: emptyFacts })
    if (model === null) throw new Error("веер не собран")
    expect(model.branches).toHaveLength(2)
    expect(model.branches.every((branch) => !branch.output.known)).toBe(true)
    expect(rowIds(model)).toContain("axis:temperature")
  })
})
