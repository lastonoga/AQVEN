import { describe, expect, it } from "vitest"
import { testIr, testRun } from "./fixture.js"
import { parseRef } from "./parse.js"
import { resolveValue } from "./value.js"
import type { Ref, RefContext, RunSnapshot } from "./types.js"

const refOf = (text: string): Ref => {
  const parsed = parseRef(text)
  if (!parsed.ok) throw new Error(parsed.error.message)
  return parsed.ref
}

const valueOf = (text: string, context: RefContext = {}, run: RunSnapshot | null = testRun) => {
  const result = resolveValue(refOf(text), testIr, run, context)
  if (!result.ok) throw new Error(`${text}: ${result.error.message}`)
  return result.found
}

const errorOf = (text: string, context: RefContext = {}, run: RunSnapshot | null = testRun) => {
  const result = resolveValue(refOf(text), testIr, run, context)
  if (result.ok) throw new Error(`${text}: ожидалась ошибка`)
  return result.error
}

describe("resolveValue: выходы узлов", () => {
  it("весь выход узла", () => {
    const found = valueOf("$load_hotels.out")
    expect(found.value).toEqual([
      { id: "h1", name: "Азимут", price: 5000 },
      { id: "h2", name: "Бриз", price: 7000 },
    ])
    expect(found.nodeId).toBe("load_hotels")
    expect(found.scope).toBe("single")
  })

  it("вложенное поле выхода", () => {
    expect(valueOf("$pick.out.best").value).toEqual({ id: "h2", name: "Бриз" })
    expect(valueOf("$pick.out.best.name").value).toBe("Бриз")
  })

  it("подъём массива собирает поле со всех элементов", () => {
    const found = valueOf("$load_hotels.out[*].id")
    expect(found.value).toEqual(["h1", "h2"])
    expect(found.lifted).toBe(true)
  })

  it("поле по массиву без [*] тоже расходится по элементам", () => {
    expect(valueOf("$load_hotels.out.name").value).toEqual(["Азимут", "Бриз"])
  })

  it("числовой индекс берёт один элемент", () => {
    expect(valueOf("$load_hotels.out[1].name").value).toBe("Бриз")
  })

  it("значение null — это значение, а не отсутствие", () => {
    const found = valueOf("$pick.out.runnerUp")
    expect(found.value).toBeNull()
  })
})

describe("resolveValue: вход воркфлоу", () => {
  it("поле входа", () => {
    expect(valueOf("$input.locale").value).toBe("ru")
  })

  it("весь вход", () => {
    expect(valueOf("$input").value).toEqual({ locale: "ru", topic: "море" })
  })
})

describe("resolveValue: $item внутри map", () => {
  it("без номера итерации отдаёт список по итерациям", () => {
    const found = valueOf("$item", { nodeId: "triage" })
    expect(found.scope).toBe("iterations")
    expect(found.value).toEqual([
      { id: "h1", name: "Азимут", price: 5000 },
      { id: "h2", name: "Бриз", price: 7000 },
    ])
  })

  it("поле по списку итераций расходится по элементам", () => {
    expect(valueOf("$item.name", { nodeId: "triage" }).value).toEqual(["Азимут", "Бриз"])
  })

  it("с номером итерации отдаёт одно значение", () => {
    const found = valueOf("$item", { nodeId: "triage", index: 1 })
    expect(found.scope).toBe("single")
    expect(found.value).toEqual({ id: "h2", name: "Бриз", price: 7000 })
  })

  it("список ограничен числом реально выполненных итераций", () => {
    const partial: RunSnapshot = {
      input: testRun.input,
      renders: { ...testRun.renders, triage: { input: {}, output: [{ score: 0.7 }] } },
    }
    expect(valueOf("$item", { nodeId: "triage" }, partial).value).toEqual([
      { id: "h1", name: "Азимут", price: 5000 },
    ])
  })

  it("номер за пределами прогона даёт ошибку", () => {
    expect(errorOf("$item", { nodeId: "triage", index: 7 }).code).toBe("no_iteration")
  })

  it("без контекста map неизвестен", () => {
    expect(errorOf("$item").code).toBe("no_iteration")
  })
})

describe("resolveValue: крайние случаи", () => {
  it("прогон не открыт", () => {
    expect(errorOf("$load_hotels.out", {}, null).code).toBe("no_run")
  })

  it("узел не исполнялся в этом прогоне", () => {
    expect(errorOf("$render.out").code).toBe("no_render")
  })

  it("несуществующий узел", () => {
    expect(errorOf("$missing.out").code).toBe("unknown_node")
  })

  it("путь в никуда", () => {
    const error = errorOf("$pick.out.best.rating")
    expect(error.code).toBe("no_value")
    expect(error.message).toContain("$pick.out.best.rating")
  })

  it("подъём по пустому массиву даёт пустой массив, а не ошибку", () => {
    const empty: RunSnapshot = {
      input: testRun.input,
      renders: { ...testRun.renders, load_hotels: { input: {}, output: [] } },
    }
    expect(valueOf("$load_hotels.out[*].id", {}, empty).value).toEqual([])
  })

  it("подъём по не-массиву даёт пустой массив", () => {
    const scalar: RunSnapshot = {
      input: testRun.input,
      renders: { ...testRun.renders, load_hotels: { input: {}, output: 42 } },
    }
    expect(valueOf("$load_hotels.out[*].id", {}, scalar).value).toEqual([])
  })

  it("$iter и $acc в записи прогона недоступны", () => {
    expect(errorOf("$iter.clean", { nodeId: "polish" }).code).toBe("unsupported_root")
    expect(errorOf("$acc").code).toBe("unsupported_root")
  })
})
