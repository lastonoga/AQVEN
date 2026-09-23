import { fireEvent, screen, waitFor, within } from "@testing-library/react"
import { http, HttpResponse } from "msw"
import { describe, expect, it, vi } from "vitest"
import { ACTIVE_SERIES_STATUSES, type ApiSeriesSummary } from "@/domain"
import { API_BASE } from "@/api/client"
import { initialSeries, RESEARCH_SERIES, summaryOf } from "@/mocks/data/research"
import { server } from "@/mocks/node"
import { renderRoute } from "@/test/render-route"

vi.mock("@/features/chat", () => ({
  ChatPanel: () => null,
}))

const SERIES_LIST = "/research/series"

const summaries = new Map(initialSeries().map((series) => [`#${series.id.slice(-6)}`, summaryOf(series)]))

const table = (): Promise<HTMLElement> => screen.findByRole("table", { name: "All series" })

const refOf = (link: HTMLElement): string => (link.getAttribute("aria-label") ?? "").replace("Open series ", "")

const listed = async (): Promise<readonly ApiSeriesSummary[]> =>
  within(await table())
    .getAllByRole("link")
    .map((link) => {
      const summary = summaries.get(refOf(link))
      if (summary === undefined) throw new Error(`no fixture for ${refOf(link)}`)
      return summary
    })

const isActive = (summary: ApiSeriesSummary): boolean => ACTIVE_SERIES_STATUSES.some((status) => status === summary.status)

const isNewestFirst = (group: readonly ApiSeriesSummary[]): boolean =>
  group.every((summary, index) => index === 0 || Date.parse(group[index - 1]?.started_at ?? "") >= Date.parse(summary.started_at))

const rowOf = async (id: string): Promise<HTMLElement> => {
  const link = within(await table()).getByRole("link", { name: `Open series #${id.slice(-6)}` })
  const row = link.closest("[role=row]")
  if (!(row instanceof HTMLElement)) throw new Error(`no row for ${id}`)
  return row
}

describe("SeriesListScreen", () => {
  it("lists every series of the project with active ones on top and the newest first", async () => {
    await renderRoute(SERIES_LIST)
    const rows = await listed()
    expect(rows).toHaveLength(summaries.size)
    const activeCount = rows.filter(isActive).length
    expect(rows.slice(0, activeCount).every(isActive)).toBe(true)
    expect(isNewestFirst(rows.slice(0, activeCount))).toBe(true)
    expect(isNewestFirst(rows.slice(activeCount))).toBe(true)
  })

  it("shows status, experiment, split, size, spend and verdict of a series", async () => {
    await renderRoute(SERIES_LIST)
    const refuted = await rowOf(RESEARCH_SERIES.panelRefuted)
    const summary = summaries.get(`#${RESEARCH_SERIES.panelRefuted.slice(-6)}`)
    expect(refuted.textContent).toContain("DONE")
    expect(refuted.textContent).toContain(summary?.origin.kind === "experiment" ? summary.origin.experiment_id : "")
    expect(refuted.textContent).toContain(`${String(summary?.cases)}×${String(summary?.repeats)}`)
    expect(refuted.textContent).toContain("refuted")
    expect(refuted.textContent).toMatch(/\$\d+\.\d\d/)
    expect((await rowOf(RESEARCH_SERIES.lookWaiting)).textContent).toContain("look · support_case")
  })

  it("opens a series from its row", async () => {
    const router = await renderRoute(SERIES_LIST)
    fireEvent.click(within(await table()).getByRole("link", { name: `Open series #${RESEARCH_SERIES.panelRefuted.slice(-6)}` }))
    await waitFor(() => {
      expect(router.state.location.pathname).toBe(`/research/series/${RESEARCH_SERIES.panelRefuted}`)
    })
  })

  it("says so when the project has no series", async () => {
    server.use(http.get(`${API_BASE}/series`, () => HttpResponse.json({ items: [], next_cursor: null, total_estimate: 0 })))
    await renderRoute(SERIES_LIST)
    expect(await screen.findByText("No series yet")).toBeTruthy()
  })
})
