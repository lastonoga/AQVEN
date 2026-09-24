import { afterEach, describe, expect, it, vi } from "vitest"
import type { ServerHealth, ServerSource, ServerStatus, StatusCheck } from "@/api/server"
import { isoDateTime } from "@/data/ids"
import { liveHealth, liveServerStatus } from "@/mocks/data/server"
import { createServerMonitor, HEALTH_EVERY_MS, PROBE_DEADLINE_MS, STATUS_EVERY_MS, type HealthSnapshot, type MonitorHost, type ServerSignal } from "./monitor"
import { linesOf, startCommand, summaryOf } from "./presenters"

type Reply<T> = () => Promise<T>

type ScriptedSource = ServerSource & {
  readonly answerHealth: (reply: Reply<ServerHealth>) => void
  readonly answerStatus: (reply: Reply<ServerStatus>) => void
  readonly calls: { health: number; status: number }
}

const NOW = new Date("2026-09-18T03:00:00Z")

const unreachable: Reply<never> = () => Promise.reject(new Error("connection refused"))

const scriptedSource = (): ScriptedSource => {
  let health: Reply<ServerHealth> = () => Promise.resolve(liveHealth)
  let status: Reply<ServerStatus> = () => Promise.resolve(liveServerStatus)
  const calls = { health: 0, status: 0 }
  return {
    calls,
    answerHealth: (reply) => {
      health = reply
    },
    answerStatus: (reply) => {
      status = reply
    },
    health: () => {
      calls.health += 1
      return health()
    },
    status: () => {
      calls.status += 1
      return status()
    },
  }
}

const manualHost = () => {
  const tasks = new Map<number, () => void>()
  const events = new Map<string, () => void>()
  const host: MonitorHost = {
    every: (ms, task) => {
      tasks.set(ms, task)
      return () => {
        tasks.delete(ms)
      }
    },
    on: (event, task) => {
      events.set(event, task)
      return () => {
        events.delete(event)
      }
    },
    now: () => NOW,
  }
  return {
    host,
    tick: (ms: number) => {
      tasks.get(ms)?.()
    },
    fire: (event: string) => {
      events.get(event)?.()
    },
    active: () => tasks.size + events.size,
  }
}

const started = async () => {
  const source = scriptedSource()
  const clock = manualHost()
  const monitor = createServerMonitor(source, clock.host)
  const signals: ServerSignal[] = []
  monitor.onSignal((signal) => {
    signals.push(signal)
  })
  const stop = monitor.start()
  await vi.waitFor(() => {
    expect(monitor.snapshot()).toMatchObject({ checking: false, status: { kind: "loaded" } })
  })
  return { source, clock, monitor, signals, stop }
}

const check = (overrides: Partial<StatusCheck> & Pick<StatusCheck, "id" | "state">): StatusCheck => ({ counts: {}, names: [], ...overrides })

const snapshot = (overrides: Partial<HealthSnapshot>): HealthSnapshot => ({
  seen: { health: liveHealth, at: NOW },
  failures: 0,
  status: { kind: "loaded", status: liveServerStatus },
  checking: false,
  ...overrides,
})

const loaded = (checks: readonly StatusCheck[]): HealthSnapshot["status"] => ({
  kind: "loaded",
  status: { checked_at: "2026-09-18T03:00:00Z", checks: [...checks] },
})

afterEach(() => {
  vi.useRealTimers()
})

