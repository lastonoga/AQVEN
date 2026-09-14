import { MarkerType } from "@xyflow/react"
import { describe, expect, test } from "vitest"
import { edgeLegend, edgeVariant, toFlowEdge } from "./edges.js"
import { IN_PORT, OUT_PORT, slotPort } from "./ports.js"
import type { ExpandedEdge } from "./expand.js"

const edgeOf = (patch: Partial<ExpandedEdge>): ExpandedEdge => ({
  id: "a=>b",
  source: "a",
  target: "b",
  kind: "data",
  label: "",
  ...patch,
})

describe("вид ребра", () => {
  test("поток данных идёт ортогональным типом и штатными портами", () => {
    const edge = toFlowEdge(edgeOf({}))
    expect(edge.type).toBe("ortho")
    expect(edge.sourceHandle).toBe(OUT_PORT)
    expect(edge.targetHandle).toBe(IN_PORT)
  })

  test("слот ребра целится в именованный порт", () => {
    expect(toFlowEdge({ ...edgeOf({}), slot: "draft" }).targetHandle).toBe(slotPort("draft"))
  })

  test("подписанная ветка рисуется подписью у источника", () => {
    expect(toFlowEdge(edgeOf({ kind: "branch", label: "best_of" })).type).toBe("branch")
    expect(toFlowEdge(edgeOf({ kind: "fanout", label: "vote" })).type).toBe("branch")
    expect(toFlowEdge(edgeOf({ kind: "fanout", label: "" })).type).toBe("ortho")
  })

  test("обратное ребро цикла отличается от входа в цикл", () => {
    const entry = edgeOf({ id: "l/split=>l/body", source: "l/split", target: "l/body", kind: "loop" })
    const back = edgeOf({ id: "l/join=>l/split", source: "l/join", target: "l/split", kind: "loop" })
    expect(edgeVariant(entry)).toBe("loop")
    expect(edgeVariant(back)).toBe("loopback")
    expect(toFlowEdge(entry).style?.strokeDasharray).not.toBe(toFlowEdge(back).style?.strokeDasharray)
  })

  test("явный вид перекрывает выведенный", () => {
    expect(edgeVariant({ ...edgeOf({}), variant: "boundary" })).toBe("boundary")
    expect(toFlowEdge({ ...edgeOf({}), variant: "boundary" }).data?.title).toBe("граница компонента")
  })

  test("у каждого вида свой штрих и маркер его цвета", () => {
    const signatures = edgeLegend.map(
      (look) => `${look.color}|${look.dash ?? ""}|${look.width}|${look.animated}`,
    )
    expect(new Set(signatures).size).toBe(edgeLegend.length)
    for (const look of edgeLegend) {
      const edge = toFlowEdge({ ...edgeOf({}), variant: look.kind })
      expect(look.title).not.toBe("")
      expect(edge.style?.stroke).toBe(look.color)
      expect(edge.markerEnd).toEqual({
        type: MarkerType.ArrowClosed,
        width: 16,
        height: 16,
        color: look.color,
      })
    }
  })

  test("маршрут раскладки попадает в данные ребра", () => {
    const points = [{ x: 1, y: 2 }]
    expect(toFlowEdge({ ...edgeOf({}), points }).data?.points).toEqual(points)
    expect(toFlowEdge(edgeOf({})).data?.points).toEqual([])
  })
})
