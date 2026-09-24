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

const refOfId = (id: string): string => `#${id.slice(-6)}`

const summaries = new Map(initialSeries().map((series) => [refOfId(series.id), summaryOf(series)]))

const refOf = (link: HTMLElement): string => (link.getAttribute("aria-label") ?? "").replace("Open series ", "")

const sectionOf = (name: string): Promise<HTMLElement> => screen.findByRole("region", { name })

const sectionTitles = async (): Promise<readonly string[]> => {
  await screen.findAllByRole("table")
  return screen.getAllByRole("heading", { level: 2 }).map((heading) => heading.textContent)
}

const listedIn = async (name: string): Promise<readonly ApiSeriesSummary[]> =>
  within(within(await sectionOf(name)).getByRole("table", { name: `Series on ${name}` }))
    .getAllByRole("link")
    .map((link) => {
      const summary = summaries.get(refOf(link))
      if (summary === undefined) throw new Error(`no fixture for ${refOf(link)}`)
      return summary
    })

const isActive = (summary: ApiSeriesSummary): boolean => ACTIVE_SERIES_STATUSES.some((status) => status === summary.status)

const isNewestFirst = (group: readonly ApiSeriesSummary[]): boolean =>
  group.every((summary, index) => index === 0 || Date.parse(group[index - 1]?.started_at ?? "") >= Date.parse(summary.started_at))

const isListOrder = (rows: readonly ApiSeriesSummary[]): boolean => {
  const activeCount = rows.filter(isActive).length
  return rows.slice(0, activeCount).every(isActive) && isNewestFirst(rows.slice(0, activeCount)) && isNewestFirst(rows.slice(activeCount))
}

const rowOf = async (id: string): Promise<HTMLElement> => {
  const link = await screen.findByRole("link", { name: `Open series ${refOfId(id)}` })
  const row = link.closest("[role=row]")
  if (!(row instanceof HTMLElement)) throw new Error(`no row for ${id}`)
  return row
}

const SECTIONS = ["judge_panel", "support_case", "Arms"] as const

const flowOfSection = (name: string): string | null => (name === "Arms" ? null : name)

describe("SeriesListScreen", () => {
  it("shows every series of the project in one section per flow, arms last, active ones on top and the newest first", async () => {
    await renderRoute(SERIES_LIST)
    expect(await sectionTitles()).toEqual([...SECTIONS])
    const sections = await Promise.all(SECTIONS.map(async (name) => ({ name, rows: await listedIn(name) })))
    expect(sections.flatMap((section) => section.rows)).toHaveLength(summaries.size)
    sections.forEach((section) => {
      expect(section.rows.every((summary) => summary.flow_id === flowOfSection(section.name))).toBe(true)
      expect(isListOrder(section.rows)).toBe(true)
    })
    expect(within(await sectionOf("judge_panel")).getByText("2 series")).toBeTruthy()
  })

  it("files the series of arms, which have no project flow, under arms", async () => {
    await renderRoute(SERIES_LIST)
    expect((await listedIn("Arms")).map((summary) => summary.series_id).toSorted()).toEqual(
      [RESEARCH_SERIES.escalationRunning, RESEARCH_SERIES.critiqueDev, RESEARCH_SERIES.splitInconclusive].toSorted(),
    )
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
    expect(screen.queryByRole("heading", { level: 2 })).toBeNull()
  })
})
