import { streamSSE } from "hono/streaming"
import type { Context } from "hono"
import type { SSEStreamingApi } from "hono/streaming"
import type { Diagnostic } from "@wf/synth"

export type RunStatus = "queued" | "running" | "ok" | "error"

export type Run = {
  id: string
  flow: string
  input: unknown
  status: RunStatus
  irHash?: string
  startedAt: number
  endedAt?: number
}

export type RunEvent = {
  seq: number
  at: number
  type: string
  nodeId?: string
  payload?: unknown
}

export type ServerEvent =
  | { t: "synth"; flows: string[]; ms: number }
  | { t: "diagnostics"; flow: string; diagnostics: Diagnostic[] }
  | { t: "synth_error"; flow: string; file: string; message: string }
  | { t: "run"; runId: string; event: RunEvent }

export const HEARTBEAT_MS = 15_000

const HEARTBEAT_FRAME = ": heartbeat\n\n"

class Subscriber {
  private tail: Promise<unknown> = Promise.resolve()
  private release: () => void = () => {}
  readonly done = new Promise<void>((resolve) => {
    this.release = resolve
  })

  constructor(private readonly stream: SSEStreamingApi) {}

  send(event: ServerEvent): void {
    this.enqueue(() => this.stream.writeSSE({ data: JSON.stringify(event) }))
  }

  ping(): void {
    this.enqueue(() => this.stream.write(HEARTBEAT_FRAME))
  }

  finish(): void {
    this.release()
  }

  close(): void {
    this.enqueue(() => this.stream.close())
    this.release()
  }

  private enqueue(write: () => Promise<unknown>): void {
    this.tail = this.tail.then(write).catch(() => undefined)
  }
}

class EventBus {
  private readonly subscribers = new Set<Subscriber>()
  private heartbeat: ReturnType<typeof setInterval> | undefined

  get size(): number {
    return this.subscribers.size
  }

  open(stream: SSEStreamingApi): Subscriber {
    const subscriber = new Subscriber(stream)
    this.subscribers.add(subscriber)
    this.startHeartbeat()
    return subscriber
  }

  remove(subscriber: Subscriber): void {
    this.subscribers.delete(subscriber)
    subscriber.finish()
    this.stopWhenEmpty()
  }

  publish(event: ServerEvent): void {
    for (const subscriber of this.subscribers) subscriber.send(event)
  }

  closeAll(): void {
    for (const subscriber of this.subscribers) subscriber.close()
    this.subscribers.clear()
    this.stopWhenEmpty()
  }

  private startHeartbeat(): void {
    if (this.heartbeat) return
    this.heartbeat = setInterval(() => this.pingAll(), HEARTBEAT_MS)
    this.heartbeat.unref()
  }

  private pingAll(): void {
    for (const subscriber of this.subscribers) subscriber.ping()
  }

  private stopWhenEmpty(): void {
    if (this.subscribers.size > 0) return
    if (!this.heartbeat) return
    clearInterval(this.heartbeat)
    this.heartbeat = undefined
  }
}

const bus = new EventBus()

export function publish(event: ServerEvent): void {
  bus.publish(event)
}

export function subscriberCount(): number {
  return bus.size
}

export function closeEvents(): void {
  bus.closeAll()
}

export function eventsHandler(c: Context): Response {
  return streamSSE(c, async (stream) => {
    const subscriber = bus.open(stream)
    stream.onAbort(() => bus.remove(subscriber))
    await subscriber.done
  })
}
