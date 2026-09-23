import { fireEvent, screen, waitFor, within } from "@testing-library/react"
import { http, HttpResponse } from "msw"
import { afterEach, describe, expect, it, vi } from "vitest"
import { API_BASE } from "@/api/client"
import { liveChatSessions } from "@/mocks/data/chat"
import { liveDatasets } from "@/mocks/data/evals"
import { server } from "@/mocks/node"
import { renderRoute } from "@/test/render-route"
import { resetResearchFixtures } from "@/test/research-fixtures"

vi.mock("@/features/chat", () => ({
  ChatPanel: () => null,
}))

type Loaded = { readonly routeId: string; readonly loaderData?: unknown }

const CASES = "/flows/support_case/cases"
const SERIES_ROUTE = "/_project/research/series/$seriesId"

const TAGGED_CASES = [
  {
    name: "strip_flicker_credit",
    inputs: { message: "The strip flickers near the controller" },
    context: { date: "2026-09-18", tenant_id: "lumen" },
    tags: { lamp_kind: "smart_wifi", channel: "amazon", regression: "no" },
    expected_output: { intent: "defect" },
  },
  {
    name: "bulb_app_offline_advice",
    inputs: { message: "The bulb is offline in the app" },
    tags: { lamp_kind: "smart_wifi", channel: "storefront", regression: "yes" },
    node_outputs: { prepare: { message: "The bulb is offline in the app", channel: "storefront" }, triage: { intent: "question" } },
  },
  {
    name: "lamp_crushed_box_reship",
    inputs: { message: "The lamp arrived in a crushed box" },
    tags: { lamp_kind: "mains", channel: "ozon", regression: "yes" },
  },
]

const useTaggedCases = (): void => {
  server.use(http.get(`${API_BASE}/datasets/support_case_cases/cases`, () => HttpResponse.json({ items: TAGGED_CASES, next_cursor: null, total_estimate: TAGGED_CASES.length })))
}

const caseList = (): Promise<HTMLElement> => screen.findByRole("list", { name: "Cases" })

const rowNames = (list: HTMLElement): readonly string[] =>
  within(list).getAllByRole("listitem").map((row) => within(row).getAllByRole("button")[0]?.textContent ?? "")

const rowOf = (list: HTMLElement, name: string): HTMLElement => {
  const row = within(list).getAllByRole("listitem").find((item) => item.textContent.includes(name))
  if (row === undefined) throw new Error(`missing row ${name}`)
  return row
}

const chip = (tag: string): HTMLElement => screen.getByRole("button", { name: new RegExp(`^${tag},`, "u") })

const loaded = (matches: readonly Loaded[], routeId: string): unknown => matches.find((match) => match.routeId === routeId)?.loaderData

const settled = async (router: { readonly state: { readonly status: string } }): Promise<void> => {
  await waitFor(() => {
    expect(router.state.status).toBe("idle")
  })
}

afterEach(() => {
  resetResearchFixtures()
})

