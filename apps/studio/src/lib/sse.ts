export type Unsubscribe = () => void

export type EventReader<T> = (value: unknown) => T | null

export type EventSubscription<T> = {
  readonly url: string
  readonly types: readonly string[]
  readonly read: EventReader<T>
  readonly onEvent: (event: T) => void
}

const noSubscription: Unsubscribe = () => undefined

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

export const readMessage = <T>(message: Event, read: EventReader<T>): T | null => {
  const raw = messageText(message)
  return raw === null ? null : read(parsed(raw))
}

export const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> => typeof value === "object" && value !== null

export const subscribeEvents = <T>({ url, types, read, onEvent }: EventSubscription<T>): Unsubscribe => {
  if (typeof EventSource === "undefined") return noSubscription
  const source = new EventSource(url)
  const receive = (message: Event): void => {
    const event = readMessage(message, read)
    if (event !== null) onEvent(event)
  }
  types.forEach((type) => {
    source.addEventListener(type, receive)
  })
  return () => {
    source.close()
  }
}
