import { describe, expect, it } from "vitest"
import { LIVE_REFS } from "./live-refs.fixture.js"
import { parseRef, parseSlot } from "./parse.js"

const refOf = (text: string) => {
  const parsed = parseRef(text)
  if (!parsed.ok) throw new Error(`${text}: ${parsed.error.message}`)
  return parsed.ref
}

describe("parseRef: корни", () => {
  it("узел с полем out", () => {
    const ref = refOf("$load_hotels.out")
    expect(ref.root).toBe("node")
    expect(ref.node).toBe("load_hotels")
    expect(ref.segments).toEqual([{ kind: "field", name: "out" }])
    expect(ref.path).toBe("out")
  })

  it("вход воркфлоу", () => {
    const ref = refOf("$input.locale")
    expect(ref.root).toBe("input")
    expect(ref.node).toBe("")
    expect(ref.path).toBe("locale")
  })

  it("сокращение $in считается входом", () => {
    expect(refOf("$in.order").root).toBe("input")
  })

  it("элемент коллекции без хвоста", () => {
    const ref = refOf("$item")
    expect(ref.root).toBe("item")
    expect(ref.segments).toEqual([])
    expect(ref.path).toBe("")
  })

  it("аккумулятор и итерация", () => {
    expect(refOf("$acc").root).toBe("acc")
    expect(refOf("$iter.clean").root).toBe("iter")
  })
})

describe("parseRef: сегменты", () => {
  it("вложенные поля", () => {
    const ref = refOf("$iter.critique.meetsThreshold")
    expect(ref.segments).toEqual([
      { kind: "field", name: "critique" },
      { kind: "field", name: "meetsThreshold" },
    ])
    expect(ref.path).toBe("critique.meetsThreshold")
  })

  it("подъём массива", () => {
    const ref = refOf("$load_hotels.out[*].id")
    expect(ref.lifted).toBe(true)
    expect(ref.segments).toEqual([
      { kind: "field", name: "out" },
      { kind: "lift" },
      { kind: "field", name: "id" },
    ])
    expect(ref.path).toBe("out[*].id")
  })

  it("подъём в середине пути входа", () => {
    const ref = refOf("$input.order.items[*].id")
    expect(ref.lifted).toBe(true)
    expect(ref.path).toBe("order.items[*].id")
  })

  it("числовой индекс", () => {
    const ref = refOf("$load_hotels.out[1].id")
    expect(ref.lifted).toBe(false)
    expect(ref.segments[1]).toEqual({ kind: "index", index: 1 })
  })

  it("ссылка без хвоста не поднимает массив", () => {
    expect(refOf("$triage.out").lifted).toBe(false)
  })
})

describe("parseRef: ошибки вместо исключений", () => {
  it("строка без доллара", () => {
    const parsed = parseRef("load_hotels.out")
    expect(parsed.ok).toBe(false)
    expect(parsed.ok === false && parsed.error.code).toBe("not_a_ref")
  })

  it("пустая строка", () => {
    expect(parseRef("").ok).toBe(false)
  })

  it("только доллар", () => {
    const parsed = parseRef("$")
    expect(parsed.ok === false && parsed.error.code).toBe("empty_root")
  })

  it("мусор в хвосте", () => {
    const parsed = parseRef("$node.out..id")
    expect(parsed.ok === false && parsed.error.code).toBe("bad_segment")
  })

  it("незакрытая скобка", () => {
    expect(parseRef("$node.out[*").ok).toBe(false)
  })
})

describe("parseRef: живая грамматика IR", () => {
  it("разбирает все ссылки из examples/patterns", () => {
    const broken = LIVE_REFS.filter((text) => !parseRef(text).ok)
    expect(broken).toEqual([])
    expect(LIVE_REFS.length).toBeGreaterThan(100)
  })

  it("ссылка на узел с хвостом всегда начинается с out", () => {
    const nodeRefs = LIVE_REFS.map(refOf).filter((ref) => ref.root === "node")
    const withTail = nodeRefs.filter((ref) => ref.segments.length > 0)
    const heads = new Set(withTail.map((ref) => JSON.stringify(ref.segments[0])))
    expect([...heads]).toEqual([JSON.stringify({ kind: "field", name: "out" })])
    expect(withTail.length).toBeGreaterThan(90)
  })

  it("голая ссылка без хвоста — это параметр компонента, а не узел", () => {
    const bare = LIVE_REFS.map(refOf).filter((ref) => ref.root === "node" && ref.segments.length === 0)
    expect(bare.map((ref) => ref.text).sort()).toEqual(["$generator", "$score"])
  })
})

describe("parseSlot", () => {
  it("строковая ссылка", () => {
    const slot = parseSlot("$pick.out.best")
    expect(slot.kind).toBe("ref")
  })

  it("константа", () => {
    expect(parseSlot({ const: 3 })).toEqual({ kind: "const", value: 3 })
  })

  it("объектная форма узла разворачивается в $node.out", () => {
    const slot = parseSlot({ node: "pick" })
    expect(slot.kind === "ref" && slot.ref.text).toBe("$pick.out")
  })

  it("простой литерал", () => {
    expect(parseSlot("просто текст")).toEqual({ kind: "inline", value: "просто текст" })
  })

  it("сломанная ссылка не кидает исключение", () => {
    const slot = parseSlot("$")
    expect(slot.kind).toBe("broken")
  })
})
