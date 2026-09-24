import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from "@tanstack/react-router"
import { http, HttpResponse } from "msw"
import { describe, expect, it, vi } from "vitest"
import { API_BASE } from "@/api/client"
import type { ServerStatus } from "@/api/server"
import { TooltipProvider } from "@/components/ui/tooltip"
import { liveProject } from "@/mocks/data/project"
import { liveHealth, liveServerStatus } from "@/mocks/data/server"
import { server } from "@/mocks/node"
import { router as appRouter } from "@/router"
import { StudioIntl } from "@/routes/-intl"
import { TEST_NOW } from "@/test/clock"
import { ServerDownBanner, ServerHealthProvider, ServerIndicator, ServerNoticeToast } from "."
import { browserHost, HEALTH_EVERY_MS, type MonitorHost } from "./monitor"

type Reply = () => Response

const LOST = "Studio lost the connection to the project server."

const manualTimers = () => {
  const tasks = new Map<number, () => void>()
  const host: MonitorHost = {
    ...browserHost,
    every: (ms, task) => {
      tasks.set(ms, task)
      return () => {
        tasks.delete(ms)
      }
    },
    now: () => TEST_NOW,
  }
  const tick = (ms: number): void => {
    act(() => {
      tasks.get(ms)?.()
    })
  }
  return { host, tick }
}

const probes = () => {
  const calls = { health: 0, status: 0 }
  let health: Reply = () => HttpResponse.json(liveHealth)
  let status: Reply = () => HttpResponse.json(liveServerStatus)
  server.use(
    http.get(`${API_BASE}/health`, () => {
      calls.health += 1
      return health()
    }),
    http.get(`${API_BASE}/status`, () => {
      calls.status += 1
      return status()
    }),
  )
  return {
    calls,
    answerHealth: (reply: Reply) => {
      health = reply
    },
    answerStatus: (body: ServerStatus) => {
      status = () => HttpResponse.json(body)
    },
  }
}

const renderHealth = async () => {
  const timers = manualTimers()
  const source = appRouter.options.context.api.server
  const router = createRouter({
    routeTree: createRootRoute({
      component: () => (
        <TooltipProvider>
          <StudioIntl locale="en" now={TEST_NOW}>
            <ServerHealthProvider source={source} host={timers.host}>
              <ServerDownBanner fallbackRoot={liveProject.root} />
              <ServerIndicator />
              <ServerNoticeToast />
            </ServerHealthProvider>
          </StudioIntl>
        </TooltipProvider>
      ),
    }),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  })
  const invalidate = vi.spyOn(router, "invalidate")
  await act(async () => {
    render(<RouterProvider router={router} />)
    await router.load()
  })
  return { ...timers, invalidate }
}

const indicator = (label: string): Promise<HTMLElement> => screen.findByRole("button", { name: `Server status: ${label}` })

const settled = async (calls: () => number, expected: number): Promise<void> => {
  await waitFor(() => {
    expect(calls()).toBe(expected)
  })
  await waitFor(() => {
    expect(screen.getByRole("button", { name: /^Server status:/ }).getAttribute("aria-busy")).toBe("false")
  })
}

const openDetails = async (label: string): Promise<HTMLElement> => {
  fireEvent.click(await indicator(label))
  return screen.findByRole("dialog")
}

