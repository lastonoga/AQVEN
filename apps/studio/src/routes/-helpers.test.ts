import { describe, expect, it, vi } from "vitest"
import { loadWhen } from "./-load"
import { optional } from "./-search"

describe("optional", () => {
  it("omits the key when the value is undefined", () => {
    expect(optional("node", undefined)).toStrictEqual({})
  })

  it("keeps falsy defined values", () => {
    expect(optional("stage", 0)).toStrictEqual({ stage: 0 })
  })
})

describe("loadWhen", () => {
  it("resolves null without loading for a missing id", async () => {
    const load = vi.fn((id: string) => Promise.resolve(id))
    await expect(loadWhen(null, load)).resolves.toBeNull()
    await expect(loadWhen(undefined, load)).resolves.toBeNull()
    expect(load).not.toHaveBeenCalled()
  })

  it("loads a present id", async () => {
    await expect(loadWhen("8247", (id) => Promise.resolve(`run ${id}`))).resolves.toBe("run 8247")
  })
})
