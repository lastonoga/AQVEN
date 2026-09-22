import { afterEach, expect, it, vi } from "vitest"

afterEach(() => {
  vi.unstubAllEnvs()
  vi.useRealTimers()
})

it("uses the current time even when a fixture clock was configured", async () => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date("2030-01-02T03:04:05Z"))
  vi.stubEnv("VITE_FIXTURE_NOW", "2026-09-18T03:00:00Z")
  vi.resetModules()

  const { studioNow } = await import("./clock")

  expect(studioNow().toISOString()).toBe("2030-01-02T03:04:05.000Z")
})