describe("CasesScreen", () => {
  it("lists every case with its tags, the expected mark and the node_outputs count", async () => {
    useTaggedCases()
    await renderRoute(CASES)
    const list = await caseList()
    expect(rowNames(list)).toEqual(TAGGED_CASES.map((item) => item.name))
    const first = rowOf(list, "strip_flicker_credit")
    expect(within(first).getByText("lamp_kind=smart_wifi")).toBeTruthy()
    expect(within(first).getByText("regression=no")).toBeTruthy()
    expect(within(first).getByTitle("Has an expected output").textContent).toBe("✓")
    expect(within(first).getByTitle("No saved node outputs").textContent).toBe("—")
    const second = rowOf(list, "bulb_app_offline_advice")
    expect(within(second).getByTitle("No expected output").textContent).toBe("—")
    expect(within(second).getByTitle("Saved outputs of prepare, triage").textContent).toBe("2")
    expect(screen.getByText("3 of 3 cases")).toBeTruthy()
    expect(screen.getByText("Cases of this flow")).toBeTruthy()
    expect(screen.queryByText("Grouped runs")).toBeNull()
    expect(screen.queryByRole("table")).toBeNull()
  })

  it("filters by tag chips: any value of one key, every key at once, kept in the URL", async () => {
    useTaggedCases()
    const router = await renderRoute(CASES)
    const list = await caseList()
    fireEvent.click(chip("channel=storefront"))
    await waitFor(() => {
      expect(rowNames(list)).toEqual(["bulb_app_offline_advice"])
    })
    expect(router.state.location.search).toEqual({ tag: ["channel=storefront"] })
    expect(chip("channel=storefront").getAttribute("aria-pressed")).toBe("true")
    fireEvent.click(chip("channel=ozon"))
    await waitFor(() => {
      expect(rowNames(list)).toEqual(["bulb_app_offline_advice", "lamp_crushed_box_reship"])
    })
    fireEvent.click(chip("lamp_kind=mains"))
    await waitFor(() => {
      expect(rowNames(list)).toEqual(["lamp_crushed_box_reship"])
    })
    expect(screen.getByText("1 of 3 cases")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }))
    await waitFor(() => {
      expect(rowNames(list)).toEqual(TAGGED_CASES.map((item) => item.name))
    })
    expect(router.state.location.search).toEqual({})
    await settled(router)
  })

  it("opens with the tag filter from the URL and filters by a part of the name", async () => {
    useTaggedCases()
    await renderRoute(`${CASES}?tag=${encodeURIComponent(JSON.stringify(["regression=yes"]))}`)
    const list = await caseList()
    expect(rowNames(list)).toEqual(["bulb_app_offline_advice", "lamp_crushed_box_reship"])
    fireEvent.change(screen.getByRole("textbox", { name: "Filter by case name" }), { target: { value: "crushed" } })
    await waitFor(() => {
      expect(rowNames(list)).toEqual(["lamp_crushed_box_reship"])
    })
    fireEvent.change(screen.getByRole("textbox", { name: "Filter by case name" }), { target: { value: "nothing" } })
    expect(await screen.findByText("No case matches these filters")).toBeTruthy()
  })

  it("expands a case into its input, context, expected output and the experiments using it", async () => {
    useTaggedCases()
    const router = await renderRoute(CASES)
    const list = await caseList()
    const toggle = within(rowOf(list, "strip_flicker_credit")).getByRole("button", { name: "strip_flicker_credit" })
    expect(toggle.getAttribute("aria-expanded")).toBe("false")
    fireEvent.click(toggle)
    const detail = await screen.findByRole("region", { name: "Case strip_flicker_credit" })
    await waitFor(() => {
      expect(router.state.location.search).toEqual({ case: "strip_flicker_credit" })
    })
    expect(toggle.getAttribute("aria-expanded")).toBe("true")
    expect(within(detail).getAllByRole("heading").map((heading) => heading.textContent)).toEqual([
      "Input",
      "Context",
      "Expected output",
      "node_outputs",
      "Experiments using this case",
      "Run this case",
    ])
    expect(within(detail).getByText(/"message": "The strip flickers near the controller"/u)).toBeTruthy()
    expect(within(detail).getByText(/"tenant_id": "lumen"/u)).toBeTruthy()
    expect(within(detail).getByText(/"intent": "defect"/u)).toBeTruthy()
    expect(within(detail).getByText("No saved node outputs: this case runs from the first stage of the flow.")).toBeTruthy()
    const experiments = within(detail).getAllByRole("link").map((link) => link.getAttribute("href"))
    expect(experiments).toEqual([
      "/research/experiments/reply_noninferior_mistral",
      "/research/experiments/reply_overpromise_risk",
      "/research/experiments/intent_escalation_agents",
    ])
    fireEvent.click(within(detail).getByRole("radio", { name: "Flat" }))
    expect(await within(detail).findByText("The strip flickers near the controller")).toBeTruthy()
    fireEvent.click(toggle)
    await waitFor(() => {
      expect(screen.queryByRole("region", { name: "Case strip_flicker_credit" })).toBeNull()
    })
    expect(router.state.location.search).toEqual({})
    await settled(router)
  })

  it("opens the case from the URL with its node outputs by node and the experiments filtered by tags", async () => {
    useTaggedCases()
    await renderRoute(`${CASES}?case=bulb_app_offline_advice`)
    const detail = await screen.findByRole("region", { name: "Case bulb_app_offline_advice" })
    expect(within(detail).getByText("No expected output: runs of this case show only what the flow returned.")).toBeTruthy()
    expect(within(detail).queryByRole("heading", { name: "Context" })).toBeNull()
    const prepare = within(detail).getByRole("button", { name: /^prepare/u })
    expect(prepare.textContent).toContain("2 fields")
    expect(within(detail).queryByText(/"channel": "storefront"/u)).toBeNull()
    fireEvent.click(prepare)
    expect(await within(detail).findByText(/"channel": "storefront"/u)).toBeTruthy()
    expect(within(detail).getAllByRole("link").map((link) => link.textContent)).toContain("reply_look")
  })

  it("runs the selected cases as a look series and opens it", async () => {
    useTaggedCases()
    const router = await renderRoute(CASES)
    const list = await caseList()
    const run = screen.getByRole("button", { name: "Run selected (0)" })
    expect(run).toHaveProperty("disabled", true)
    fireEvent.click(within(list).getByRole("checkbox", { name: "Select lamp_crushed_box_reship" }))
    fireEvent.click(within(list).getByRole("checkbox", { name: "Select strip_flicker_credit" }))
    expect(screen.getByText("2 selected")).toBeTruthy()
    const start = screen.getByRole("button", { name: "Run selected (2)" })
    expect(start).toHaveProperty("disabled", false)
    fireEvent.click(start)
    await waitFor(() => {
      expect(router.state.location.pathname).toMatch(/^\/research\/series\/.+/u)
    })
    await waitFor(() => {
      expect(loaded(router.state.matches, SERIES_ROUTE)).toMatchObject({
        series: { origin: { kind: "look", dataset: "support_case_cases", cases: ["strip_flicker_credit", "lamp_crushed_box_reship"] }, question: { kind: "look" } },
      })
    })
    await settled(router)
  })

  it("selects the shown cases at once and clears the selection", async () => {
    useTaggedCases()
    await renderRoute(`${CASES}?tag=${encodeURIComponent(JSON.stringify(["regression=yes"]))}`)
    const list = await caseList()
    fireEvent.click(screen.getByRole("checkbox", { name: "Select the shown cases" }))
    expect(screen.getByText("2 selected")).toBeTruthy()
    expect(within(list).getByRole("checkbox", { name: "Select bulb_app_offline_advice" })).toHaveProperty("checked", true)
    expect(screen.getByRole("checkbox", { name: "Deselect the shown cases" })).toHaveProperty("checked", true)
    expect(screen.getByRole("button", { name: "Run selected (2)" })).toHaveProperty("disabled", false)
    fireEvent.click(screen.getByRole("button", { name: "Clear selection" }))
    expect(screen.getByRole("button", { name: "Run selected (0)" })).toHaveProperty("disabled", true)
  })

  it("reports a series that could not start and stays on the cases", async () => {
    const dataset = { ...liveDatasets[0], dataset_id: "support_case_fresh", path: "datasets/support_case_fresh.yaml" }
    server.use(
      http.get(`${API_BASE}/datasets`, () => HttpResponse.json({ items: [dataset], next_cursor: null, total_estimate: 1 })),
      http.get(`${API_BASE}/datasets/support_case_fresh/cases`, () => HttpResponse.json({ items: TAGGED_CASES, next_cursor: null, total_estimate: 3 })),
    )
    const router = await renderRoute(CASES)
    const list = await caseList()
    fireEvent.click(within(list).getByRole("checkbox", { name: "Select strip_flicker_credit" }))
    fireEvent.click(screen.getByRole("button", { name: "Run selected (1)" }))
    expect((await screen.findByRole("alert")).textContent).toContain("The selected cases could not start")
    expect(router.state.location.pathname).toBe(CASES)
  })

  it("keeps cases of another dataset kind readable but not runnable from this flow", async () => {
    const router = await renderRoute(`${CASES}?dataset=reply_cases&case=strip_flicker_credit`)
    const list = await caseList()
    expect(screen.getByText("Inputs of an inference evaluation: they do not run on a flow")).toBeTruthy()
    expect(screen.getByText("Only cases of this flow run from here.")).toBeTruthy()
    fireEvent.click(within(list).getByRole("checkbox", { name: "Select strip_flicker_credit" }))
    expect(screen.getByRole("button", { name: "Run selected (1)" })).toHaveProperty("disabled", true)
    const detail = screen.getByRole("region", { name: "Case strip_flicker_credit" })
    expect(within(detail).queryByRole("heading", { name: "Run this case" })).toBeNull()
    expect(screen.getByRole("button", { name: "Ask the agent to write cases" })).toBeTruthy()
    expect(router.state.location.search).toEqual({ dataset: "reply_cases", case: "strip_flicker_credit" })
  })

  it("switches the dataset from the picker and drops the case filters", async () => {
    useTaggedCases()
    const router = await renderRoute(`${CASES}?case=strip_flicker_credit&tag=${encodeURIComponent(JSON.stringify(["regression=no"]))}`)
    const trigger = await screen.findByRole("combobox", { name: /Selected dataset support_case_cases, 3 cases/u })
    fireEvent.click(trigger)
    const options = await screen.findByRole("listbox", { name: "Datasets in this project" })
    expect(within(options).getByRole("option", { name: /support_case_cases.*Flow · support_case · current/u }).getAttribute("data-checked")).toBe("true")
    fireEvent.click(within(options).getByRole("option", { name: /reply_cases.*Inference evaluation/u }))
    await waitFor(() => {
      expect(router.state.location.search).toEqual({ dataset: "reply_cases" })
    })
    expect(await screen.findByRole("combobox", { name: /Selected dataset reply_cases, 3 cases/u })).toBeTruthy()
    await settled(router)
  })

  it("hands adding cases to the chat with the dataset file and no count cap", async () => {
    const sent: { readonly session: unknown; readonly text: unknown }[] = []
    server.use(
      http.post(`${API_BASE}/chat/sessions/:sessionId/messages`, async ({ params, request }) => {
        const body: unknown = await request.json()
        sent.push({ session: params["sessionId"], text: typeof body === "object" && body !== null && "text" in body ? body.text : null })
        return HttpResponse.json({ turn_id: "turn-1", accepted_at: "2026-09-18T03:00:00Z" }, { status: 202 })
      }),
    )
    await renderRoute(CASES)
    const button = await screen.findByRole("button", { name: "Ask the agent to add cases" })
    await waitFor(() => {
      expect(button.hasAttribute("disabled")).toBe(false)
    })
    fireEvent.click(button)
    expect((await screen.findByRole("status")).textContent).toBe("Sent to the chat on the left.")
    expect(sent).toHaveLength(1)
    expect(sent[0]?.session).toBe(liveChatSessions[0]?.session_id)
    expect(String(sent[0]?.text)).toContain("Add cases to the dataset support_case_cases in datasets/support_case_cases.yaml for flow support_case")
    expect(String(sent[0]?.text)).toContain("how many cases I need")
  })

  it("shows an empty flow with the upload and the hand-off to write the first cases", async () => {
    server.use(http.get(`${API_BASE}/datasets`, () => HttpResponse.json({ items: [], next_cursor: null, total_estimate: 0 })))
    await renderRoute(CASES)
    expect(await screen.findByText("No datasets yet")).toBeTruthy()
    expect(screen.getByRole("button", { name: "Upload CSV" })).toBeTruthy()
    expect(screen.getByRole("button", { name: "Ask the agent to write cases" })).toBeTruthy()
    expect(screen.getByRole("button", { name: "Run selected (0)" })).toHaveProperty("disabled", true)
    expect(screen.queryByRole("combobox", { name: /Selected dataset/u })).toBeNull()
  })
})