describe("server monitor", () => {
  it("reads health and checks on start and stops every timer and listener", async () => {
    const { source, clock, monitor, stop } = await started()
    expect(monitor.snapshot().seen).toEqual({ health: liveHealth, at: NOW })
    expect(source.calls).toEqual({ health: 1, status: 1 })
    stop()
    expect(clock.active()).toBe(0)
  })

  it("polls health and checks on their own cadence and on wake events", async () => {
    const { source, clock, monitor } = await started()
    clock.tick(HEALTH_EVERY_MS)
    await monitor.checkNow()
    clock.fire("online")
    await monitor.checkNow()
    clock.tick(STATUS_EVERY_MS)
    await vi.waitFor(() => {
      expect(source.calls.status).toBe(2)
    })
    expect(source.calls.health).toBe(3)
  })

  it("joins a check that is already running", async () => {
    const { source, monitor } = await started()
    await Promise.all([monitor.checkNow(), monitor.checkNow(), monitor.checkNow()])
    expect(source.calls.health).toBe(2)
  })

  it("is down only after two failures in a row and says when it reconnects", async () => {
    const { source, monitor, signals } = await started()
    source.answerHealth(unreachable)
    await monitor.checkNow()
    expect(summaryOf(monitor.snapshot()).label).toBe("connected")
    await monitor.checkNow()
    expect(summaryOf(monitor.snapshot())).toEqual({ label: "disconnected", tone: "destructive" })
    source.answerHealth(() => Promise.resolve(liveHealth))
    await monitor.checkNow()
    expect(signals).toEqual(["reconnected"])
    expect(monitor.snapshot().failures).toBe(0)
    await vi.waitFor(() => {
      expect(source.calls.status).toBe(2)
    })
  })

  it("does not poll the checks while the server is down", async () => {
    const { source, clock, monitor } = await started()
    source.answerHealth(unreachable)
    await monitor.checkNow()
    await monitor.checkNow()
    clock.tick(STATUS_EVERY_MS)
    expect(source.calls.status).toBe(1)
  })

  it("tells a restart apart by the process id or the start time", async () => {
    const { source, monitor, signals } = await started()
    source.answerHealth(() => Promise.resolve({ ...liveHealth, pid: liveHealth.pid + 1 }))
    await monitor.checkNow()
    source.answerHealth(() => Promise.resolve({ ...liveHealth, pid: liveHealth.pid + 1, started_at: isoDateTime("2026-09-18T02:59:00Z") }))
    await monitor.checkNow()
    await monitor.checkNow()
    expect(signals).toEqual(["restarted", "restarted"])
  })

  it("counts a probe that never answers as a failure", async () => {
    vi.useFakeTimers()
    const source = scriptedSource()
    const clock = manualHost()
    const monitor = createServerMonitor(source, clock.host)
    source.answerHealth(() => new Promise<ServerHealth>(() => undefined))
    const probe = monitor.checkNow()
    expect(monitor.snapshot().checking).toBe(true)
    await vi.advanceTimersByTimeAsync(PROBE_DEADLINE_MS)
    await probe
    expect(monitor.snapshot()).toMatchObject({ failures: 1, checking: false })
  })

  it("marks the checks as unreadable when the status probe fails", async () => {
    const { source, clock, monitor } = await started()
    source.answerStatus(unreachable)
    clock.tick(STATUS_EVERY_MS)
    await vi.waitFor(() => {
      expect(monitor.snapshot().status.kind).toBe("failed")
    })
    expect(summaryOf(monitor.snapshot())).toEqual({ label: "attention", tone: "warning" })
  })
})

describe("server presenters", () => {
  it("takes the tone from the worst check", () => {
    expect(summaryOf(snapshot({}))).toEqual({ label: "connected", tone: "success" })
    expect(summaryOf(snapshot({ status: loaded([check({ id: "database", state: "ok" }), check({ id: "model_keys", state: "warning" })]) }))).toEqual({
      label: "attention",
      tone: "warning",
    })
    expect(summaryOf(snapshot({ status: loaded([check({ id: "model_keys", state: "warning" }), check({ id: "engine", state: "error" })]) }))).toEqual({
      label: "attention",
      tone: "destructive",
    })
    expect(summaryOf(snapshot({ seen: null, status: { kind: "pending" } }))).toEqual({ label: "checking", tone: "neutral" })
    expect(summaryOf(snapshot({ seen: { health: { ...liveHealth, status: "starting" }, at: NOW } }))).toEqual({ label: "starting", tone: "warning" })
  })

  it("explains a check by its counts and names, and by its state otherwise", () => {
    expect(linesOf(check({ id: "project", state: "error", counts: { errors: 2, warnings: 1 }, names: ["flows/a/flow.yaml"] }))).toEqual([
      { kind: "reason", reason: "projectErrors", count: 2, names: [] },
      { kind: "reason", reason: "projectQuarantined", count: 1, names: ["flows/a/flow.yaml"] },
      { kind: "reason", reason: "projectWarnings", count: 1, names: [] },
    ])
    expect(linesOf(check({ id: "model_keys", state: "warning", counts: { missing: 2 }, names: ["openrouter", "anthropic"] }))).toEqual([
      { kind: "reason", reason: "modelKeysMissing", count: 2, names: ["openrouter", "anthropic"] },
    ])
    expect(linesOf(check({ id: "project", state: "warning" }))).toEqual([{ kind: "state", check: "project", state: "warning" }])
    expect(linesOf(check({ id: "project", state: "ok", counts: { warnings: 4 } }))).toEqual([{ kind: "state", check: "project", state: "ok" }])
  })

  it("quotes a project root the shell would split", () => {
    expect(startCommand("/Users/me/lumen")).toBe("uv run aqven dev /Users/me/lumen")
    expect(startCommand("/Users/me/my project's")).toBe(`uv run aqven dev '/Users/me/my project'\\''s'`)
  })
})
