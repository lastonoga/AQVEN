type Listener = (event: Event) => void

export class FakeEventStream {
  static readonly opened: FakeEventStream[] = []
  readonly url: string
  closed = false
  private readonly listeners = new Map<string, Listener[]>()

  constructor(url: string) {
    this.url = url
    FakeEventStream.opened.push(this)
  }

  static reset(): void {
    FakeEventStream.opened.length = 0
  }

  static on(path: string): readonly FakeEventStream[] {
    return FakeEventStream.opened.filter((source) => source.url.startsWith(path))
  }

  static latestOn(path: string): FakeEventStream {
    const source = FakeEventStream.on(path).at(-1)
    if (source === undefined) throw new Error(`no event source was opened on ${path}`)
    return source
  }

  addEventListener(type: string, listener: Listener): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener])
  }

  close(): void {
    this.closed = true
  }

  emit(type: string, payload: unknown): void {
    const message = new MessageEvent(type, { data: JSON.stringify(payload) })
    this.listeners.get(type)?.forEach((listener) => {
      listener(message)
    })
  }
}
