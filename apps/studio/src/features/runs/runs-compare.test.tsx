import { fireEvent, screen, waitFor, within } from "@testing-library/react"
import { http, HttpResponse } from "msw"
import { describe, expect, it, vi } from "vitest"
import { API_BASE } from "@/api/client"
import { COMPLETED_RUN_ID, FAILED_RUN_ID, liveRuns } from "@/mocks/data/runs"
import { server } from "@/mocks/node"
import { renderRoute } from "@/test/render-route"
import { completedEvents, completedSnapshot } from "./test-support"

vi.mock("@/features/chat", () => ({
  ChatPanel: () => null,
}))

const RUNS = "/flows/support_case/runs"
const ref = (id: string): string => `#${id.slice(-6)}`
const MISSING_RUN = "01a0b1ff-0000-7000-8000-00000000abcd"

const comparison = (): Promise<HTMLElement> => screen.findByRole("region", { name: "Run comparison" })

const rowOf = (table: HTMLElement, label: string): HTMLElement => {
  const row = within(table).getAllByRole("row").find((candidate) => within(candidate).queryAllByRole("cell")[0]?.textContent === label)
  if (row === undefined) throw new Error(`no row ${label}`)
  return row
}

describe("RunsScreen run diff", () => {
  it("picks a second run of the same flow and compares it vertically", async () => {
    const router = await renderRoute(`${RUNS}?run=${COMPLETED_RUN_ID}`)
    fireEvent.click(await screen.findByRole("combobox", { name: "Compare with…" }))
    const list = await screen.findByRole("listbox", { name: "Runs to compare with" })
    const options = within(list).getAllByRole("option")
    const others = liveRuns.filter((run) => run.flow_id === "support_case" && run.run_id !== COMPLETED_RUN_ID)
    expect(options).toHaveLength(others.length)
    expect(options.some((option) => option.textContent.includes(ref(COMPLETED_RUN_ID)))).toBe(false)
    fireEvent.click(within(list).getByRole("option", { name: new RegExp(`^${ref(FAILED_RUN_ID)}`) }))
    await waitFor(() => {
      expect(router.state.location.search).toEqual({ run: COMPLETED_RUN_ID, compare: FAILED_RUN_ID })
    })
    const region = await comparison()
    expect(within(region).getByRole("heading", { name: `${ref(COMPLETED_RUN_ID)} compared with ${ref(FAILED_RUN_ID)}` })).toBeTruthy()
    expect(screen.queryByRole("navigation", { name: "Nodes in this run" })).toBeNull()
    expect(screen.getByRole("combobox", { name: `Compared with ${ref(FAILED_RUN_ID)}` })).toBeTruthy()
    const totals = within(region).getByRole("table", { name: "Run" })
    const status = rowOf(totals, "Status")
    expect(within(status).getAllByRole("cell").map((cell) => cell.textContent)).toEqual(["Status", "COMPLETED", "FAILED"])
    expect(within(status).getAllByRole("cell")[1]?.getAttribute("data-tone")).toBe("warning")
    expect(within(region).getByRole("heading", { name: "Run output" })).toBeTruthy()
  })

  it("highlights the executions that differ between the runs", async () => {
    const base = completedSnapshot()
    const other = {
      ...base,
      run_id: FAILED_RUN_ID,
      executions: base.executions.map((execution) => execution.address.node_id === "triage"
        ? { ...execution, model: "mistral/large", output_ref: { kind: "inline" as const, value: { intent: "question" } } }
        : execution),
    }
    const events = { items: completedEvents(), next_cursor: null, total_estimate: completedEvents().length }
    server.use(
      http.get(`${API_BASE}/runs/:runId`, ({ params }) => HttpResponse.json(params["runId"] === FAILED_RUN_ID ? other : base)),
      http.get(`${API_BASE}/runs/:runId/events/log`, () => HttpResponse.json(events)),
    )
    await renderRoute(`${RUNS}?run=${COMPLETED_RUN_ID}&compare=${FAILED_RUN_ID}`)
    const region = await comparison()
    expect(within(region).getByText(`1 of ${String(base.executions.length)} executions differs`)).toBeTruthy()
    const triage = within(region).getByRole("table", { name: "Comparison of triage" })
    const model = rowOf(triage, "Model")
    expect(within(model).getAllByRole("cell")[2]?.textContent).toContain("mistral/large")
    expect(within(model).getAllByRole("cell")[2]?.getAttribute("data-tone")).toBe("warning")
    expect(within(triage).getAllByRole("row").some((row) => row.textContent.startsWith("Output · intent"))).toBe(true)
    fireEvent.click(within(region).getByRole("button", { name: `${String(base.executions.length - 1)} executions without differences` }))
    expect(within(region).getByText(/prepare/u)).toBeTruthy()
    expect(within(region).getByText("The run outputs are the same")).toBeTruthy()
  })

  it("stops comparing and returns to the trace", async () => {
    const router = await renderRoute(`${RUNS}?run=${COMPLETED_RUN_ID}&compare=${FAILED_RUN_ID}`)
    const region = await comparison()
    fireEvent.click(within(region).getByRole("button", { name: "Stop comparing" }))
    await waitFor(() => {
      expect(router.state.location.search).toEqual({ run: COMPLETED_RUN_ID })
    })
    expect(await screen.findByRole("navigation", { name: "Nodes in this run" })).toBeTruthy()
    expect(screen.queryByRole("region", { name: "Run comparison" })).toBeNull()
  })

  it("says so when the second run cannot be loaded", async () => {
    const router = await renderRoute(`${RUNS}?run=${COMPLETED_RUN_ID}&compare=${MISSING_RUN}`)
    expect(await screen.findByText(`Run ${ref(MISSING_RUN)} could not be loaded for the comparison.`)).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Stop comparing" }))
    await waitFor(() => {
      expect(router.state.location.search).toEqual({ run: COMPLETED_RUN_ID })
    })
  })
})
