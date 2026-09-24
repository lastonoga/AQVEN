import { act, fireEvent, screen, waitFor, within } from "@testing-library/react"
import { http, HttpResponse } from "msw"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { ApiSeriesSummary, ApiSpecEvent } from "@/domain"
import { API_BASE } from "@/api/client"
import { initialSeries, RESEARCH_SERIES, summaryOf } from "@/mocks/data/research"
import { server } from "@/mocks/node"
import { FakeEventStream } from "@/test/event-source"
import { renderRoute } from "@/test/render-route"
import { experimentChanged, filesChanged, seriesProgressed, startedFrom } from "./test-support"
import { REFRESH_BATCH_MS } from "./use-project-refresh"

vi.mock("@/features/chat", () => ({
  ChatPanel: () => null,
}))

const PROJECT_EVENTS = `${API_BASE}/events/spec`
const EXPERIMENT = "reply_noninferior_mistral"
const OTHER_EXPERIMENT = "panel_single_judge"
const QUIET_MS = REFRESH_BATCH_MS * 3

type Counter = { readonly count: () => number }

const summary = (id: string): ApiSeriesSummary => {
  const state = initialSeries().find((item) => item.id === id)
  if (state === undefined) throw new Error(`missing series fixture ${id}`)
  return summaryOf(state)
}

const seriesLink = (id: string): string => `Open series #${id.slice(-6)}`

const emit = (event: ApiSpecEvent): void => {
  act(() => {
    FakeEventStream.latestOn(PROJECT_EVENTS).emit(event.type, event)
  })
}

const requestsTo = (path: string): Counter => {
  let seen = 0
  server.events.on("request:start", ({ request }) => {
    if (request.method === "GET" && new URL(request.url).pathname === path) seen += 1
  })
  return { count: () => seen }
}

const quiet = async (): Promise<void> => {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, QUIET_MS))
  })
}

const seriesTable = (): Promise<HTMLElement> => screen.findByRole("table", { name: "All series" })

describe("project channel refreshes research pages in place", () => {
  beforeEach(() => {
    FakeEventStream.reset()
    vi.stubGlobal("EventSource", FakeEventStream)
  })

  afterEach(() => {
    server.events.removeAllListeners()
    vi.unstubAllGlobals()
  })

  it("shows a series started elsewhere on the Series tab without a reload", async () => {
    const first = summary(RESEARCH_SERIES.panelRefuted)
    const second = summary(RESEARCH_SERIES.critiqueDev)
    let rows: readonly ApiSeriesSummary[] = [first]
    server.use(http.get(`${API_BASE}/series`, () => HttpResponse.json({ items: rows, next_cursor: null, total_estimate: rows.length })))
    await renderRoute("/research/series")
    expect(within(await seriesTable()).getByRole("link", { name: seriesLink(first.series_id) })).toBeTruthy()
    expect(screen.queryByRole("link", { name: seriesLink(second.series_id) })).toBeNull()

    rows = [second, first]
    emit(startedFrom(1, second))

    expect(await screen.findByRole("link", { name: seriesLink(second.series_id) })).toBeTruthy()
  })

  it("reloads the open experiment for its own series and ignores another experiment", async () => {
    const detail = requestsTo(`${API_BASE}/experiments/${EXPERIMENT}`)
    await renderRoute(`/research/experiments/${EXPERIMENT}`)
    await screen.findByRole("heading", { level: 1 })
    const loaded = detail.count()

    emit(experimentChanged(1, OTHER_EXPERIMENT, [`experiments/${OTHER_EXPERIMENT}/experiment.yaml`]))
    await quiet()
    expect(detail.count()).toBe(loaded)

    emit(seriesProgressed(2, RESEARCH_SERIES.noninferiorHoldout, EXPERIMENT))
    await waitFor(() => {
      expect(detail.count()).toBeGreaterThan(loaded)
    })
  })

  it("leaves an unrelated page alone for an experiment edit and reloads it for any other file", async () => {
    const listed = requestsTo(`${API_BASE}/series`)
    await renderRoute("/research/series")
    await seriesTable()
    const loaded = listed.count()
    const experimentFile = `experiments/${EXPERIMENT}/experiment.yaml`

    emit(filesChanged(1, [experimentFile]))
    emit(experimentChanged(2, EXPERIMENT, [experimentFile]))
    await quiet()
    expect(listed.count()).toBe(loaded)

    emit(filesChanged(3, ["flows/support_case/flow.yaml"]))
    await waitFor(() => {
      expect(listed.count()).toBeGreaterThan(loaded)
    })
  })

  it("keeps one project stream across research pages and opens no stream per series", async () => {
    const router = await renderRoute("/research/series")
    fireEvent.click(within(await seriesTable()).getByRole("link", { name: seriesLink(RESEARCH_SERIES.escalationRunning) }))
    await waitFor(() => {
      expect(router.state.location.pathname).toBe(`/research/series/${RESEARCH_SERIES.escalationRunning}`)
    })
    await screen.findByRole("heading", { level: 1 })

    expect(FakeEventStream.on(PROJECT_EVENTS)).toHaveLength(1)
    expect(FakeEventStream.on(PROJECT_EVENTS)[0]?.closed).toBe(false)
    expect(FakeEventStream.on(`${API_BASE}/series/`)).toHaveLength(0)
  })
})
