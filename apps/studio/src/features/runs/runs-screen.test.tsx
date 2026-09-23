import type { ReactNode } from "react"
import { fireEvent, screen, waitFor, within } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { http, HttpResponse } from "msw"
import { API_BASE } from "@/api/client"
import { server } from "@/mocks/node"
import { liveDatasets } from "@/mocks/data/datasets"
import { COMPLETED_RUN_ID, FAILED_RUN_ID, liveExecutionDetails, liveRunSnapshots, liveRuns } from "@/mocks/data/runs"
import { renderRoute } from "@/test/render-route"
import { TEST_NOW } from "@/test/clock"
import { isoDate } from "./start-form"
import type { PresentationTarget } from "./presentation-data"

vi.mock("@/features/chat", () => ({
  ChatPanel: ({ header }: { readonly header: ReactNode }) => header,
  useChatThread: () => [],
  useChatScope: () => "flow",
}))

const RUNS = "/flows/support_case/runs"
const FLOW_ID = "support_case"
const REF_TAIL = 6
const ref = (id: string): string => `#${id.slice(-REF_TAIL)}`

const flowRuns = liveRuns.filter((run) => run.flow_id === FLOW_ID)
const ROW_LABELS = ["Call", "Agent", "Model", "Input", "Prompt", "Output", "Post check"]

const traceRow = (table: HTMLElement, header: string | RegExp): HTMLElement => {
  const row = within(table)
    .getAllByRole("row")
    .find((candidate) => within(candidate).queryByRole("rowheader", { name: header }) !== null)
  if (row === undefined) throw new Error(`no trace row for ${String(header)}`)
  return row
}

const firstButton = (row: HTMLElement): HTMLElement => {
  const button = within(row).getAllByRole("button")[0]
  if (button === undefined) throw new Error("the trace row has no activatable cell")
  return button
}

const isPresentationTarget = (value: unknown): value is PresentationTarget => {
  if (typeof value !== "object" || value === null || !("side" in value) || !("address" in value)) return false
  const address = value.address
  return (value.side === "input" || value.side === "output") && typeof address === "object" && address !== null &&
    "node_id" in address && typeof address.node_id === "string"
}

const openStartForm = async (): Promise<void> => {
  fireEvent.click(await screen.findByRole("button", { name: "Enter input manually" }))
  await screen.findByRole("button", { name: "Start run" })
}

