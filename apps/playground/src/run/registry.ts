const KEY = "wf.playground.runs"
const LIMIT = 50

export type StartedRun = { id: string; flow: string; startedAt: number }

const isStartedRun = (value: unknown): value is StartedRun => {
  const record = value as Partial<StartedRun> | null
  if (record === null || typeof record !== "object") return false
  return typeof record.id === "string" && typeof record.flow === "string" && typeof record.startedAt === "number"
}

const read = (): StartedRun[] => {
  try {
    const raw = window.localStorage.getItem(KEY)
    if (raw === null) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(isStartedRun)
  } catch {
    return []
  }
}

const write = (runs: StartedRun[]): void => {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(runs.slice(0, LIMIT)))
  } catch {
    return
  }
}

export const startedRuns = (): StartedRun[] => read()

export const rememberRun = (run: StartedRun): void => {
  write([run, ...read().filter((item) => item.id !== run.id)])
}

export const forgetRuns = (): void => write([])
