import type { ServerHealth, ServerSource, ServerStatus } from "@/api/server"

export const HEALTH_EVERY_MS = 5_000
export const STATUS_EVERY_MS = 30_000
export const DOWN_AFTER_FAILURES = 2
export const PROBE_DEADLINE_MS = 4_000
export const WAKE_EVENTS = ["focus", "online"] as const

export type StatusReading =
  | { readonly kind: "pending" }
  | { readonly kind: "loaded"; readonly status: ServerStatus }
  | { readonly kind: "failed" }

export type SeenHealth = { readonly health: ServerHealth; readonly at: Date }

export type HealthSnapshot = {
  readonly seen: SeenHealth | null
  readonly failures: number
  readonly status: StatusReading
  readonly checking: boolean
}

export type ServerSignal = "reconnected" | "restarted"

export type Stop = () => void

export type MonitorHost = {
  readonly every: (ms: number, task: () => void) => Stop
  readonly on: (event: string, task: () => void) => Stop
  readonly now: () => Date
}

export type ServerMonitor = {
  readonly subscribe: (listener: () => void) => Stop
  readonly snapshot: () => HealthSnapshot
  readonly onSignal: (listener: (signal: ServerSignal) => void) => Stop
  readonly start: () => Stop
  readonly checkNow: () => Promise<void>
}

type SignalRule = { readonly signal: ServerSignal; readonly applies: (before: HealthSnapshot, health: ServerHealth) => boolean }

const INITIAL: HealthSnapshot = { seen: null, failures: 0, status: { kind: "pending" }, checking: false }

const FAILED_STATUS: StatusReading = { kind: "failed" }

export const browserHost: MonitorHost = {
  every: (ms, task) => {
    const timer = setInterval(task, ms)
    return () => {
      clearInterval(timer)
    }
  },
  on: (event, task) => {
    window.addEventListener(event, task)
    return () => {
      window.removeEventListener(event, task)
    }
  },
  now: () => new Date(),
}

export const isDown = (snapshot: HealthSnapshot): boolean => snapshot.failures >= DOWN_AFTER_FAILURES

const isRestart = (before: ServerHealth, after: ServerHealth): boolean =>
  before.pid !== after.pid || before.started_at !== after.started_at

const SIGNAL_RULES: readonly SignalRule[] = [
  { signal: "restarted", applies: (before, health) => before.seen !== null && isRestart(before.seen.health, health) },
  { signal: "reconnected", applies: (before) => isDown(before) },
]

export const signalOf = (before: HealthSnapshot, health: ServerHealth): ServerSignal | null =>
  SIGNAL_RULES.find((rule) => rule.applies(before, health))?.signal ?? null

const withinDeadline = <T>(work: Promise<T>, ms: number): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`no answer in ${String(ms)} ms`))
    }, ms)
    void work.then(resolve, reject).finally(() => {
      clearTimeout(timer)
    })
  })

const settled = async <T>(work: Promise<T>): Promise<T | null> => {
  try {
    return await withinDeadline(work, PROBE_DEADLINE_MS)
  } catch {
    return null
  }
}

const coalesced = (task: () => Promise<void>): (() => Promise<void>) => {
  let running: Promise<void> | null = null
  return () => {
    running ??= task().finally(() => {
      running = null
    })
    return running
  }
}

export const createServerMonitor = (source: ServerSource, host: MonitorHost = browserHost): ServerMonitor => {
  let state = INITIAL
  const listeners = new Set<() => void>()
  const signalListeners = new Set<(signal: ServerSignal) => void>()

  const update = (patch: Partial<HealthSnapshot>): void => {
    state = { ...state, ...patch }
    listeners.forEach((listener) => {
      listener()
    })
  }

  const emit = (signal: ServerSignal): void => {
    signalListeners.forEach((listener) => {
      listener(signal)
    })
  }

  const refreshStatus = coalesced(async () => {
    const status = await settled(source.status())
    update({ status: status === null ? FAILED_STATUS : { kind: "loaded", status } })
  })

  const receive = (health: ServerHealth): void => {
    const signal = signalOf(state, health)
    update({ seen: { health, at: host.now() }, failures: 0, checking: false })
    if (signal === null) return
    emit(signal)
    void refreshStatus()
  }

  const checkNow = coalesced(async () => {
    update({ checking: true })
    const health = await settled(source.health())
    if (health === null) {
      update({ failures: state.failures + 1, checking: false })
      return
    }
    receive(health)
  })

  const pollHealth = (): void => {
    void checkNow()
  }

  const pollStatus = (): void => {
    if (isDown(state)) return
    void refreshStatus()
  }

  const start = (): Stop => {
    const stops = [
      host.every(HEALTH_EVERY_MS, pollHealth),
      host.every(STATUS_EVERY_MS, pollStatus),
      ...WAKE_EVENTS.map((event) => host.on(event, pollHealth)),
    ]
    pollHealth()
    pollStatus()
    return () => {
      stops.forEach((stop) => {
        stop()
      })
    }
  }

  return {
    subscribe: (listener) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    snapshot: () => state,
    onSignal: (listener) => {
      signalListeners.add(listener)
      return () => {
        signalListeners.delete(listener)
      }
    },
    start,
    checkNow,
  }
}