describe("RunsScreen", () => {
  it("keeps the selected run and node when opening an old English URL", async () => {
    const router = await renderRoute(`/en/flows/support_case/runs?run=${FAILED_RUN_ID}&stage=search_kb%7C%7C%7C`)
    expect(router.state.location.pathname).toBe(RUNS)
    expect(router.state.location.search).toEqual({ run: FAILED_RUN_ID, stage: "search_kb|||" })
  })

  it("opens datasets to start a reusable run", async () => {
    const router = await renderRoute(RUNS)
    fireEvent.click(await screen.findByRole("button", { name: "Start a run" }))
    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/flows/support_case/datasets")
    })
  })

  it("selects the newest run when entering Runs without a run ID", async () => {
    await renderRoute(RUNS)
    const newest = flowRuns[0]
    if (newest === undefined) throw new Error("missing latest run fixture")
    const picker = await screen.findByRole("combobox", { name: new RegExp(ref(newest.run_id)) })
    expect(screen.queryByRole("navigation", { name: "Runs of this flow" })).toBeNull()
    expect(await screen.findByRole("heading", { name: `Run ${ref(newest.run_id)}` })).toBeTruthy()
    fireEvent.click(picker)
    const list = await screen.findByRole("listbox", { name: "Runs of this flow" })
    const search = screen.getByRole("combobox", { name: "Search runs" })
    const count = screen.getByText(`${String(flowRuns.length)} runs in this flow`)
    expect(search.compareDocumentPosition(count) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(count.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    const items = within(list).getAllByRole("option")
    expect(items).toHaveLength(flowRuns.length)
    const first = items[0]
    if (first === undefined) throw new Error("missing latest option")
    expect(first.textContent).toContain(ref(flowRuns[0]?.run_id ?? ""))
    expect(within(first).getByText("support_case_cases")).toBeTruthy()
    expect(within(first).getByText("bulb_app_offline_advice")).toBeTruthy()
    expect(first.textContent).toContain("prepare")
    expect(first.textContent).toContain("triage")
    expect(first.getAttribute("data-checked")).toBe("true")
    expect(screen.queryByText("Select a run to see its executions")).toBeNull()
  })

  it("opens the newest run when clicking Runs in the top navigation", async () => {
    const router = await renderRoute("/flows/support_case/nodes")
    const navigation = await screen.findByRole("navigation", { name: "Flow views" })
    fireEvent.click(within(navigation).getByRole("link", { name: "Runs" }))
    const newest = flowRuns[0]
    if (newest === undefined) throw new Error("missing latest run fixture")
    await waitFor(() => {
      expect(router.state.location.pathname).toBe(RUNS)
    })
    expect(await screen.findByRole("heading", { name: `Run ${ref(newest.run_id)}` })).toBeTruthy()
  })

  it("returns to the newest run when clicking the Runs tab from an older run", async () => {
    const router = await renderRoute(`${RUNS}?run=${COMPLETED_RUN_ID}`)
    expect(await screen.findByRole("heading", { name: `Run ${ref(COMPLETED_RUN_ID)}` })).toBeTruthy()
    const navigation = screen.getByRole("navigation", { name: "Flow views" })
    fireEvent.click(within(navigation).getByRole("link", { name: "Runs" }))
    const newest = flowRuns[0]
    if (newest === undefined) throw new Error("missing latest run fixture")
    expect(await screen.findByRole("heading", { name: `Run ${ref(newest.run_id)}` }, { timeout: 10_000 })).toBeTruthy()
    expect(router.state.location.search).toEqual({})
  })

  it("keeps the no-runs state for a flow without a run", async () => {
    server.use(http.get(`${API_BASE}/runs`, () => HttpResponse.json({ items: [], next_cursor: null, total_estimate: 0 })))
    await renderRoute(RUNS)
    expect(await screen.findByText("No runs yet")).toBeTruthy()
    expect(screen.queryByRole("combobox", { name: /^Run #/ })).toBeNull()
  })

  it("filters the available runs by reference", async () => {
    await renderRoute(RUNS)
    fireEvent.click(await screen.findByRole("combobox", { name: new RegExp(ref(flowRuns[0]?.run_id ?? "")) }))
    const search = await screen.findByRole("combobox", { name: "Search runs" })
    fireEvent.change(search, { target: { value: ref(COMPLETED_RUN_ID) } })
    const list = await screen.findByRole("listbox", { name: "Runs of this flow" })
    const options = within(list).getAllByRole("option")
    expect(options).toHaveLength(1)
    expect(options[0]?.textContent).toContain(ref(COMPLETED_RUN_ID))
    fireEvent.change(search, { target: { value: "no-such-run" } })
    expect(await screen.findByText("No matching runs")).toBeTruthy()
  })

  it("shows the selected run on the trigger and switches runs through the picker", async () => {
    const router = await renderRoute(`${RUNS}?run=${COMPLETED_RUN_ID}`)
    const picker = await screen.findByRole("combobox", { name: new RegExp(ref(COMPLETED_RUN_ID)) })
    fireEvent.click(picker)
    const list = await screen.findByRole("listbox", { name: "Runs of this flow" })
    expect(list.querySelectorAll('[cmdk-item][data-selected="true"]')).toHaveLength(0)
    expect(within(list).getByRole("option", { name: new RegExp(`^${ref(COMPLETED_RUN_ID)}`) }).getAttribute("data-checked")).toBe("true")
    fireEvent.keyDown(screen.getByRole("combobox", { name: "Search runs" }), { key: "ArrowDown" })
    expect(list.querySelectorAll('[cmdk-item][data-selected="true"]')).toHaveLength(1)
    fireEvent.click(within(list).getByRole("option", { name: new RegExp(`^${ref(FAILED_RUN_ID)}`) }))
    await waitFor(() => {
      expect(router.state.location.search).toMatchObject({ run: FAILED_RUN_ID })
    })
    expect(
      await screen.findByRole("combobox", { name: new RegExp(ref(FAILED_RUN_ID)) }, { timeout: 10_000 }),
    ).toBeTruthy()
  })

  it("keeps the selected run compact and shows dataset and nodes in open options", async () => {
    const latest = flowRuns[0]
    const other = flowRuns[1]
    if (latest === undefined || other === undefined) throw new Error("missing run fixtures")
    server.use(http.get(`${API_BASE}/runs`, () => HttpResponse.json({
      items: flowRuns.map((run) => run.run_id === latest.run_id
        ? { ...run, dataset_item_id: "support_case_cases/bulb_app_offline_advice", selected_nodes: ["prepare", "triage"] }
        : { ...run, dataset_item_id: null, selected_nodes: null }),
      next_cursor: null,
      total_estimate: flowRuns.length,
    })))

    await renderRoute(RUNS)
    const picker = await screen.findByRole("combobox", { name: new RegExp(ref(latest.run_id)) })
    expect(picker.textContent).toContain(ref(latest.run_id))
    expect(picker.textContent).toContain("FAILED")
    expect(picker.textContent).not.toContain("support_case_cases")
    expect(picker.textContent).not.toContain("prepare")

    fireEvent.click(picker)
    const list = await screen.findByRole("listbox", { name: "Runs of this flow" })
    const options = within(list).getAllByRole("option")
    expect(options[0]?.textContent).toContain(ref(latest.run_id))
    expect(options[0]?.textContent).toContain("FAILED")
    expect(options[0]?.textContent).not.toContain("Latest")
    const selectedOption = options[0]
    if (selectedOption === undefined) throw new Error("missing latest option")
    const datasetLabel = within(selectedOption).getByText("support_case_cases")
    const caseLabel = within(selectedOption).getByText("bulb_app_offline_advice")
    const statusTag = within(selectedOption).getByText("FAILED")
    expect(selectedOption.getAttribute("data-checked")).toBe("true")
    expect(selectedOption.getAttribute("data-tone")).toBeNull()
    expect(selectedOption.className).not.toContain("border-l")
    expect(selectedOption.className).toContain("data-[checked=true]:bg-[color-mix")
    expect(datasetLabel.className).toContain("text-foreground")
    expect(statusTag.className).toContain("bg-tone-bg")
    expect(selectedOption.querySelectorAll("span.inline-flex.border.font-mono")).toHaveLength(1)
    expect(caseLabel.className).toContain("font-medium")
    expect(caseLabel.parentElement).not.toBe(datasetLabel.parentElement)
    const optionText = selectedOption.textContent
    expect(optionText.indexOf("bulb_app_offline_advice")).toBeLessThan(optionText.indexOf("support_case_cases"))
    expect(selectedOption.textContent).toContain("prepare, triage")
    expect(selectedOption.getAttribute("title")).toContain("bulb_app_offline_advice")
    expect(selectedOption.getAttribute("title")).toContain("prepare, triage")
    const otherOption = options[1]
    if (otherOption === undefined) throw new Error("missing older option")
    expect(otherOption.textContent).toContain("No dataset")
    expect(otherOption.textContent).toContain("Entire flow")
    expect(within(otherOption).queryByText("Case")).toBeNull()

    const search = screen.getByRole("combobox", { name: "Search runs" })
    fireEvent.change(search, { target: { value: "prepare" } })
    await waitFor(() => { expect(within(list).getAllByRole("option")).toHaveLength(1) })
    fireEvent.change(search, { target: { value: "support_case_cases" } })
    await waitFor(() => { expect(within(list).getAllByRole("option")).toHaveLength(1) })
    fireEvent.change(search, { target: { value: "bulb_app_offline_advice" } })
    await waitFor(() => { expect(within(list).getAllByRole("option")).toHaveLength(1) })
  })

  it("keeps long node scopes scannable while searching every selected node", async () => {
    const latest = flowRuns[0]
    if (latest === undefined) throw new Error("missing latest run fixture")
    server.use(http.get(`${API_BASE}/runs`, () => HttpResponse.json({
      items: flowRuns.map((run) => run.run_id === latest.run_id
        ? { ...run, selected_nodes: ["prepare", "triage", "vote", "route"] }
        : run),
      next_cursor: null,
      total_estimate: flowRuns.length,
    })))

    await renderRoute(RUNS)
    fireEvent.click(await screen.findByRole("combobox", { name: new RegExp(ref(latest.run_id)) }))
    const list = await screen.findByRole("listbox", { name: "Runs of this flow" })
    const first = within(list).getAllByRole("option")[0]
    if (first === undefined) throw new Error("missing latest option")
    expect(within(first).getByText("prepare, triage, vote +1")).toBeTruthy()
    expect(first.getAttribute("title")).toContain("prepare, triage, vote, route")

    fireEvent.change(screen.getByRole("combobox", { name: "Search runs" }), { target: { value: "route" } })
    await waitFor(() => { expect(within(list).getAllByRole("option")).toHaveLength(1) })
  })

  it("identifies stage-range runs and shows the current case's saved node outputs", async () => {
    const snapshot = liveRunSnapshots[COMPLETED_RUN_ID]
    const latest = flowRuns[0]
    if (snapshot === undefined || latest === undefined) throw new Error("Missing run fixtures")
    server.use(
      http.get(`${API_BASE}/runs`, () => HttpResponse.json({
        items: flowRuns.map((run) => run.run_id === latest.run_id
          ? { ...run, dataset_item_id: "support_case_cases/bulb_app_offline_advice", selected_nodes: null, start_node: "triage", end_node: "route" }
          : run),
        next_cursor: null,
        total_estimate: flowRuns.length,
      })),
      http.get(`${API_BASE}/runs/:runId`, () => HttpResponse.json({
        ...snapshot,
        dataset_item_id: "support_case_cases/bulb_app_offline_advice",
        selected_nodes: null,
        start_node: "triage",
        end_node: "route",
      })),
      http.get(`${API_BASE}/datasets/support_case_cases/cases/bulb_app_offline_advice`, () => HttpResponse.json({
        name: "bulb_app_offline_advice",
        inputs: { message: "case input" },
        node_outputs: { prepare: { message: "saved upstream output" } },
      })),
    )

    await renderRoute(`${RUNS}?run=${COMPLETED_RUN_ID}`)
    fireEvent.click(await screen.findByRole("combobox", { name: /Run #/u }))
    const list = await screen.findByRole("listbox", { name: "Runs of this flow" })
    expect(within(list).getByText("Stages: triage → route")).toBeTruthy()
    fireEvent.click(await screen.findByRole("button", { name: /Dataset support_case_cases/u }))
    const dialog = await screen.findByRole("dialog", { name: "Dataset support_case_cases" })
    fireEvent.mouseDown(within(dialog).getByRole("tab", { name: "Used for this run" }))
    expect(within(dialog).getByText("Stages: triage → route")).toBeTruthy()
    fireEvent.mouseDown(within(dialog).getByRole("tab", { name: "Current dataset file" }))
    expect(await within(dialog).findByText("Saved node outputs")).toBeTruthy()
    expect(within(dialog).getByText("saved upstream output")).toBeTruthy()
  })

  it("shows the used dataset above the metrics and opens its recorded and current configuration", async () => {
    const snapshot = liveRunSnapshots[COMPLETED_RUN_ID]
    if (snapshot === undefined) throw new Error("Missing completed run fixture")
    server.use(http.get(`${API_BASE}/runs/:runId`, () => HttpResponse.json({
      ...snapshot,
      dataset_item_id: "support_case_cases/bulb_app_offline_advice",
      mode: "dryrun",
      selected_nodes: ["prepare", "triage"],
      input_ref: { kind: "inline", value: { message: "recorded input" } },
      context: { date: "2026-09-18", time_zone: null, locale: null, tenant_id: "lumen" },
    })))

    await renderRoute(`${RUNS}?run=${COMPLETED_RUN_ID}`)
    const trigger = await screen.findByRole("button", { name: /Dataset support_case_cases.*bulb_app_offline_advice/u })
    expect(trigger.textContent).toContain("support_case_cases")
    expect(trigger.textContent).not.toContain("bulb_app_offline_advice")
    const metrics = screen.getByText("Cost")
    expect(trigger.compareDocumentPosition(metrics) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    fireEvent.click(trigger)

    const dialog = await screen.findByRole("dialog", { name: "Dataset support_case_cases" })
    expect(within(dialog).getAllByText("bulb_app_offline_advice").length).toBeGreaterThan(0)
    expect(await within(dialog).findByText("datasets/support_case_cases.yaml")).toBeTruthy()
    expect(within(dialog).getByText("dev")).toBeTruthy()
    expect(within(dialog).queryByText("strip_flicker_credit")).toBeNull()
    expect(within(dialog).queryByRole("combobox", { name: "Search cases" })).toBeNull()
    expect(within(dialog).getByRole("link", { name: "Open dataset page" }).getAttribute("href")).toContain("case=bulb_app_offline_advice")
    fireEvent.mouseDown(within(dialog).getByRole("tab", { name: "Used for this run" }))
    const recorded = within(dialog).getByRole("tabpanel", { name: "Used for this run" })
    expect(within(recorded).getByText("Case used for this run")).toBeTruthy()
    expect(within(recorded).getByText("bulb_app_offline_advice")).toBeTruthy()
    expect(await within(dialog).findByText("recorded input")).toBeTruthy()
    expect(within(dialog).getByText("prepare, triage")).toBeTruthy()
    expect(within(dialog).getByRole("link", { name: "Open dataset page" })).toBeTruthy()
  })

  it("shows only the run's case even when the dataset contains 50 cases", async () => {
    const snapshot = liveRunSnapshots[COMPLETED_RUN_ID]
    if (snapshot === undefined) throw new Error("Missing completed run fixture")
    const names = ["bulb_app_offline_advice", ...Array.from({ length: 49 }, (_, index) => `case_${String(index + 1).padStart(2, "0")}`)]
    const summary = liveDatasets.find((item) => item.dataset_id === "support_case_cases")
    if (summary === undefined) throw new Error("Missing dataset fixture")
    server.use(
      http.get(`${API_BASE}/runs/:runId`, () => HttpResponse.json({ ...snapshot, dataset_item_id: "support_case_cases/bulb_app_offline_advice" })),
      http.get(`${API_BASE}/datasets/:datasetId`, () => HttpResponse.json({ ...summary, cases: names.length })),
      http.get(`${API_BASE}/datasets/:datasetId/case-names`, () => HttpResponse.json({ items: names, next_cursor: null, total_estimate: names.length })),
    )

    await renderRoute(`${RUNS}?run=${COMPLETED_RUN_ID}`)
    fireEvent.click(await screen.findByRole("button", { name: /Dataset support_case_cases/u }))
    const dialog = await screen.findByRole("dialog", { name: "Dataset support_case_cases" })
    expect(await within(dialog).findByText("datasets/support_case_cases.yaml")).toBeTruthy()
    expect(within(dialog).queryByRole("listbox", { name: "Cases in this dataset" })).toBeNull()
    expect(within(dialog).queryByRole("combobox", { name: "Search cases" })).toBeNull()
    expect(within(dialog).queryByText("case_49")).toBeNull()
    expect(within(dialog).getAllByText("bulb_app_offline_advice").length).toBeGreaterThan(0)
  })

  it("shows the metrics of the selected run", async () => {
    await renderRoute(`${RUNS}?run=${COMPLETED_RUN_ID}`)
    expect(await screen.findByRole("heading", { name: `Run ${ref(COMPLETED_RUN_ID)}` })).toBeTruthy()
    expect(screen.getByText("42 / 42")).toBeTruthy()
    expect(screen.getByText("1 failed node")).toBeTruthy()
  })

  it("restores the node named in the run URL after the trace loads", async () => {
    const scroll = vi.spyOn(Element.prototype, "scrollIntoView")
    const stage = "finalize|||"
    const router = await renderRoute(`${RUNS}?run=${COMPLETED_RUN_ID}&stage=${encodeURIComponent(stage)}`)
    await screen.findByRole("navigation", { name: "Nodes in this run" })
    await waitFor(() => {
      expect(scroll.mock.instances.some((element) => element instanceof Element && element.id === `stage-${stage}`)).toBe(true)
    })
    expect(router.state.location.search).toMatchObject({ run: COMPLETED_RUN_ID, stage })
    expect(screen.queryByRole("dialog")).toBeNull()
    scroll.mockRestore()
  })

  it("jumps between nodes and saves the focused node in the URL", async () => {
    const scroll = vi.spyOn(Element.prototype, "scrollIntoView")
    const router = await renderRoute(`${RUNS}?run=${COMPLETED_RUN_ID}`)
    const navigation = await screen.findByRole("navigation", { name: "Nodes in this run" })
    expect(navigation.parentElement?.parentElement?.getAttribute("data-scroll-restoration-id")).toBe("page")
    expect(navigation.className).not.toMatch(/shadow|rounded|max-w/)
    expect(navigation.className).toContain("bg-transparent")
    expect(navigation.className).not.toContain("border-b")
    expect(screen.getByText("42 / 42").compareDocumentPosition(navigation) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(navigation.compareDocumentPosition(screen.getByRole("heading", { name: "prepare" })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    fireEvent.click(await screen.findByRole("combobox", { name: "Jump to node" }))
    const list = await screen.findByRole("listbox", { name: "Nodes in this run" })
    fireEvent.click(within(list).getByRole("option", { name: /finalize/ }))
    await waitFor(() => {
      expect(router.state.location.search).toMatchObject({ run: COMPLETED_RUN_ID, stage: "finalize|||" })
      expect(scroll.mock.instances.some((element) => element instanceof Element && element.id === "stage-finalize|||" )).toBe(true)
    })
    const page = document.querySelector<HTMLElement>('[data-scroll-restoration-id="page"]')
    if (page === null) throw new Error("run page was not rendered")
    vi.spyOn(page, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 0, 0))
    document.querySelectorAll<HTMLElement>('[id^="stage-"]').forEach((element) => {
      vi.spyOn(element, "getBoundingClientRect").mockReturnValue(new DOMRect(0, element.id === "stage-prepare|||" ? 0 : 500, 0, 0))
    })
    fireEvent.scroll(page)
    await new Promise((resolve) => { setTimeout(resolve, 200) })
    expect(router.state.location.search.stage).toBe("finalize|||")
    fireEvent.click(screen.getByRole("button", { name: "Previous node" }))
    await waitFor(() => { expect(router.state.location.search.stage).not.toBe("finalize|||") })
    scroll.mockRestore()
  })

  it("tracks the visible node while scrolling manually", async () => {
    const router = await renderRoute(`${RUNS}?run=${COMPLETED_RUN_ID}`)
    await screen.findByRole("navigation", { name: "Nodes in this run" })
    const page = document.querySelector<HTMLElement>('[data-scroll-restoration-id="page"]')
    const stage = document.getElementById("stage-finalize|||")
    if (page === null || stage === null) throw new Error("run stages were not rendered")
    vi.spyOn(page, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 0, 0))
    const stages = [...document.querySelectorAll<HTMLElement>('[id^="stage-"]')]
    stages.forEach((element) => {
      vi.spyOn(element, "getBoundingClientRect").mockReturnValue(new DOMRect(0, element === stage ? 8 : -100, 0, 0))
    })
    fireEvent.scroll(page)
    await waitFor(() => { expect(router.state.location.search.stage).toBe("finalize|||") })
    expect(await screen.findByRole("navigation", { name: "Nodes in this run" })).toBeTruthy()
  })

  it("uses a white bottom-border strip only after the node bar becomes sticky", async () => {
    await renderRoute(`${RUNS}?run=${COMPLETED_RUN_ID}`)
    const navigation = await screen.findByRole("navigation", { name: "Nodes in this run" })
    const page = navigation.parentElement?.parentElement
    const wrapper = navigation.parentElement
    if (page === null || page === undefined || wrapper === null) throw new Error("node bar is outside the run page")
    vi.spyOn(page, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 0, 0))
    vi.spyOn(wrapper, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 0, 0))
    fireEvent.scroll(page)
    await waitFor(() => {
      expect(navigation.className).toContain("bg-card")
      expect(navigation.className).toContain("border-b")
    })
  })

  it("keeps the focused node when opening and closing an execution", async () => {
    const router = await renderRoute(`${RUNS}?run=${COMPLETED_RUN_ID}&stage=finalize%7C%7C%7C`)
    const drafts = await screen.findByRole("table", { name: "drafts" })
    fireEvent.click(firstButton(traceRow(drafts, "Output")))
    await waitFor(() => {
      expect(router.state.location.search).toMatchObject({ stage: "finalize|||", node: "drafts__gpt" })
    })
    fireEvent.click(
      within(await screen.findByRole("dialog", {}, { timeout: 10_000 })).getByRole("button", {
        name: "Close the call panel",
      }),
    )
    await waitFor(() => {
      expect(router.state.location.search).toEqual({ run: COMPLETED_RUN_ID, stage: "finalize|||" })
    })
  })

  it("renders image and audio controls in the selected run output", async () => {
    await renderRoute(`${RUNS}?run=${COMPLETED_RUN_ID}`)
    await screen.findByRole("heading", { name: `Run ${ref(COMPLETED_RUN_ID)}` })
    expect(screen.getAllByRole("img", { name: "image.jpeg" }).length).toBeGreaterThan(0)
    expect(screen.getAllByLabelText("voice.wav").some((element) => element.tagName === "AUDIO" && element.hasAttribute("controls"))).toBe(true)
  })

  it("opens an image from a trace cell without opening the call panel", async () => {
    const router = await renderRoute(`${RUNS}?run=${COMPLETED_RUN_ID}`)
    const finalize = await screen.findByRole("table", { name: "finalize" })
    const output = traceRow(finalize, "Output")
    fireEvent.click(within(output).getByRole("button", { name: /open image/i }))
    expect(await screen.findByRole("dialog")).toBeTruthy()
    expect(router.state.location.search).toEqual({ run: COMPLETED_RUN_ID })
  })

  it("puts the parallel branches of a stage side by side in one matrix", async () => {
    await renderRoute(`${RUNS}?run=${COMPLETED_RUN_ID}`)
    const drafts = await screen.findByRole("table", { name: "drafts" })
    expect(within(drafts).getByText("gpt")).toBeTruthy()
    expect(within(drafts).getByText("mistral")).toBeTruthy()
    expect(within(drafts).getAllByText("branch gpt")).toHaveLength(1)
  })

  it("carries a row for the agent, the model, the input, the prompt, the output and the post check", async () => {
    await renderRoute(`${RUNS}?run=${COMPLETED_RUN_ID}`)
    const drafts = await screen.findByRole("table", { name: "drafts" })
    const rows = within(drafts)
      .getAllByRole("rowheader")
      .map((header) => header.textContent)
    ROW_LABELS.forEach((label) => {
      expect(rows.some((row) => row.startsWith(label))).toBe(true)
    })
  })

  it("lays the iterations of a loop side by side in one matrix, like the items of a map", async () => {
    await renderRoute(`${RUNS}?run=${COMPLETED_RUN_ID}`)
    const polish = await screen.findByRole("table", { name: "polish" })
    expect(within(polish).getAllByText("iteration 0")).toHaveLength(2)
    expect(within(polish).getAllByText("iteration 1")).toHaveLength(2)
    expect(within(polish).getAllByText("revise")).toHaveLength(2)
    const vote = screen.getByRole("table", { name: "vote" })
    expect(within(vote).getByText("item 0")).toBeTruthy()
    expect(within(vote).getByText("item 2")).toBeTruthy()
  })

  it("marks the nodes a stopped run never reached", async () => {
    await renderRoute(`${RUNS}?run=${FAILED_RUN_ID}`)
    await screen.findByRole("heading", { name: `Run ${ref(FAILED_RUN_ID)}` })
    expect(screen.getAllByText("not started")).toHaveLength(4)
  })

  it("opens the call panel from the address in the url without storage metadata in Formatted", async () => {
    await renderRoute(`${RUNS}?run=${COMPLETED_RUN_ID}&node=drafts__gpt&branch=gpt&tab=output`)
    const panel = await screen.findByRole("dialog")
    expect(within(panel).getByText("drafts__gpt")).toBeTruthy()
    expect(within(panel).getByText("Actual output")).toBeTruthy()
    expect(within(panel).getByRole("region", { name: "Actual output" })).toBeTruthy()
    expect(within(panel).getAllByText("reply.text:").length).toBeGreaterThan(0)
    expect(within(panel).queryByText("inline value")).toBeNull()
    expect(within(panel).queryByText("Reference")).toBeNull()
  })

  it("shows allowed values within output schema fields without a separate allowed-set card", async () => {
    const triage = liveExecutionDetails[`${COMPLETED_RUN_ID}|triage|||`]
    if (triage === undefined) throw new Error("Missing triage fixture")
    server.use(http.get(`${API_BASE}/runs/${COMPLETED_RUN_ID}/executions/detail`, () => HttpResponse.json({
      ...triage,
      allowed_sets: [{
        type_id: "SignalKey",
        source: "$in.signals[*].key",
        labels_from: "$in.signals[*].label",
        members: [{ value: "flicker", label: "Мерцает" }, { value: "app_offline", label: "Не отвечает в приложении" }],
      }],
      prompt: {
        level: 2,
        template_sha256: null,
        rendered_sha256: "sha256-test",
        rendered_ref: null,
        messages: [],
        slot_ranges: [],
        variants: {},
        output_schema_sent: {
          type: "object",
          properties: { observations: { type: "array", items: { $ref: "#/$defs/Observation" } } },
          $defs: { Observation: { type: "object", properties: { key: { type: "string", enum: ["flicker", "app_offline"] } } } },
        },
      },
    })))

    const router = await renderRoute(`${RUNS}?run=${COMPLETED_RUN_ID}&node=triage&tab=input`)
    const input = await screen.findByRole("dialog")
    expect(within(input).queryByText("Allowed sets")).toBeNull()
    expect(within(input).queryByText("$in.signals[*].key")).toBeNull()
    fireEvent.mouseDown(within(input).getByRole("tab", { name: "Prompt" }))
    await waitFor(() => { expect(router.state.location.search.tab).toBe("prompt") })
    const prompt = await screen.findByRole("dialog")
    expect(within(prompt).getByText("Generated prompt")).toBeTruthy()
    expect(within(prompt).queryByText("Expected output schema")).toBeNull()
    fireEvent.mouseDown(within(prompt).getByRole("tab", { name: "Output" }))
    await waitFor(() => { expect(router.state.location.search.tab).toBe("output") })
    const output = await screen.findByRole("dialog")
    const observations = within(output).getByText("observations").closest("li")
    if (observations === null) throw new Error("Missing observations field")
    expect(within(observations).getByText("observations[].key")).toBeTruthy()
    expect(within(observations).getByText("app_offline")).toBeTruthy()
  })

  it("shows the current node schema for a historical run without a saved plan or input", async () => {
    server.use(http.get(`${API_BASE}/flows/support_case/schemas`, () => HttpResponse.json({
      flow_id: "support_case",
      input: null,
      output: null,
      context: [],
      nodes: { triage: {
        in: { type: "object", properties: { customer_message: { type: "string" } } },
        out: { type: "object", properties: { summary: { type: "string" } } },
      } },
    })))
    await renderRoute(`${RUNS}?run=${COMPLETED_RUN_ID}&node=triage&tab=input`)
    const panel = await screen.findByRole("dialog")
    expect(within(panel).getByText("customer_message")).toBeTruthy()
    expect(within(panel).getByText("Current flow schema; the original run plan is unavailable.")).toBeTruthy()
    const actualInput = within(panel).getByRole("region", { name: "Actual input" })
    expect(actualInput.textContent).toBe("This run did not save the per-node input.")
    expect(actualInput.textContent).not.toContain("—")
  })

  it("opens the tab that matches the clicked trace row", async () => {
    const router = await renderRoute(`${RUNS}?run=${COMPLETED_RUN_ID}`)
    const drafts = await screen.findByRole("table", { name: "drafts" })
    const input = traceRow(drafts, /^Input/)
    fireEvent.click(firstButton(input))
    await waitFor(() => {
      expect(router.state.location.search).toMatchObject({ node: "drafts__gpt", branch: "gpt", tab: "input" })
    })
    expect(within(await screen.findByRole("dialog")).getByText("Actual input")).toBeTruthy()
  })

  it("shows complete flat paths without an inner scroll area and switches to Raw in the call sheet", async () => {
    await renderRoute(`${RUNS}?run=${COMPLETED_RUN_ID}`)
    const drafts = await screen.findByRole("table", { name: "drafts" })
    const output = traceRow(drafts, "Output")
    const flat = within(output).getAllByRole("cell")[0]?.querySelector("ul")
    expect(flat).not.toBeNull()
    expect(flat?.className).not.toContain("max-h-")
    expect(flat?.className).not.toContain("overflow-auto")
    expect(within(output).getAllByText("reply.text:").length).toBeGreaterThan(0)
    expect(within(output).queryAllByText("inline")).toHaveLength(0)
    fireEvent.click(firstButton(output))
    const panel = await screen.findByRole("dialog", {}, { timeout: 10_000 })
    fireEvent.click(within(panel).getByRole("radio", { name: "Raw" }))
    expect(within(panel).getAllByText(/"reply"/).length).toBeGreaterThan(0)
    expect(within(panel).getByText("inline value")).toBeTruthy()
  })

  it("shares the Formatted/Raw choice between the run and call sheet", async () => {
    await renderRoute(`${RUNS}?run=${COMPLETED_RUN_ID}`)
    const navigation = await screen.findByRole("navigation", { name: "Nodes in this run" })
    expect(navigation.parentElement?.className).toContain("sticky")
    expect(within(navigation).getByRole("radio", { name: "Formatted" })).toBeTruthy()
    const drafts = await screen.findByRole("table", { name: "drafts" })
    const output = traceRow(drafts, "Output")
    fireEvent.click(within(navigation).getByRole("radio", { name: "Raw" }))
    expect(output.querySelector("pre")).not.toBeNull()
    fireEvent.click(firstButton(output))
    const panel = await screen.findByRole("dialog", {}, { timeout: 10_000 })
    expect(within(panel).getAllByText(/"reply"/).length).toBeGreaterThan(0)
    expect(output.querySelector("pre")).not.toBeNull()
  })

  it("shows a binary blob reference without a player in Raw output", async () => {
    const snapshot = liveRunSnapshots[COMPLETED_RUN_ID]
    if (snapshot === undefined) throw new Error("Missing completed run fixture")
    const clipDetail = liveExecutionDetails[`${COMPLETED_RUN_ID}|clip|||`]
    if (clipDetail === undefined) throw new Error("Missing clip detail fixture")
    const binary = { kind: "blob" as const, blob_id: "sha256-video-raw", sha256: "sha256-video-raw", size_bytes: 6129,
      media_type: "video/mp4", preview: "", truncated: false }
    server.use(http.get(`${API_BASE}/runs/:runId`, () => HttpResponse.json({
      ...snapshot,
      output_ref: binary,
      executions: snapshot.executions.map((execution) => execution.address.node_id === "clip" ? { ...execution, output_ref: binary } : execution),
    })))
    server.use(http.get(`${API_BASE}/runs/:runId/executions/detail`, () => HttpResponse.json({ ...clipDetail, output_ref: binary })))
    await renderRoute(`${RUNS}?run=${COMPLETED_RUN_ID}`)
    const clip = await screen.findByRole("table", { name: "clip" })
    const output = traceRow(clip, "Output")
    const runOutput = screen.getByRole("heading", { name: "Output", level: 3 }).closest("section")
    if (runOutput === null) throw new Error("Missing run output")
    expect(output.querySelector("video")).not.toBeNull()
    expect(runOutput.querySelector("video")).not.toBeNull()

    const navigation = await screen.findByRole("navigation", { name: "Nodes in this run" })
    fireEvent.click(within(navigation).getByRole("radio", { name: "Raw" }))
    expect(output.querySelector("video")).toBeNull()
    expect(runOutput.querySelector("video")).toBeNull()
    expect(output.querySelector("pre")?.textContent).toContain('"blob_id": "sha256-video-raw"')
    expect(runOutput.querySelector("pre")?.textContent).toContain('"blob_id": "sha256-video-raw"')

    fireEvent.click(firstButton(output))
    const panel = await screen.findByRole("dialog", {}, { timeout: 10_000 })
    expect(within(panel).queryByLabelText("video/mp4")).toBeNull()
    expect(within(panel).getByText(/"blob_id": "sha256-video-raw"/u)).toBeTruthy()
  })

  it("uses formatted values by default and shares them with the call sheet", async () => {
    let requests = 0
    server.use(http.post(`${API_BASE}/runs/:runId/presentation`, async ({ request }) => {
      requests += 1
      const body: unknown = await request.json()
      if (typeof body !== "object" || body === null || !("targets" in body) || !Array.isArray(body.targets)) throw new Error("invalid batch")
      const candidates: unknown[] = body.targets
      const targets = candidates.filter(isPresentationTarget)
      return HttpResponse.json({ results: targets.map((target) => ({
        target, status: "formatted", formatter: "project.views:render#test", error: null,
        document: { version: 1, root: { kind: "section", children: [{ kind: "text", value: target.side === "output" ? "MARKED OUTPUT" : "MARKED INPUT" }] } },
      })) })
    }))
    const router = await renderRoute(`${RUNS}?run=${COMPLETED_RUN_ID}&node=drafts__gpt&branch=gpt&tab=output`)
    const drafts = await screen.findByRole("table", { name: "drafts" })
    const panel = await screen.findByRole("dialog")
    await waitFor(() => { expect(requests).toBeGreaterThan(0) })
    await waitFor(() => { expect(within(panel).getByText("MARKED OUTPUT")).toBeTruthy() })
    expect(within(drafts).getAllByText("MARKED OUTPUT").length).toBeGreaterThan(0)
    const initialRequests = requests
    fireEvent.click(within(panel).getByRole("radio", { name: "Raw" }))
    expect(within(drafts).queryByText("MARKED OUTPUT")).toBeNull()
    fireEvent.click(within(panel).getByRole("radio", { name: "Formatted" }))
    await waitFor(() => { expect(within(panel).getByText("MARKED OUTPUT")).toBeTruthy() })
    expect(requests).toBeGreaterThan(initialRequests)
    fireEvent.click(within(panel).getByRole("button", { name: "Close the call panel" }))
    await waitFor(() => { expect(router.state.location.search).toEqual({ run: COMPLETED_RUN_ID }) })
    fireEvent.click(firstButton(traceRow(drafts, "Output")))
    await waitFor(() => { expect(router.state.location.search).toMatchObject({ tab: "output", node: "drafts__gpt", branch: "gpt" }) })
  })

  it("shows failed attempts as their own labelled list", async () => {
    await renderRoute(`${RUNS}?run=${COMPLETED_RUN_ID}`)
    const attempts = await screen.findByRole("list", { name: /Failed attempts of gpt/ })
    expect(within(attempts).getAllByRole("listitem")).toHaveLength(3)
    expect(within(attempts).getAllByText("Cause").length).toBeGreaterThan(0)
    expect(within(attempts).getAllByText("Action").length).toBeGreaterThan(0)
  })

  it("shows the prompt of the call and the facts of the execution", async () => {
    await renderRoute(`${RUNS}?run=${COMPLETED_RUN_ID}&node=drafts__gpt&branch=gpt&tab=prompt`)
    const panel = await screen.findByRole("dialog")
    expect(within(panel).getByText("Current prompt template")).toBeTruthy()
    expect(within(panel).getByText(/This run did not save the messages sent to the model/u)).toBeTruthy()
    fireEvent.click(within(panel).getByText("Show template source"))
    expect(within(panel).getAllByText(/message system/).length).toBeGreaterThan(0)
    expect(within(panel).getByText("flows/support_case/nodes/polish/revise.prompt.md")).toBeTruthy()
  })

  it("shows messages saved with the run above the current template", async () => {
    const execution = Object.values(liveExecutionDetails).find((item) =>
      item.address.node_id === "drafts__gpt" && item.address.branch_key === "gpt")
    if (execution === undefined) throw new Error("missing gpt detail")
    server.use(http.get(`${API_BASE}/runs/${COMPLETED_RUN_ID}/executions/detail`, () => HttpResponse.json({
      ...execution,
      prompt: {
        level: 2,
        template_sha256: "sha256-template",
        rendered_sha256: "sha256-rendered",
        rendered_ref: null,
        messages: [
          { role: "system", parts: [{ kind: "text", text: "Use the saved instructions", media: null }] },
          { role: "user", parts: [{ kind: "text", text: "Answer for Alice", media: null }] },
        ],
        slot_ranges: [],
        variants: {},
        output_schema_sent: null,
      },
    })))
    await renderRoute(`${RUNS}?run=${COMPLETED_RUN_ID}&node=drafts__gpt&branch=gpt&tab=prompt`)
    const panel = await screen.findByRole("dialog")
    expect(within(panel).getByText("Generated prompt")).toBeTruthy()
    expect(within(panel).getByText("Use the saved instructions")).toBeTruthy()
    expect(within(panel).getByText("Answer for Alice")).toBeTruthy()
    expect(within(panel).queryByText(/This run did not save the messages/u)).toBeNull()
    expect(within(panel).getByText("Show template source").closest("details")?.open).toBe(false)
  })

  it("asks for the context keys the flow declares and for nothing else", async () => {
    await renderRoute(RUNS)
    await openStartForm()
    expect(await screen.findByLabelText("Date")).toHaveProperty("value", isoDate(TEST_NOW))
    expect(await screen.findByLabelText("Tenant")).toHaveProperty("value", "")
    expect(screen.queryByLabelText("Locale")).toBeNull()
    expect(screen.queryByLabelText("Time zone")).toBeNull()
  })

  it("renders structured input for the selected nodes", async () => {
    await renderRoute(RUNS)
    await openStartForm()
    expect(await screen.findByLabelText("message *")).toBeTruthy()
    expect(screen.getByLabelText("urgent *")).toBeTruthy()
    expect(screen.getByLabelText("customer id *")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Select only triage" }))
    expect(await screen.findByLabelText("Output of prepare")).toBeTruthy()
    expect(screen.getByLabelText("customer id *")).toBeTruthy()
    expect(screen.queryByLabelText("message *")).toBeNull()
    expect(screen.queryByLabelText("urgent *")).toBeNull()
  })

  it("shows required context before the user can start", async () => {
    await renderRoute(RUNS)
    await openStartForm()
    expect(await screen.findByLabelText("Tenant")).toBeTruthy()
    expect(screen.getByRole("button", { name: "Start run" })).toHaveProperty("disabled", true)
  })

  it("starts the run with the context and the input and opens it", async () => {
    const router = await renderRoute(RUNS)
    await openStartForm()
    fireEvent.change(await screen.findByLabelText("message *"), { target: { value: "lamp flickers" } })
    fireEvent.change(screen.getByLabelText("customer id *"), { target: { value: "cus_123" } })
    fireEvent.change(screen.getByLabelText("Tenant"), { target: { value: "lumen" } })
    const start = screen.getByRole("button", { name: "Start run" })
    await waitFor(() => { expect(start).toHaveProperty("disabled", false) })
    fireEvent.click(start)
    await waitFor(() => {
      expect(router.state.location.search).toHaveProperty("run")
    })
    const search = router.state.location.search
    if (!("run" in search) || typeof search.run !== "string") throw new Error("run id was not added to the URL")
    expect(await screen.findByRole("heading", { name: `Run ${ref(search.run)}` })).toBeTruthy()
  })
})