describe("server health", () => {
  it("shows a connected server with its identity and every check", async () => {
    probes()
    await renderHealth()
    const trigger = await indicator("Connected")
    expect(trigger.getAttribute("data-tone")).toBe("success")
    const details = await openDetails("Connected")
    const rows = within(details).getAllByRole("definition").map((row) => row.textContent)
    expect(rows).toEqual([liveHealth.version, "20 minutes ago", String(liveHealth.pid), liveHealth.project_root])
    const checks = within(within(details).getByRole("list", { name: "Server checks" })).getAllByRole("listitem")
    expect(checks.map((item) => item.textContent)).toEqual([
      "The project database answers",
      "The run engine is running",
      "Project files are valid",
      "Every provider in aqven.yaml has a key",
    ])
    expect(screen.queryByRole("alert")).toBeNull()
  })

  it("needs attention for warnings and links a missing key to Settings", async () => {
    const probe = probes()
    probe.answerStatus({
      ...liveServerStatus,
      checks: [
        { id: "database", state: "ok", counts: {}, names: [] },
        { id: "project", state: "warning", counts: { errors: 0, warnings: 3 }, names: [] },
        { id: "model_keys", state: "warning", counts: { missing: 1 }, names: ["openrouter"] },
      ],
    })
    await renderHealth()
    expect((await indicator("Needs attention")).getAttribute("data-tone")).toBe("warning")
    const details = await openDetails("Needs attention")
    expect(within(details).getByText("3 warnings in project files")).toBeTruthy()
    expect(within(details).getByText(/^No key for openrouter/).textContent).toBe("No key for openrouter — add it in Settings")
    const settings = within(details).getByRole("link", { name: "add it in Settings" })
    expect(settings.getAttribute("href")).toBe("/settings")
    fireEvent.click(settings)
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull()
    })
  })

  it("turns red when a check fails and names the fix", async () => {
    const probe = probes()
    probe.answerStatus({ ...liveServerStatus, checks: [{ id: "engine", state: "error", counts: {}, names: [] }] })
    await renderHealth()
    expect((await indicator("Needs attention")).getAttribute("data-tone")).toBe("destructive")
    const details = await openDetails("Needs attention")
    expect(within(details).getByText("The run engine is not answering — restart Studio")).toBeTruthy()
  })

  it("goes down after two failed checks and recovers with a notice", async () => {
    const probe = probes()
    const { tick, invalidate } = await renderHealth()
    await indicator("Connected")
    probe.answerHealth(() => HttpResponse.error())
    tick(HEALTH_EVERY_MS)
    await settled(() => probe.calls.health, 2)
    expect(screen.queryByText(LOST)).toBeNull()
    expect(await indicator("Connected")).toBeTruthy()
    tick(HEALTH_EVERY_MS)
    const banner = await screen.findByRole("alert")
    expect(within(banner).getByText(LOST)).toBeTruthy()
    expect(within(banner).getByText(`uv run aqven dev ${liveHealth.project_root}`)).toBeTruthy()
    expect(within(banner).getByText("Retrying every 5 s")).toBeTruthy()
    const writeText = vi.fn(() => Promise.resolve())
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } })
    fireEvent.click(within(banner).getByRole("button", { name: "Copy the command" }))
    expect(await within(banner).findByRole("button", { name: "Copied" })).toBeTruthy()
    expect(writeText).toHaveBeenCalledWith(`uv run aqven dev ${liveHealth.project_root}`)
    expect((await indicator("Disconnected")).getAttribute("data-tone")).toBe("destructive")
    probe.answerHealth(() => HttpResponse.json(liveHealth))
    fireEvent.click(within(banner).getByRole("button", { name: "Check now" }))
    await waitFor(() => {
      expect(screen.queryByText(LOST)).toBeNull()
    })
    expect(await screen.findByText("Reconnected")).toBeTruthy()
    expect(await indicator("Connected")).toBeTruthy()
    expect(invalidate).toHaveBeenCalledTimes(1)
    await waitFor(() => {
      expect(probe.calls.status).toBe(2)
    })
  })

  it("reloads the page data and says so when the server restarted", async () => {
    const probe = probes()
    const { tick, invalidate } = await renderHealth()
    await indicator("Connected")
    expect(invalidate).not.toHaveBeenCalled()
    probe.answerHealth(() => HttpResponse.json({ ...liveHealth, pid: liveHealth.pid + 1, started_at: "2026-09-18T02:59:30Z" }))
    tick(HEALTH_EVERY_MS)
    expect(await screen.findByText("The server restarted")).toBeTruthy()
    expect(invalidate).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole("alert")).toBeNull()
  })

  it("checks at once when the window gets focus or goes back online", async () => {
    const probe = probes()
    await renderHealth()
    await settled(() => probe.calls.health, 1)
    act(() => {
      window.dispatchEvent(new Event("focus"))
    })
    await settled(() => probe.calls.health, 2)
    act(() => {
      window.dispatchEvent(new Event("online"))
    })
    await settled(() => probe.calls.health, 3)
  })
})
