import { fireEvent, screen, waitFor, within } from "@testing-library/react"
import { http, HttpResponse } from "msw"
import { describe, expect, it } from "vitest"
import { API_BASE } from "@/api/client"
import { liveFlowDetails } from "@/mocks/data/project"
import { server } from "@/mocks/node"
import { renderRoute } from "@/test/render-route"

const order = liveFlowDetails.support_case?.order ?? []

function rangePreview(caseNames: readonly string[]) {
  const canStartAtTriage = caseNames.length === 1 && caseNames[0] === "bulb_app_offline_advice"
  return {
    order,
    ranges: order.flatMap((startNode, startIndex) => order.slice(startIndex).map((endNode) => {
      const available = startIndex === 0 || startIndex === 1 && canStartAtTriage
      return {
        start_node: startNode,
        end_node: endNode,
        available,
        missing: available ? [] : [{ case_name: caseNames.at(-1) ?? "", reference: "nodes.prepare.output", reason: "No saved prepare output" }],
      }
    })),
  }
}

describe("DatasetRun", () => {
  it("shows one snapped node range and sends its boundaries when starting the open case", async () => {
    let started: unknown = null
    server.use(
      http.post(`${API_BASE}/flows/:flowId/dataset-range`, async ({ request }) => {
        const body: unknown = await request.json()
        const caseNames = typeof body === "object" && body !== null && "case_names" in body && Array.isArray(body.case_names)
          ? body.case_names.filter((name): name is string => typeof name === "string") : []
        return HttpResponse.json(rangePreview(caseNames))
      }),
      http.post(`${API_BASE}/runs`, async ({ request }) => {
        started = await request.json()
        return HttpResponse.json({ run_id: "01a0b4a1-0000-7000-8000-000000000001" }, { status: 201 })
      }),
    )

    await renderRoute("/flows/support_case/datasets?dataset=support_case_cases&case=bulb_app_offline_advice")
    const panel = await screen.findByRole("heading", { name: "Run this dataset" })
    const scope = panel.closest("section") ?? document.body
    expect(within(scope).queryByRole("button", { name: "Entire flow" })).toBeNull()
    expect(within(scope).queryByRole("button", { name: "Selected nodes" })).toBeNull()
    const start = await within(scope).findByRole("slider", { name: "Start node" })
    const end = within(scope).getByRole("slider", { name: "End node" })
    expect(start.getAttribute("aria-valuetext")).toBe("prepare")
    expect(end.getAttribute("aria-valuetext")).toBe("finalize")
    expect(within(scope).getByText("record").closest("[data-start-available]")?.getAttribute("data-start-available")).toBe("false")

    fireEvent.keyDown(start, { key: "ArrowRight" })
    await waitFor(() => { expect(start.getAttribute("aria-valuetext")).toBe("triage") })
    fireEvent.click(within(scope).getByRole("button", { name: "Start run" }))
    await waitFor(() => { expect(started).not.toBeNull() })
    expect(started).toMatchObject({ start_node: "triage", end_node: "finalize", selected_nodes: null })
  })

  it("reaches a single middle stage even when every intermediate range is unavailable", async () => {
    server.use(http.post(`${API_BASE}/flows/:flowId/dataset-range`, () => HttpResponse.json({
      order,
      ranges: order.flatMap((startNode, startIndex) => order.slice(startIndex).map((endNode) => {
        const available = startNode === "triage" && endNode === "triage"
        return {
          start_node: startNode,
          end_node: endNode,
          available,
          missing: available ? [] : [{ case_name: "bulb_app_offline_advice", reference: "nodes.prepare.output", reason: "Boundary values are missing" }],
        }
      })),
    })))

    await renderRoute("/flows/support_case/datasets?dataset=support_case_cases&case=bulb_app_offline_advice")
    const start = await screen.findByRole("slider", { name: "Start node" })
    const end = screen.getByRole("slider", { name: "End node" })
    const timeline = screen.getByTestId("dataset-range-timeline")
    expect(timeline.className).not.toContain("overflow-x-auto")
    expect(timeline.querySelector('[class*="overflow-x-auto"]')).toBeNull()
    expect(timeline.querySelector('[style*="min-width"]')).toBeNull()
    expect(within(timeline).getByText("finalize")).toBeTruthy()
    await waitFor(() => { expect(screen.getByText(/Boundary values are missing/u)).toBeTruthy() })
    expect(screen.getByRole("button", { name: "Start run" })).toHaveProperty("disabled", true)

    fireEvent.keyDown(start, { key: "ArrowRight" })
    await waitFor(() => { expect(start.getAttribute("aria-valuetext")).toBe("triage") })
    fireEvent.keyDown(end, { key: "Home" })
    await waitFor(() => {
      expect(start.getAttribute("aria-valuetext")).toBe("triage")
      expect(end.getAttribute("aria-valuetext")).toBe("triage")
      expect(screen.getByRole("button", { name: "Start run" })).not.toHaveProperty("disabled", true)
    })
    fireEvent.keyDown(end, { key: "ArrowRight" })
    await waitFor(() => {
      expect(end.getAttribute("aria-valuetext")).toBe("vote")
      expect(screen.getByRole("button", { name: "Start run" })).toHaveProperty("disabled", true)
    })
    fireEvent.keyDown(end, { key: "ArrowLeft" })
    await waitFor(() => { expect(end.getAttribute("aria-valuetext")).toBe("triage") })
  })

  it("selects only the clicked stage, even when that stage cannot start a run", async () => {
    server.use(http.post(`${API_BASE}/flows/:flowId/dataset-range`, () => HttpResponse.json(rangePreview(["bulb_app_offline_advice"]))))

    await renderRoute("/flows/support_case/datasets?dataset=support_case_cases&case=bulb_app_offline_advice")
    const timeline = screen.getByTestId("dataset-range-timeline")
    const start = await screen.findByRole("slider", { name: "Start node" })
    const end = screen.getByRole("slider", { name: "End node" })

    fireEvent.click(within(timeline).getByRole("button", { name: "Select only triage" }))
    await waitFor(() => {
      expect(start.getAttribute("aria-valuetext")).toBe("triage")
      expect(end.getAttribute("aria-valuetext")).toBe("triage")
      expect(screen.getByRole("button", { name: "Start run" })).not.toHaveProperty("disabled", true)
    })

    fireEvent.click(within(timeline).getByRole("button", { name: "Select only vote" }))
    await waitFor(() => {
      expect(start.getAttribute("aria-valuetext")).toBe("vote")
      expect(end.getAttribute("aria-valuetext")).toBe("vote")
      expect(screen.getByRole("button", { name: "Start run" })).toHaveProperty("disabled", true)
    })
  })

  it("resizes either edge independently when its slider thumb is dragged", async () => {
    server.use(http.post(`${API_BASE}/flows/:flowId/dataset-range`, () => HttpResponse.json(rangePreview(["bulb_app_offline_advice"]))))

    await renderRoute("/flows/support_case/datasets?dataset=support_case_cases&case=bulb_app_offline_advice")
    const start = await screen.findByRole("slider", { name: "Start node" })
    const end = screen.getByRole("slider", { name: "End node" })
    const track = screen.getByTestId("dataset-range-track")
    Object.defineProperty(track, "getBoundingClientRect", {
      configurable: true,
      value: () => ({ x: 0, y: 0, left: 0, top: 0, width: order.length * 100, height: 48, right: order.length * 100, bottom: 48 }),
    })
    for (const thumb of [start, end]) {
      let captured: number | null = null
      Object.defineProperty(thumb, "setPointerCapture", { configurable: true, value: (pointerId: number) => { captured = pointerId } })
      Object.defineProperty(thumb, "hasPointerCapture", { configurable: true, value: (pointerId: number) => captured === pointerId })
      Object.defineProperty(thumb, "releasePointerCapture", { configurable: true, value: () => { captured = null } })
    }

    fireEvent.keyDown(start, { key: "ArrowRight" })
    fireEvent.keyDown(end, { key: "Home" })
    fireEvent.keyDown(end, { key: "ArrowRight" })
    fireEvent.keyDown(end, { key: "ArrowRight" })
    await waitFor(() => {
      expect(start.getAttribute("aria-valuetext")).toBe("triage")
      expect(end.getAttribute("aria-valuetext")).toBe("tally")
    })

    fireEvent.pointerDown(start, { pointerId: 1, clientX: 150 })
    fireEvent.pointerMove(start, { pointerId: 1, clientX: 250 })
    fireEvent.pointerUp(start, { pointerId: 1, clientX: 250 })
    await waitFor(() => {
      expect(start.getAttribute("aria-valuetext")).toBe("vote")
      expect(end.getAttribute("aria-valuetext")).toBe("tally")
    })

    fireEvent.pointerDown(end, { pointerId: 2, clientX: 350 })
    fireEvent.pointerMove(end, { pointerId: 2, clientX: 450 })
    fireEvent.pointerUp(end, { pointerId: 2, clientX: 450 })
    await waitFor(() => {
      expect(start.getAttribute("aria-valuetext")).toBe("vote")
      expect(end.getAttribute("aria-valuetext")).toBe("intent")
    })
  })

  it("drags the selected range as one clip and keeps its length at either edge", async () => {
    server.use(http.post(`${API_BASE}/flows/:flowId/dataset-range`, () => HttpResponse.json(rangePreview(["bulb_app_offline_advice"]))))

    await renderRoute("/flows/support_case/datasets?dataset=support_case_cases&case=bulb_app_offline_advice")
    const start = await screen.findByRole("slider", { name: "Start node" })
    const end = screen.getByRole("slider", { name: "End node" })
    const clip = screen.getByRole("button", { name: "Move selected range" })
    const track = screen.getByTestId("dataset-range-track")
    Object.defineProperty(track, "getBoundingClientRect", {
      configurable: true,
      value: () => ({ x: 0, y: 0, left: 0, top: 0, width: 1720, height: 36, right: 1720, bottom: 36 }),
    })

    fireEvent.keyDown(start, { key: "ArrowRight" })
    fireEvent.keyDown(end, { key: "Home" })
    fireEvent.keyDown(end, { key: "ArrowRight" })
    fireEvent.keyDown(end, { key: "ArrowRight" })
    await waitFor(() => {
      expect(start.getAttribute("aria-valuetext")).toBe("triage")
      expect(end.getAttribute("aria-valuetext")).toBe("tally")
    })

    fireEvent.pointerDown(clip, { pointerId: 1, clientX: 200 })
    fireEvent.pointerMove(clip, { pointerId: 1, clientX: 400 })
    fireEvent.pointerUp(clip, { pointerId: 1, clientX: 400 })
    await waitFor(() => {
      expect(start.getAttribute("aria-valuetext")).toBe("tally")
      expect(end.getAttribute("aria-valuetext")).toBe("case_form")
    })

    fireEvent.pointerDown(clip, { pointerId: 2, clientX: 400 })
    fireEvent.pointerMove(clip, { pointerId: 2, clientX: 5000 })
    fireEvent.pointerUp(clip, { pointerId: 2, clientX: 5000 })
    await waitFor(() => {
      expect(start.getAttribute("aria-valuetext")).toBe("clip")
      expect(end.getAttribute("aria-valuetext")).toBe("finalize")
    })

    fireEvent.keyDown(clip, { key: "ArrowLeft" })
    await waitFor(() => {
      expect(start.getAttribute("aria-valuetext")).toBe("voice")
      expect(end.getAttribute("aria-valuetext")).toBe("approvals")
    })

    fireEvent.pointerDown(clip, { pointerId: 3, clientX: 400 })
    fireEvent.pointerMove(clip, { pointerId: 3, clientX: -5000 })
    fireEvent.pointerUp(clip, { pointerId: 3, clientX: -5000 })
    await waitFor(() => {
      expect(start.getAttribute("aria-valuetext")).toBe("prepare")
      expect(end.getAttribute("aria-valuetext")).toBe("vote")
    })
  })
})
