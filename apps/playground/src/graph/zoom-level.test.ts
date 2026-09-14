import { describe, expect, test } from "vitest"
import { DEFAULT_LEVEL, levelOf, packLevels, stepLevel, unpackLevels } from "./zoom-level.js"
import type { ZoomLevel } from "./zoom-level.js"

describe("уровни семантического зума", () => {
  test("масштаб задаёт уровень при движении вверх", () => {
    expect(levelOf(0.3, 0)).toBe(0)
    expect(levelOf(0.5, 0)).toBe(1)
    expect(levelOf(1.0, 0)).toBe(2)
    expect(levelOf(1.5, 0)).toBe(3)
  })

  test("гистерезис: уровень держится в зазоре между порогами", () => {
    expect(levelOf(0.75, 2)).toBe(2)
    expect(levelOf(0.75, 1)).toBe(1)
  })

  test("уровень падает только ниже порога выхода", () => {
    expect(levelOf(0.73, 2)).toBe(2)
    expect(levelOf(0.71, 2)).toBe(1)
    expect(levelOf(1.2, 3)).toBe(3)
    expect(levelOf(1.17, 3)).toBe(2)
  })

  test("уровень растёт только выше порога входа", () => {
    expect(levelOf(0.79, 1)).toBe(1)
    expect(levelOf(0.81, 1)).toBe(2)
  })

  test("перебор колеса не даёт дребезга на границе", () => {
    const ticks = [0.8, 0.78, 0.76, 0.74, 0.73, 0.75, 0.79, 0.82]
    const seen = ticks.reduce<ZoomLevel[]>((chain, zoom) => {
      const previous = chain[chain.length - 1] ?? DEFAULT_LEVEL
      return [...chain, levelOf(zoom, previous)]
    }, [])
    expect(seen).toEqual([2, 2, 2, 2, 2, 2, 2, 2])
  })

  test("порог выхода всегда мягче порога входа", () => {
    for (const zoom of [0.2, 0.4, 0.45, 0.75, 0.85, 1.25, 1.4]) {
      const { up, down } = unpackLevels(packLevels(zoom))
      expect(down).toBeGreaterThanOrEqual(up)
    }
  })

  test("шаг уровня поднимает по входу и опускает по выходу", () => {
    expect(stepLevel(3, 3, 1)).toBe(3)
    expect(stepLevel(1, 2, 1)).toBe(1)
    expect(stepLevel(1, 2, 2)).toBe(2)
    expect(stepLevel(0, 1, 2)).toBe(1)
    expect(stepLevel(0, 0, 2)).toBe(0)
  })
})
