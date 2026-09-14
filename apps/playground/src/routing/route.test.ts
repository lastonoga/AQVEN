import { describe, expect, it } from "vitest"
import { flowHref, flowModeHref, flowRunHref, parseRoute, runHref } from "./route.js"

describe("parseRoute", () => {
  it("читает схему без прогона", () => {
    expect(parseRoute("#/flow/hotel-pitch")).toEqual({
      name: "flow",
      id: "hotel-pitch",
      mode: "schema",
      runId: null,
    })
  })

  it("помнит прогон в режиме схемы", () => {
    expect(parseRoute("#/flow/hotel-pitch?run=r1")).toEqual({
      name: "flow",
      id: "hotel-pitch",
      mode: "schema",
      runId: "r1",
    })
  })

  it("читает режим прогона с прогоном", () => {
    expect(parseRoute("#/flow/hotel-pitch/run/r1")).toEqual({
      name: "flow",
      id: "hotel-pitch",
      mode: "run",
      runId: "r1",
    })
  })

  it("читает режим прогона без выбранного прогона", () => {
    expect(parseRoute("#/flow/hotel-pitch/run")).toEqual({
      name: "flow",
      id: "hotel-pitch",
      mode: "run",
      runId: null,
    })
  })

  it("берёт запомненный прогон из запроса в режиме прогона", () => {
    expect(parseRoute("#/flow/hotel-pitch/run?run=r9")).toEqual({
      name: "flow",
      id: "hotel-pitch",
      mode: "run",
      runId: "r9",
    })
  })

  it("декодирует идентификаторы", () => {
    expect(parseRoute("#/flow/a%2Fb/run/r%201")).toEqual({ name: "flow", id: "a/b", mode: "run", runId: "r 1" })
  })

  it("держит прежние маршруты", () => {
    expect(parseRoute("#/runs")).toEqual({ name: "runs" })
    expect(parseRoute("#/run/r1")).toEqual({ name: "run", runId: "r1" })
    expect(parseRoute("#/")).toEqual({ name: "list" })
    expect(parseRoute("")).toEqual({ name: "list" })
  })
})

describe("ссылки режимов", () => {
  it("строит обе ссылки", () => {
    expect(flowHref("f1")).toBe("#/flow/f1")
    expect(flowHref("f1", "r1")).toBe("#/flow/f1?run=r1")
    expect(flowRunHref("f1")).toBe("#/flow/f1/run")
    expect(flowRunHref("f1", "r1")).toBe("#/flow/f1/run/r1")
    expect(runHref("r1")).toBe("#/run/r1")
  })

  it("переключение режима сохраняет прогон", () => {
    expect(flowModeHref("run", "f1", "r1")).toBe("#/flow/f1/run/r1")
    expect(flowModeHref("schema", "f1", "r1")).toBe("#/flow/f1?run=r1")
  })

  it("ссылка и разбор согласованы", () => {
    const href = flowModeHref("run", "a/b", "r 1")
    expect(parseRoute(href)).toEqual({ name: "flow", id: "a/b", mode: "run", runId: "r 1" })
  })
})
