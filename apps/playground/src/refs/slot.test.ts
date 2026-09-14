import { describe, expect, it } from "vitest"
import { testIr, testRun } from "./fixture.js"
import { recordedOutput, recordedSlot, runSnapshot } from "./snapshot.js"
import { resolveSlot } from "./slot.js"

describe("resolveSlot: провенанс слота целиком", () => {
  it("ссылка на узел: источник, тип и фактическое значение", () => {
    const slot = resolveSlot("best", "$pick.out.best", testIr, testRun)
    expect(slot.kind).toBe("ref")
    expect(slot.origin?.nodeId).toBe("pick")
    expect(slot.origin?.type).toBe("Choice.best")
    expect(slot.value?.value).toEqual({ id: "h2", name: "Бриз" })
    expect(slot.valueError).toBeNull()
  })

  it("ссылка с подъёмом массива", () => {
    const slot = resolveSlot("ids", "$load_hotels.out[*].id", testIr, testRun)
    expect(slot.ref?.lifted).toBe(true)
    expect(slot.value?.value).toEqual(["h1", "h2"])
  })

  it("константа даёт значение без прогона", () => {
    const slot = resolveSlot("limit", { const: 3 }, testIr, null)
    expect(slot.kind).toBe("const")
    expect(slot.value?.value).toBe(3)
    expect(slot.origin?.label).toBe("константа")
  })

  it("без прогона источник известен, значения нет", () => {
    const slot = resolveSlot("best", "$pick.out.best", testIr, null)
    expect(slot.origin?.nodeId).toBe("pick")
    expect(slot.value).toBeNull()
    expect(slot.valueError?.code).toBe("no_run")
  })

  it("ссылка на несуществующий узел не кидает исключение", () => {
    const slot = resolveSlot("x", "$missing.out", testIr, testRun)
    expect(slot.origin).toBeNull()
    expect(slot.originError?.code).toBe("unknown_node")
  })

  it("$item внутри map", () => {
    const slot = resolveSlot("hotel", "$item", testIr, testRun, { nodeId: "triage", index: 0 })
    expect(slot.origin?.rootType).toBe("Hotel")
    expect(slot.value?.value).toEqual({ id: "h1", name: "Азимут", price: 5000 })
  })

  it("литерал остаётся литералом", () => {
    const slot = resolveSlot("tone", "дружелюбно", testIr, testRun)
    expect(slot.kind).toBe("inline")
    expect(slot.value?.value).toBe("дружелюбно")
  })
})

describe("снимок прогона", () => {
  it("runSnapshot переносит вход и renders", () => {
    const snapshot = runSnapshot({
      run: { id: "r1", flow: "f", input: { a: 1 }, status: "ok", startedAt: 0 },
      events: [],
      renders: { pick: { runId: "r1", nodeId: "pick", input: { s: 1 }, output: { best: 2 }, prompt: null } },
    })
    expect(snapshot?.input).toEqual({ a: 1 })
    expect(snapshot?.renders["pick"]?.output).toEqual({ best: 2 })
  })

  it("runSnapshot от null даёт null", () => {
    expect(runSnapshot(null)).toBeNull()
  })

  it("recordedSlot отдаёт записанный вход слота", () => {
    const recorded = recordedSlot(testRun, "pick", "scores")
    expect(recorded?.value).toEqual([{ score: 0.7 }, { score: 0.9 }])
    expect(recorded?.preview.truncated).toBe(false)
  })

  it("recordedSlot без такого слота", () => {
    expect(recordedSlot(testRun, "pick", "нет")).toBeNull()
    expect(recordedSlot(testRun, "render", "best")).toBeNull()
  })

  it("recordedOutput отдаёт записанный выход узла", () => {
    expect(recordedOutput(testRun, "triage")?.value).toEqual([{ score: 0.7 }, { score: 0.9 }])
    expect(recordedOutput(testRun, "render")).toBeNull()
  })
})
