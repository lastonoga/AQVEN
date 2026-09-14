export type Mark = number

export class RunClock {
  private readonly origin = performance.now()

  constructor(readonly startedAt: number) {}

  now(): number {
    return this.startedAt + Math.round(performance.now() - this.origin)
  }

  mark(): Mark {
    return performance.now()
  }

  since(mark: Mark): number {
    return Math.round(performance.now() - mark)
  }
}
