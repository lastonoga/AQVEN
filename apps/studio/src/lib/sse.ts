export type Unsubscribe = () => void

export type EventReader<T> = (value: unknown) => T | null

export type FeedSubscription<T> = {
  readonly feed: string
  readonly after: number
  readonly read: EventReader<T>
  readonly onEvent: (event: T) => void
}

export type FollowFeed = <T>(subscription: FeedSubscription<T>) => Unsubscribe

export type EventMuxOptions = {
  readonly url: string
  readonly retryMs: number
}

type Delivery = (value: unknown) => void

const messageText = (message: Event): string | null => {
  if (!(message instanceof MessageEvent)) return null
  const data: unknown = message.data
  return typeof data === "string" ? data : null
}

const parsed = (raw: string): unknown => {
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> => typeof value === "object" && value !== null

const seqOf = (value: unknown): number | null => {
  const seq = isRecord(value) ? value["seq"] : null
  return typeof seq === "number" ? seq : null
}

const followParam = ([feed, cursor]: readonly [string, number]): string => `follow=${encodeURIComponent(`${feed}@${String(cursor)}`)}`

export const followUrl = (url: string, cursors: ReadonlyMap<string, number>): string => `${url}?${[...cursors].map(followParam).join("&")}`

const isHidden = (): boolean => typeof document !== "undefined" && document.visibilityState === "hidden"

const canStream = (): boolean => typeof EventSource !== "undefined"

export const createEventMux = ({ url, retryMs }: EventMuxOptions): FollowFeed => {
  const cursors = new Map<string, number>()
  const deliveries = new Map<string, Set<Delivery>>()
  let source: EventSource | null = null
  let retry: ReturnType<typeof setTimeout> | null = null
  let queued = false

  const receive = (feed: string, message: Event): void => {
    const raw = messageText(message)
    if (raw === null) return
    const value = parsed(raw)
    const seq = seqOf(value)
    if (seq !== null) cursors.set(feed, Math.max(cursors.get(feed) ?? 0, seq))
    deliveries.get(feed)?.forEach((deliver) => {
      deliver(value)
    })
  }

  const close = (): void => {
    source?.close()
    source = null
    if (retry !== null) clearTimeout(retry)
    retry = null
  }

  const connect = (): void => {
    queued = false
    close()
    if (cursors.size === 0 || isHidden() || !canStream()) return
    const opened = new EventSource(followUrl(url, cursors))
    cursors.forEach((_, feed) => {
      opened.addEventListener(feed, (message) => {
        receive(feed, message)
      })
    })
    opened.addEventListener("error", () => {
      if (source !== opened) return
      close()
      retry = setTimeout(connect, retryMs)
    })
    source = opened
  }

  const reconnect = (): void => {
    close()
    if (queued) return
    queued = true
    queueMicrotask(connect)
  }

  if (typeof document !== "undefined") document.addEventListener("visibilitychange", reconnect)

  return <T>({ feed, after, read, onEvent }: FeedSubscription<T>): Unsubscribe => {
    const deliver: Delivery = (value) => {
      const event = read(value)
      if (event !== null) onEvent(event)
    }
    const known = deliveries.get(feed)
    known?.add(deliver)
    if (known === undefined) {
      deliveries.set(feed, new Set([deliver]))
      cursors.set(feed, after)
      reconnect()
    }
    return () => {
      const current = deliveries.get(feed)
      current?.delete(deliver)
      if (current === undefined || current.size > 0) return
      deliveries.delete(feed)
      cursors.delete(feed)
      reconnect()
    }
  }
}
