import type { ReactNode } from "react"
import { fireEvent, screen, waitFor, within } from "@testing-library/react"
import { http, HttpResponse } from "msw"
import { describe, expect, it, vi } from "vitest"
import { API_BASE } from "@/api/client"
import { COMPLETED_RUN_ID, liveRunSnapshots } from "@/mocks/data/runs"
import { server } from "@/mocks/node"
import { researchRuns } from "@/mocks/research"
import { renderRoute } from "@/test/render-route"

vi.mock("@/features/chat", () => ({
  ChatPanel: ({ header }: { readonly header: ReactNode }) => header,
  useChatThread: () => [],
  useChatScope: () => "flow",
}))

const RUNS = "/flows/support_case/runs"
const FLOW_ID = "support_case"
const REF_TAIL = 6
const EMPTY_PAGE = { items: [], next_cursor: null, total_estimate: 0 }

const ref = (id: string): string => `#${id.slice(-REF_TAIL)}`

const experimentRuns = researchRuns(liveRunSnapshots[COMPLETED_RUN_ID]).filter((run) => run.flow_id === FLOW_ID)

const newestExperimentRun = (): string => {
  const newest = experimentRuns[0]
  if (newest === undefined) throw new Error("missing experiment run fixture")
  return newest.run_id
}

const listChoice = async (): Promise<HTMLElement> => screen.findByRole("navigation", { name: "Runs to list" })

describe("RunsScreen experiment runs", () => {
  it("lists flow runs by default and experiment runs behind the toggle", async () => {
    const router = await renderRoute(RUNS)
    const choice = await listChoice()
    expect(within(choice).getByRole("link", { name: "Flow runs" }).getAttribute("aria-current")).toBe("true")
    fireEvent.click(within(choice).getByRole("link", { name: "Experiment runs" }))
    await waitFor(() => {
      expect(router.state.location.search).toEqual({ list: "experiment" })
    })
    const runId = newestExperimentRun()
    expect(await screen.findByRole("heading", { name: `Run ${ref(runId)}` })).toBeTruthy()
    expect(within(await listChoice()).getByRole("link", { name: "Experiment runs" }).getAttribute("aria-current")).toBe("true")
    fireEvent.click(screen.getByRole("combobox", { name: new RegExp(ref(runId)) }))
    const list = await screen.findByRole("listbox", { name: "Runs of this flow" })
    expect(screen.getByText(`${String(experimentRuns.length)} experiment runs in this flow`)).toBeTruthy()
    expect(within(list).getAllByRole("option")).toHaveLength(experimentRuns.length)
    expect(within(list).getAllByRole("option").every((option) => option.textContent.includes("experiment"))).toBe(true)
  })

  it("keeps the experiment list while switching between its runs", async () => {
    const router = await renderRoute(`${RUNS}?list=experiment`)
    const second = experimentRuns[1]
    if (second === undefined) throw new Error("missing second experiment run fixture")
    fireEvent.click(await screen.findByRole("combobox", { name: new RegExp(ref(newestExperimentRun())) }))
    const list = await screen.findByRole("listbox", { name: "Runs of this flow" })
    fireEvent.click(within(list).getByRole("option", { name: new RegExp(`^${ref(second.run_id)}`) }))
    await waitFor(() => {
      expect(router.state.location.search).toEqual({ run: second.run_id, list: "experiment" })
    })
  })

  it("sends an attempt of a series to the experiment runs of its flow", async () => {
    const runId = newestExperimentRun()
    const router = await renderRoute(`/runs/${runId}`)
    await waitFor(() => {
      expect(router.state.location.pathname).toBe(RUNS)
    })
    expect(router.state.location.search).toEqual({ run: runId, list: "experiment" })
    expect(await screen.findByRole("heading", { name: `Run ${ref(runId)}` })).toBeTruthy()
    expect(within(await listChoice()).getByRole("link", { name: "Experiment runs" }).getAttribute("aria-current")).toBe("true")
    expect(screen.queryByText("No runs yet")).toBeNull()
  })

  it("never says there are no runs while a run is open", async () => {
    server.use(http.get(`${API_BASE}/runs`, () => HttpResponse.json(EMPTY_PAGE)))
    const runId = newestExperimentRun()
    await renderRoute(`${RUNS}?run=${runId}`)
    expect(await screen.findByRole("heading", { name: `Run ${ref(runId)}` })).toBeTruthy()
    expect(screen.queryByText("No runs yet")).toBeNull()
    expect(screen.getByRole("combobox", { name: new RegExp(ref(runId)) })).toBeTruthy()
  })

  it("says a flow has no experiment runs yet", async () => {
    server.use(http.get(`${API_BASE}/runs`, () => HttpResponse.json(EMPTY_PAGE)))
    await renderRoute(`${RUNS}?list=experiment`)
    expect(await screen.findByText("No experiment runs yet")).toBeTruthy()
    expect(screen.queryByText("No runs yet")).toBeNull()
  })
})
