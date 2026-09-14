export async function pooled<T>(count: number, limit: number, task: (index: number) => Promise<T>): Promise<T[]> {
  const results: T[] = new Array<T>(count)
  let next = 0
  const worker = async (): Promise<void> => {
    while (next < count) {
      const index = next
      next += 1
      results[index] = await task(index)
    }
  }
  const workers = Math.min(Math.max(Math.round(limit), 1), Math.max(count, 1))
  await Promise.all(Array.from({ length: workers }, () => worker()))
  return results
}

export type Slot = { id: string; readyAt: number }

export type ReadinessPlan = {
  ids: readonly string[]
  deps: ReadonlyMap<string, readonly string[]>
  concurrency: number
  now: () => number
  run: (slot: Slot) => Promise<boolean>
}

export type ReadinessReport = { started: string[]; forced: string[]; skipped: string[] }

export async function runByReadiness(plan: ReadinessPlan): Promise<ReadinessReport> {
  const known = new Set(plan.ids)
  const done = new Set<string>()
  const readyAt = new Map<string, number>()
  const active = new Map<string, Promise<void>>()
  const pending = [...plan.ids]
  const report: ReadinessReport = { started: [], forced: [], skipped: [] }
  let stopped = false

  const blockers = (id: string): readonly string[] =>
    (plan.deps.get(id) ?? []).filter((dep) => known.has(dep) && dep !== id)

  const isReady = (id: string): boolean => blockers(id).every((dep) => done.has(dep))

  const start = (id: string): void => {
    pending.splice(pending.indexOf(id), 1)
    report.started.push(id)
    const slot: Slot = { id, readyAt: readyAt.get(id) ?? plan.now() }
    const task = plan.run(slot).then((keepGoing) => {
      active.delete(id)
      done.add(id)
      stopped = stopped || !keepGoing
    })
    active.set(id, task)
  }

  const markReady = (): void => {
    const at = plan.now()
    for (const id of pending) if (isReady(id) && !readyAt.has(id)) readyAt.set(id, at)
  }

  while (!stopped && pending.length > 0) {
    markReady()
    const free = Math.max(plan.concurrency - active.size, 0)
    const ready = free === 0 ? [] : pending.filter(isReady).slice(0, free)
    if (ready.length > 0) {
      for (const id of ready) start(id)
      continue
    }
    if (active.size > 0) {
      await Promise.race(active.values())
      continue
    }
    const head = pending[0]
    if (head === undefined) break
    report.forced.push(head)
    readyAt.set(head, plan.now())
    start(head)
  }

  await Promise.all(active.values())
  report.skipped.push(...pending)
  return report
}
