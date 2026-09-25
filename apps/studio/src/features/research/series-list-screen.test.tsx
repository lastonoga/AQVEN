import { fireEvent, screen, waitFor, within } from "@testing-library/react"
import { http, HttpResponse } from "msw"
import { describe, expect, it, vi } from "vitest"
import { ACTIVE_SERIES_STATUSES, type ApiSeriesEta, type ApiSeriesSummary } from "@/domain"
import { API_BASE } from "@/api/client"
import { initialSeries, RESEARCH_SERIES, summaryOf } from "@/mocks/data/research"
import { server } from "@/mocks/node"
import { renderRoute } from "@/test/render-route"

vi.mock("@/features/chat", () => ({
  ChatPanel: () => null,
}))

const SERIES_LIST = "/research/series"

const refOfId = (id: string): string => `#${id.slice(-6)}`

const summaries = new Map(initialSeries().map((series) => [refOfId(series.id), summaryOf(series)]))

const refOf = (link: HTMLElement): string => (link.getAttribute("aria-label") ?? "").replace("Open series ", "")

const listed = async (): Promise<readonly ApiSeriesSummary[]> =>
  within(await screen.findByRole("table", { name: "All series" }))
    .getAllByRole("link")
    .map((link) => {
      const summary = summaries.get(refOf(link))
      if (summary === undefined) throw new Error(`no fixture for ${refOf(link)}`)
      return summary
    })

const isNewestFirst = (rows: readonly ApiSeriesSummary[]): boolean =>
  rows.every((summary, index) => index === 0 || Date.parse(rows[index - 1]?.started_at ?? "") >= Date.parse(summary.started_at))

const rowOf = async (id: string): Promise<HTMLElement> => {
  const link = await screen.findByRole("link", { name: `Open series ${refOfId(id)}` })
  const row = link.closest("[role=row]")
  if (!(row instanceof HTMLElement)) throw new Error(`no row for ${id}`)
  return row
}

describe("SeriesListScreen", () => {
  it("shows every series of the project in one table, newest first, running or not", async () => {
    await renderRoute(SERIES_LIST)
    const rows = await listed()
    expect(rows).toHaveLength(summaries.size)
    expect(isNewestFirst(rows)).toBe(true)
    expect(rows.some((summary) => ACTIVE_SERIES_STATUSES.some((status) => status === summary.status))).toBe(true)
    expect(screen.getAllByRole("table")).toHaveLength(1)
    expect(screen.queryByRole("heading", { level: 2 })).toBeNull()
  })

  it("names the flow of each series and experiment flows for a series on a flow of its experiment", async () => {
    await renderRoute(SERIES_LIST)
    expect(await screen.findByRole("columnheader", { name: "Flow" })).toBeTruthy()
    expect((await rowOf(RESEARCH_SERIES.panelRefuted)).textContent).toContain("judge_panel")
    expect((await rowOf(RESEARCH_SERIES.lookWaiting)).textContent).toContain("support_case")
    expect((await rowOf(RESEARCH_SERIES.escalationRunning)).textContent).toContain("Flows of experiments")
  })

  it("shows status, experiment, split, size, spend and verdict of a series", async () => {
    await renderRoute(SERIES_LIST)
    const refuted = await rowOf(RESEARCH_SERIES.panelRefuted)
    const summary = summaries.get(refOfId(RESEARCH_SERIES.panelRefuted))
    expect(refuted.textContent).toContain("DONE")
    expect(refuted.textContent).toContain(summary?.origin.kind === "experiment" ? summary.origin.experiment_id : "")
    expect(refuted.textContent).toContain(`${String(summary?.cases)}×${String(summary?.repeats)}`)
    expect(refuted.textContent).toContain("refuted")
    expect(refuted.textContent).toMatch(/\$\d+\.\d\d/)
    expect((await rowOf(RESEARCH_SERIES.lookWaiting)).textContent).toContain("look · support_case")
  })

  it("shows the time left of a running series next to its status", async () => {
    const running = summaries.get(refOfId(RESEARCH_SERIES.escalationRunning))
    const done = summaries.get(refOfId(RESEARCH_SERIES.panelRefuted))
    if (running === undefined || done === undefined) throw new Error("missing series fixtures")
    const eta: ApiSeriesEta = { state: "running", attempts_per_minute: 12, remaining_seconds: 300, finish_at: "2026-09-18T03:05:00Z", window_seconds: 240 }
    const estimating: ApiSeriesEta = { state: "estimating", attempts_per_minute: null, remaining_seconds: null, finish_at: null, window_seconds: 0 }
    const lookRunning = { ...running, series_id: RESEARCH_SERIES.lookWaiting, eta: estimating }
    const items = [{ ...running, eta }, lookRunning, done]
    server.use(http.get(`${API_BASE}/series`, () => HttpResponse.json({ items, next_cursor: null, total_estimate: items.length })))
    await renderRoute(SERIES_LIST)
    expect((await rowOf(RESEARCH_SERIES.escalationRunning)).textContent).toContain("RUNNING~5 min left")
    expect((await rowOf(RESEARCH_SERIES.lookWaiting)).textContent).not.toContain("left")
    expect((await rowOf(RESEARCH_SERIES.panelRefuted)).textContent).not.toContain("left")
  })

  it("opens a series from its row", async () => {
    const router = await renderRoute(SERIES_LIST)
    fireEvent.click(await screen.findByRole("link", { name: `Open series ${refOfId(RESEARCH_SERIES.panelRefuted)}` }))
    await waitFor(() => {
      expect(router.state.location.pathname).toBe(`/research/series/${RESEARCH_SERIES.panelRefuted}`)
    })
  })

  it("says so when the project has no series", async () => {
    server.use(http.get(`${API_BASE}/series`, () => HttpResponse.json({ items: [], next_cursor: null, total_estimate: 0 })))
    await renderRoute(SERIES_LIST)
    expect(await screen.findByText("No series yet")).toBeTruthy()
    expect(screen.queryByRole("table")).toBeNull()
  })
})
