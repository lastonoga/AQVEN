import { describe, expect, it } from "vitest"
import { testIr } from "./fixture.js"
import { parseRef } from "./parse.js"
import { resolveStatic } from "./static.js"
import type { Ref } from "./types.js"

const refOf = (text: string): Ref => {
  const parsed = parseRef(text)
  if (!parsed.ok) throw new Error(parsed.error.message)
  return parsed.ref
}

const originOf = (text: string, context = {}) => {
  const result = resolveStatic(refOf(text), testIr, context)
  if (!result.ok) throw new Error(result.error.message)
  return result.origin
}

describe("resolveStatic: узлы", () => {
  it("узел, его вид, тип выхода и описание", () => {
    const origin = originOf("$load_hotels.out")
    expect(origin.nodeId).toBe("load_hotels")
    expect(origin.nodeKind).toBe("tool")
    expect(origin.rootType).toBe("Hotel[]")
    expect(origin.type).toBe("Hotel[]")
    expect(origin.description).toBe("загрузка отелей")
    expect(origin.label).toBe("узел load_hotels")
  })

  it("поле внутри выхода добавляется к типу", () => {
    expect(originOf("$pick.out.best").type).toBe("Choice.best")
  })

  it("подъём массива снимает [] с типа", () => {
    const origin = originOf("$load_hotels.out[*].id")
    expect(origin.type).toBe("Hotel.id")
    expect(origin.path).toBe("out[*].id")
  })

  it("числовой индекс тоже снимает []", () => {
    expect(originOf("$load_hotels.out[0].id").type).toBe("Hotel.id")
  })

  it("узел без объявленного типа выхода", () => {
    const origin = originOf("$triage.out")
    expect(origin.rootType).toBe("Score[]")
    expect(origin.nodeKind).toBe("map")
  })
})

describe("resolveStatic: не-узловые корни", () => {
  it("вход воркфлоу берёт входной тип", () => {
    const origin = originOf("$input.locale")
    expect(origin.root).toBe("input")
    expect(origin.rootType).toBe("Request")
    expect(origin.type).toBe("Request.locale")
    expect(origin.label).toBe("вход воркфлоу")
  })

  it("$item берёт itemType владеющего map", () => {
    const origin = originOf("$item", { nodeId: "triage" })
    expect(origin.root).toBe("item")
    expect(origin.rootType).toBe("Hotel")
    expect(origin.nodeId).toBe("triage")
    expect(origin.description).toContain("triage")
  })

  it("$item без контекста не падает", () => {
    const origin = originOf("$item")
    expect(origin.rootType).toBe("")
    expect(origin.label).toBe("элемент коллекции")
  })

  it("$iter описывает состояние итерации", () => {
    const origin = originOf("$iter.clean", { nodeId: "polish" })
    expect(origin.root).toBe("iter")
    expect(origin.type).toBe("clean")
    expect(origin.nodeId).toBe("polish")
  })
})

describe("resolveStatic: ошибки", () => {
  it("неизвестный узел даёт ошибку, а не исключение", () => {
    const result = resolveStatic(refOf("$missing.out"), testIr)
    expect(result.ok).toBe(false)
    expect(result.ok === false && result.error.code).toBe("unknown_node")
    expect(result.ok === false && result.error.message).toContain("missing")
  })

  it("узел компонента виден только в своей области", () => {
    expect(resolveStatic(refOf("$cheap.out"), testIr).ok).toBe(false)
    const scoped = resolveStatic(refOf("$cheap.out"), testIr, { component: "ticket_cascade" })
    expect(scoped.ok).toBe(true)
    expect(scoped.ok && scoped.origin.rootType).toBe("Answer")
  })
})

describe("resolveStatic: параметр компонента", () => {
  it("голая ссылка без хвоста объясняется как параметр, а не как потерянный узел", () => {
    const result = resolveStatic(refOf("$generator"), testIr)
    expect(result.ok).toBe(false)
    expect(result.ok === false && result.error.message).toContain("параметр компонента")
  })
})
