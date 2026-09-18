import { cleanup } from "@testing-library/react"
import { afterAll, afterEach, beforeAll, beforeEach, vi } from "vitest"
import { server } from "@/mocks/node"

class ResizeObserverStub {
  observe(): void {
    return
  }
  unobserve(): void {
    return
  }
  disconnect(): void {
    return
  }
}

const noScroll = (): void => {
  return
}

beforeAll(() => {
  Object.defineProperty(Element.prototype, "scrollTo", { value: noScroll, configurable: true, writable: true })
  Object.defineProperty(Element.prototype, "scrollIntoView", { value: noScroll, configurable: true, writable: true })
  Object.defineProperty(window, "scrollTo", { value: noScroll, configurable: true, writable: true })
  server.listen({ onUnhandledRequest: "error" })
})

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", ResizeObserverStub)
})

afterEach(() => {
  cleanup()
  server.resetHandlers()
})

afterAll(() => {
  server.close()
})
