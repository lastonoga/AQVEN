import { afterEach, beforeEach, expect, it, vi } from "vitest"

const render = vi.hoisted(() => vi.fn())

vi.mock("react-dom/client", () => ({ createRoot: () => ({ render }) }))
vi.mock("./router", () => ({ router: {} }))

const serviceWorkerDescriptor = Object.getOwnPropertyDescriptor(navigator, "serviceWorker")

beforeEach(() => {
  vi.resetModules()
  render.mockClear()
  document.body.innerHTML = '<div id="root"></div>'
})

afterEach(() => {
  if (serviceWorkerDescriptor !== undefined) {
    Object.defineProperty(navigator, "serviceWorker", serviceWorkerDescriptor)
  } else {
    Reflect.deleteProperty(navigator, "serviceWorker")
  }
})

it("mounts without waiting for a browser mock worker", async () => {
  await import("./main")
  expect(render).toHaveBeenCalledTimes(1)
})

it("unregisters only the legacy mock service worker without delaying the mount", async () => {
  const unregisterMock = vi.fn().mockResolvedValue(true)
  const unregisterOther = vi.fn().mockResolvedValue(true)
  const getRegistrations = vi.fn().mockResolvedValue([
    { active: { scriptURL: "http://localhost/mockServiceWorker.js" }, unregister: unregisterMock },
    { active: { scriptURL: "http://localhost/otherWorker.js" }, unregister: unregisterOther },
  ])
  Object.defineProperty(navigator, "serviceWorker", { configurable: true, value: { getRegistrations } })

  await import("./main")

  expect(render).toHaveBeenCalledTimes(1)
  await vi.waitFor(() => {
    expect(unregisterMock).toHaveBeenCalledTimes(1)
  })
  expect(unregisterOther).not.toHaveBeenCalled()
})
