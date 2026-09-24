import { fireEvent, screen, waitFor, within } from "@testing-library/react"
import { http, HttpResponse } from "msw"
import { describe, expect, it, vi } from "vitest"
import { API_BASE } from "@/api/client"
import { liveFlowDetails } from "@/mocks/data/project"
import { server } from "@/mocks/node"
import { renderRoute } from "@/test/render-route"

vi.mock("@/features/chat", () => ({
  ChatPanel: () => null,
}))

const ORDER = liveFlowDetails.support_case?.order ?? []
const OPEN_CASE = "/flows/support_case/cases?case=bulb_app_offline_advice"
const RUN_ID = "01a0b4a1-0000-7000-8000-000000000001"

type RangeRule = (startIndex: number, startNode: string, endNode: string) => boolean

const preview = (available: RangeRule) => ({
  order: ORDER,
  ranges: ORDER.flatMap((startNode, startIndex) => ORDER.slice(startIndex).map((endNode) => {
    const open = available(startIndex, startNode, endNode)
    return {
      start_node: startNode,
      end_node: endNode,
      available: open,
      missing: open ? [] : [{ case_name: "bulb_app_offline_advice", reference: "nodes.prepare.output", reason: "No saved prepare output" }],
    }
  })),
})

const serveRanges = (available: RangeRule): void => {
  server.use(http.post(`${API_BASE}/flows/:flowId/dataset-range`, () => HttpResponse.json(preview(available))))
}

const runPanel = async (): Promise<HTMLElement> => {
  const heading = await screen.findByRole("heading", { name: "Run this case" })
  const panel = heading.closest("section")
  if (panel === null) throw new Error("missing run panel")
  return panel
}

describe("CaseRun", () => {
  it("starts the open case over the chosen stages and opens the run", async () => {
    let started: unknown = null
    serveRanges((startIndex) => startIndex <= 1)
    server.use(
      http.post(`${API_BASE}/runs`, async ({ request }) => {
        started = await request.json()
        return HttpResponse.json({ run_id: RUN_ID }, { status: 201 })
      }),
    )
    const router = await renderRoute(OPEN_CASE)
    const panel = await runPanel()
    const start = within(panel).getByRole("combobox", { name: "From stage" })
    expect(start).toHaveProperty("value", "prepare")
    expect(within(panel).getByRole("combobox", { name: "To stage" })).toHaveProperty("value", "finalize")
    fireEvent.change(start, { target: { value: "triage" } })
    expect(start).toHaveProperty("value", "triage")
    const button = within(panel).getByRole("button", { name: "Start run" })
    await waitFor(() => {
      expect(button).toHaveProperty("disabled", false)
    })
    fireEvent.click(button)
    await waitFor(() => {
      expect(started).toMatchObject({ dataset_item_id: "support_case_cases/bulb_app_offline_advice", start_node: "triage", end_node: "finalize", selected_nodes: null })
    })
    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/flows/support_case/runs")
    })
    expect(router.state.location.search).toEqual({ run: RUN_ID })
    await waitFor(() => {
      expect(router.state.status).toBe("idle")
    })
  })

  it("keeps the start closed on a range the case values cannot reach and names what is missing", async () => {
    serveRanges((_startIndex, startNode, endNode) => startNode === "triage" && endNode === "triage")
    await renderRoute(OPEN_CASE)
    const panel = await runPanel()
    await waitFor(() => {
      expect(within(panel).getByText(/^Cannot run: .*No saved prepare output/u)).toBeTruthy()
    })
    expect(within(panel).getByRole("button", { name: "Start run" })).toHaveProperty("disabled", true)
    fireEvent.change(within(panel).getByRole("combobox", { name: "To stage" }), { target: { value: "triage" } })
    fireEvent.change(within(panel).getByRole("combobox", { name: "From stage" }), { target: { value: "triage" } })
    await waitFor(() => {
      expect(within(panel).getByRole("button", { name: "Start run" })).toHaveProperty("disabled", false)
    })
    expect(within(panel).getByText("Earlier stages come from the case")).toBeTruthy()
    fireEvent.change(within(panel).getByRole("combobox", { name: "From stage" }), { target: { value: "vote" } })
    expect(within(panel).getByRole("combobox", { name: "To stage" })).toHaveProperty("value", "vote")
    await waitFor(() => {
      expect(within(panel).getByRole("button", { name: "Start run" })).toHaveProperty("disabled", true)
    })
  })

  it("shows why the range check failed", async () => {
    server.use(http.post(`${API_BASE}/flows/:flowId/dataset-range`, () => HttpResponse.json({ message: "The index is rebuilding" }, { status: 503 })))
    await renderRoute(OPEN_CASE)
    const panel = await runPanel()
    await waitFor(() => {
      expect(within(panel).getByRole("button", { name: "Start run" })).toHaveProperty("disabled", true)
    })
    expect(await within(panel).findByText("The index is rebuilding")).toBeTruthy()
  })
})
