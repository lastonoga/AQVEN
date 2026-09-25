import { fireEvent, screen, waitFor, within } from "@testing-library/react"
import { http, HttpResponse } from "msw"
import { describe, expect, it, vi } from "vitest"
import { API_BASE } from "@/api/client"
import { liveChatSessions } from "@/mocks/data/chat"
import { liveDatasets } from "@/mocks/data/datasets"
import { liveFlowDetails } from "@/mocks/data/project"
import { server } from "@/mocks/node"
import { renderRoute } from "@/test/render-route"

vi.mock("@/features/chat", () => ({
  ChatPanel: () => null,
}))

type Loaded = { readonly routeId: string; readonly loaderData?: unknown }

const CASES = "/flows/support_case/cases"
const LAST_STAGE = liveFlowDetails.support_case?.order.at(-1) ?? ""
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

const MEDIA_FOLDER = "datasets/support_case_cases"
const ATTACH = `${API_BASE}/datasets/support_case_cases/cases/parcel_photo/media`

const IMAGE_SCHEMA = { type: "object", properties: { $media: { type: "string", pattern: "^image/[a-z0-9.+-]+$" }, blob_id: { type: "string" } } }

const MEDIA_CASE = {
  name: "parcel_photo",
  inputs: {
    message: "The parcel arrived broken",
    photo: { $media: "image/jpeg", file: "photo_01.jpg" },
    voice_note: { $media: "audio/wav", file: "@root/samples/voice.wav" },
    invoice: { $media: "application/pdf", blob_id: "sha256-invoice", size_bytes: 633, name: "invoice.pdf" },
  },
}

const formField = (body: string, name: string): string | null =>
  new RegExp(`name="${name}"\\r\\n\\r\\n([^\\r]*)\\r\\n`, "u").exec(body)?.[1] ?? null

const formFileType = (body: string, name: string): string | null =>
  new RegExp(`name="${name}"; filename="[^"]*"\\r\\nContent-Type: ([^\\r]*)`, "u").exec(body)?.[1] ?? null

const useMediaCase = (inputs: Readonly<Record<string, unknown>>): { readonly set: (next: Readonly<Record<string, unknown>>) => void } => {
  let current = inputs
  server.use(
    http.get(`${API_BASE}/datasets/support_case_cases/cases`, () => HttpResponse.json({ items: [{ name: "parcel_photo", inputs: current }], next_cursor: null, total_estimate: 1 })),
    http.get(`${API_BASE}/flows/support_case/schemas`, () => HttpResponse.json({
      flow_id: "support_case",
      input: { type: "object", properties: { message: { type: "string" }, photo: { anyOf: [IMAGE_SCHEMA, { type: "null" }] } } },
      output: {},
      context: [],
      nodes: {},
    })),
  )
  return { set: (next) => { current = next } }
}

const caseList = (): Promise<HTMLElement> => screen.findByRole("list", { name: "Cases" })

const rowNames = (list: HTMLElement): readonly string[] =>
  within(list).getAllByRole("listitem").map((row) => within(row).getAllByRole("button")[0]?.textContent ?? "")

const rowOf = (list: HTMLElement, name: string): HTMLElement => {
  const row = within(list).getAllByRole("listitem").find((item) => item.textContent.includes(name))
  if (row === undefined) throw new Error(`missing row ${name}`)
  return row
}

const selectionBar = (): HTMLElement => screen.getByRole("region", { name: "Selected cases" })

const pickStage = (label: "From stage" | "To stage", node: string): void => {
  fireEvent.change(within(selectionBar()).getByRole("combobox", { name: label }), { target: { value: node } })
}

const pickTag = async (key: string, value: string): Promise<void> => {
  fireEvent.click(screen.getByRole("button", { name: "Filter" }))
  fireEvent.click(await screen.findByRole("option", { name: new RegExp(`^${key}`, "u") }))
  fireEvent.click(await screen.findByRole("option", { name: new RegExp(`^${value}`, "u") }))
  await waitFor(() => {
    expect(screen.queryByRole("listbox")).toBeNull()
  })
}

const loaded = (matches: readonly Loaded[], routeId: string): unknown => matches.find((match) => match.routeId === routeId)?.loaderData

const settled = async (router: { readonly state: { readonly status: string } }): Promise<void> => {
  await waitFor(() => {
    expect(router.state.status).toBe("idle")
  })
}

describe("CasesScreen", () => {
  it("lists every case on one line with its tag values, the expected mark and the node_outputs count", async () => {
    useTaggedCases()
    await renderRoute(CASES)
    const list = await caseList()
    expect(rowNames(list)).toEqual(TAGGED_CASES.map((item) => item.name))
    const first = rowOf(list, "strip_flicker_credit")
    const tags = within(first).getByText("smart_wifi · amazon · no")
    expect(tags.getAttribute("title")).toBe("lamp_kind=smart_wifi, channel=amazon, regression=no")
    expect(tags.className).toContain("truncate")
    expect(within(first).getByTitle("Has an expected output").textContent).toBe("✓")
    expect(within(first).getByTitle("No saved node outputs").textContent).toBe("—")
    const second = rowOf(list, "bulb_app_offline_advice")
    expect(within(second).getByTitle("No expected output").textContent).toBe("—")
    expect(within(second).getByTitle("Saved outputs of prepare, triage").textContent).toBe("2")
    expect(screen.getByText("3 of 3 cases")).toBeTruthy()
    expect(screen.getByText("Cases of this flow")).toBeTruthy()
    expect(screen.queryByText("Grouped runs")).toBeNull()
    expect(screen.queryByRole("table")).toBeNull()
    expect(screen.queryByRole("region", { name: "Selected cases" })).toBeNull()
    expect(screen.queryByRole("combobox", { name: "From stage" })).toBeNull()
  })

  it("filters by tags picked from the Filter menu: any value of one key, every key at once, kept in the URL", async () => {
    useTaggedCases()
    const router = await renderRoute(CASES)
    const list = await caseList()
    await pickTag("channel", "storefront")
    await waitFor(() => {
      expect(rowNames(list)).toEqual(["bulb_app_offline_advice"])
    })
    expect(router.state.location.search).toEqual({ tag: ["channel=storefront"] })
    expect(screen.getByRole("button", { name: "Remove filter channel: storefront" })).toBeTruthy()
    await pickTag("channel", "ozon")
    await waitFor(() => {
      expect(rowNames(list)).toEqual(["bulb_app_offline_advice", "lamp_crushed_box_reship"])
    })
    await pickTag("lamp_kind", "mains")
    await waitFor(() => {
      expect(rowNames(list)).toEqual(["lamp_crushed_box_reship"])
    })
    expect(screen.getByText("1 of 3 cases")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Remove filter lamp_kind: mains" }))
    await waitFor(() => {
      expect(rowNames(list)).toEqual(["bulb_app_offline_advice", "lamp_crushed_box_reship"])
    })
    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }))
    await waitFor(() => {
      expect(rowNames(list)).toEqual(TAGGED_CASES.map((item) => item.name))
    })
    expect(router.state.location.search).toEqual({})
    await settled(router)
  })

  it("marks the values already filtered on and goes back to the tag dimensions", async () => {
    useTaggedCases()
    await renderRoute(`${CASES}?tag=${encodeURIComponent(JSON.stringify(["regression=yes"]))}`)
    await caseList()
    expect(screen.getByRole("button", { name: "Remove filter regression: yes" })).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Filter" }))
    const dimensions = await screen.findByRole("listbox", { name: "Tag dimensions" })
    expect(within(dimensions).getAllByRole("option").map((option) => option.textContent)).toEqual(["lamp_kind2 values", "channel3 values", "regression2 values"])
    fireEvent.click(within(dimensions).getByRole("option", { name: /^regression/u }))
    const values = await screen.findByRole("listbox", { name: "Values of regression" })
    expect(within(values).getByRole("option", { name: /^yes/u }).getAttribute("data-checked")).toBe("true")
    expect(within(values).getByRole("option", { name: /^no/u }).getAttribute("data-checked")).toBe("false")
    fireEvent.click(screen.getByRole("button", { name: "All tags" }))
    expect(await screen.findByRole("listbox", { name: "Tag dimensions" })).toBeTruthy()
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
    expect(within(within(detail).getByRole("group", { name: "Tags" })).getByText("lamp_kind=smart_wifi")).toBeTruthy()
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
      "/research/experiments/intent_escalation_agents",
      "/research/experiments/reply_noninferior_mistral",
      "/research/experiments/reply_overpromise_risk",
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

  it("runs the selected cases as a look series from the bar at the bottom and opens it", async () => {
    useTaggedCases()
    const router = await renderRoute(CASES)
    const list = await caseList()
    expect(screen.queryByRole("button", { name: /^Run \d/u })).toBeNull()
    fireEvent.click(within(list).getByRole("checkbox", { name: "Select lamp_crushed_box_reship" }))
    fireEvent.click(within(list).getByRole("checkbox", { name: "Select strip_flicker_credit" }))
    const bar = selectionBar()
    expect(within(bar).getByText("2 selected")).toBeTruthy()
    expect(within(bar).getByText("Whole flow")).toBeTruthy()
    const start = within(bar).getByRole("button", { name: "Run 2" })
    expect(start).toHaveProperty("disabled", false)
    fireEvent.click(start)
    await waitFor(() => {
      expect(router.state.location.pathname).toMatch(/^\/research\/series\/.+/u)
    })
    await waitFor(() => {
      expect(loaded(router.state.matches, SERIES_ROUTE)).toMatchObject({
        series: {
          origin: { kind: "look", flow: "support_case", dataset: "support_case_cases", cases: ["strip_flicker_credit", "lamp_crushed_box_reship"], range: null },
          question: { kind: "look" },
          status: "running",
        },
      })
    })
    await settled(router)
  })

  it("runs the selected cases as a look over a narrower range when each has the saved outputs it needs", async () => {
    useTaggedCases()
    const router = await renderRoute(CASES)
    const list = await caseList()
    fireEvent.click(within(list).getByRole("checkbox", { name: "Select bulb_app_offline_advice" }))
    expect(within(selectionBar()).getByRole("combobox", { name: "From stage" })).toHaveProperty("value", "prepare")
    expect(within(selectionBar()).getByRole("combobox", { name: "To stage" })).toHaveProperty("value", LAST_STAGE)
    pickStage("From stage", "triage")
    expect(await within(selectionBar()).findByText("Earlier stages come from node_outputs")).toBeTruthy()
    const run = within(selectionBar()).getByRole("button", { name: "Run 1" })
    expect(run).toHaveProperty("disabled", false)
    fireEvent.click(run)
    await waitFor(() => {
      expect(router.state.location.pathname).toMatch(/^\/research\/series\/.+/u)
    })
    await waitFor(() => {
      expect(loaded(router.state.matches, SERIES_ROUTE)).toMatchObject({
        series: { origin: { kind: "look", cases: ["bulb_app_offline_advice"], range: { from: "triage", to: LAST_STAGE } } },
      })
    })
    expect(await screen.findByText(`stages triage → ${LAST_STAGE}`, { exact: false })).toBeTruthy()
    await settled(router)
  })

  it("names in one line the selected cases that block a narrower range and runs it once they are deselected", async () => {
    useTaggedCases()
    await renderRoute(CASES)
    const list = await caseList()
    fireEvent.click(screen.getByRole("checkbox", { name: "Select the shown cases" }))
    pickStage("To stage", "triage")
    pickStage("From stage", "triage")
    const blocked = await within(selectionBar()).findByText("2 cases lack node_outputs for this start: strip_flicker_credit, lamp_crushed_box_reship")
    expect(blocked.getAttribute("title")).toBe("strip_flicker_credit ($prepare.out); lamp_crushed_box_reship ($prepare.out)")
    expect(within(selectionBar()).getByText("Cannot start here")).toBeTruthy()
    expect(within(selectionBar()).getByRole("button", { name: "Run 3" })).toHaveProperty("disabled", true)
    fireEvent.click(within(list).getByRole("checkbox", { name: "Select strip_flicker_credit" }))
    fireEvent.click(within(list).getByRole("checkbox", { name: "Select lamp_crushed_box_reship" }))
    expect(await within(selectionBar()).findByText("Earlier stages come from node_outputs")).toBeTruthy()
    expect(within(selectionBar()).getByRole("button", { name: "Run 1" })).toHaveProperty("disabled", false)
  })

  it("selects the shown cases at once and clears the selection from the bar", async () => {
    useTaggedCases()
    await renderRoute(`${CASES}?tag=${encodeURIComponent(JSON.stringify(["regression=yes"]))}`)
    const list = await caseList()
    fireEvent.click(screen.getByRole("checkbox", { name: "Select the shown cases" }))
    expect(within(selectionBar()).getByText("2 selected")).toBeTruthy()
    expect(within(list).getByRole("checkbox", { name: "Select bulb_app_offline_advice" })).toHaveProperty("checked", true)
    expect(screen.getByRole("checkbox", { name: "Deselect the shown cases" })).toHaveProperty("checked", true)
    expect(within(selectionBar()).getByRole("button", { name: "Run 2" })).toHaveProperty("disabled", false)
    fireEvent.click(within(selectionBar()).getByRole("button", { name: "Clear" }))
    expect(screen.queryByRole("region", { name: "Selected cases" })).toBeNull()
    expect(within(list).getByRole("checkbox", { name: "Select bulb_app_offline_advice" })).toHaveProperty("checked", false)
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
    fireEvent.click(within(selectionBar()).getByRole("button", { name: "Run 1" }))
    expect((await within(selectionBar()).findByRole("alert")).textContent).toContain("The selected cases could not start")
    expect(router.state.location.pathname).toBe(CASES)
  })

  it("keeps cases of another dataset kind readable but not runnable from this flow", async () => {
    const router = await renderRoute(`${CASES}?dataset=planted_defect_replies&case=strip_heat_clean`)
    const list = await caseList()
    expect(screen.getByText("Cases without a flow: experiments run them on a flow of their own, not from here")).toBeTruthy()
    fireEvent.click(within(list).getByRole("checkbox", { name: "Select strip_heat_clean" }))
    expect(within(selectionBar()).getByText("Only cases of this flow run from here")).toBeTruthy()
    expect(within(selectionBar()).queryByRole("combobox", { name: "From stage" })).toBeNull()
    expect(within(selectionBar()).getByRole("button", { name: "Run 1" })).toHaveProperty("disabled", true)
    const detail = screen.getByRole("region", { name: "Case strip_heat_clean" })
    expect(within(detail).queryByRole("heading", { name: "Run this case" })).toBeNull()
    expect(within(detail).getAllByRole("link").map((link) => link.getAttribute("href"))).toEqual(["/research/experiments/critique_planted_defects"])
    expect(screen.getByRole("button", { name: "Ask the agent to write cases" })).toBeTruthy()
    expect(router.state.location.search).toEqual({ dataset: "planted_defect_replies", case: "strip_heat_clean" })
  })

  it("switches the dataset from the picker and drops the case filters", async () => {
    useTaggedCases()
    const router = await renderRoute(`${CASES}?case=strip_flicker_credit&tag=${encodeURIComponent(JSON.stringify(["regression=no"]))}`)
    const trigger = await screen.findByRole("combobox", { name: /Selected dataset support_case_cases, 3 cases/u })
    fireEvent.click(trigger)
    const options = await screen.findByRole("listbox", { name: "Datasets in this project" })
    expect(within(options).getByRole("option", { name: /support_case_cases.*Flow · support_case · current/u }).getAttribute("data-checked")).toBe("true")
    fireEvent.click(within(options).getByRole("option", { name: /planted_defect_replies.*No flow · experiment flows/u }))
    await waitFor(() => {
      expect(router.state.location.search).toEqual({ dataset: "planted_defect_replies" })
    })
    expect(await screen.findByRole("combobox", { name: /Selected dataset planted_defect_replies, 3 cases/u })).toBeTruthy()
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
    expect(screen.queryByRole("button", { name: /^Run/u })).toBeNull()
    expect(screen.queryByRole("combobox", { name: /Selected dataset/u })).toBeNull()
  })

  it("shows file media from the project next to blob media, each with where it comes from", async () => {
    server.use(http.get(`${API_BASE}/datasets/support_case_cases/cases`, () => HttpResponse.json({ items: [MEDIA_CASE], next_cursor: null, total_estimate: 1 })))
    await renderRoute(`${CASES}?case=parcel_photo`)
    const detail = await screen.findByRole("region", { name: "Case parcel_photo" })
    const photo = within(detail).getByRole("button", { name: "Open image: photo_01.jpg" })
    expect(within(photo).getByRole("img").getAttribute("src")).toBe(`/api/raw/${MEDIA_FOLDER}/photo_01.jpg`)
    expect(within(detail).getByRole("link", { name: `${MEDIA_FOLDER}/photo_01.jpg` }).getAttribute("href")).toBe(`/api/raw/${MEDIA_FOLDER}/photo_01.jpg`)
    expect(within(detail).getByLabelText("voice.wav").getAttribute("src")).toBe("/api/raw/samples/voice.wav")
    expect(within(detail).getByRole("link", { name: "samples/voice.wav" })).toBeTruthy()
    expect(within(detail).getByRole("link", { name: "Open invoice.pdf" }).getAttribute("href")).toBe("/api/blobs/sha256-invoice")
    expect(within(detail).getByText("application/pdf · 633 B")).toBeTruthy()
    expect(within(detail).getByText(/"file": "photo_01.jpg"/u)).toBeTruthy()
    fireEvent.click(within(detail).getByRole("radio", { name: "Flat" }))
    expect(await within(detail).findByText("message:")).toBeTruthy()
    expect(within(detail).queryByText("photo.file:")).toBeNull()
    expect(within(detail).getAllByRole("img")).toHaveLength(1)
  })

  it("attaches a file to a case: the file goes next to the dataset and the case shows it from there", async () => {
    const posted: string[] = []
    const cases = useMediaCase({ message: "The parcel arrived broken", photo: null })
    server.use(http.post(ATTACH, async ({ request }) => {
      posted.push(await request.text())
      cases.set({ message: "The parcel arrived broken", photo: { $media: "image/png", file: "parcel.png" } })
      const dataset = { ...liveDatasets[0], file_hash: "sha256-after-attach" }
      return HttpResponse.json({ dataset, case_name: "parcel_photo", location: "inputs.photo", file: "parcel.png", path: `${MEDIA_FOLDER}/parcel.png`, media_type: "image/png" }, { status: 201 })
    }))
    await renderRoute(`${CASES}?case=parcel_photo`)
    const detail = await screen.findByRole("region", { name: "Case parcel_photo" })
    const media = within(detail).getByRole("group", { name: "Media files of this case" })
    expect(within(media).getByText(`Studio writes the file into ${MEDIA_FOLDER}/ next to the dataset and saves a file reference in the case.`)).toBeTruthy()
    expect(within(media).getByLabelText("File for photo").getAttribute("accept")).toBe("image/*")
    expect(within(detail).queryByRole("img")).toBeNull()

    fireEvent.change(within(media).getByLabelText("File for photo"), { target: { files: [new File(["png"], "parcel.png", { type: "image/png" })] } })

    const saved = await within(media).findByRole("link", { name: `${MEDIA_FOLDER}/parcel.png` })
    expect(saved.getAttribute("href")).toBe(`/api/raw/${MEDIA_FOLDER}/parcel.png`)
    expect(posted).toHaveLength(1)
    const body = posted[0] ?? ""
    expect(formField(body, "location")).toBe("inputs.photo")
    expect(formField(body, "file_hash")).toBe(liveDatasets[0]?.file_hash)
    expect(formFileType(body, "file")).toBe("image/png")
    const image = await within(detail).findByRole("button", { name: "Open image: parcel.png" })
    expect(within(image).getByRole("img").getAttribute("src")).toBe(`/api/raw/${MEDIA_FOLDER}/parcel.png`)
    expect(within(media).getByRole("button", { name: "Replace photo" })).toBeTruthy()
  })

  it("reloads the case and asks to attach again when the dataset file changed on disk", async () => {
    useMediaCase({ message: "The parcel arrived broken", photo: null })
    server.use(http.post(ATTACH, () => HttpResponse.json(
      { ok: false, op: "case_media_attach", code: "STALE_FILE", message: "datasets/support_case_cases.yaml changed after it was read", problems: [], candidates: [], conflict: null, retry_after_ms: null },
      { status: 412 },
    )))
    await renderRoute(`${CASES}?case=parcel_photo`)
    const detail = await screen.findByRole("region", { name: "Case parcel_photo" })
    fireEvent.change(within(detail).getByLabelText("File for photo"), { target: { files: [new File(["png"], "parcel.png", { type: "image/png" })] } })
    expect(await within(detail).findByText("The dataset file changed on disk, so nothing was saved. Studio reloaded the case: attach the file again.")).toBeTruthy()
    expect(within(detail).getByRole("button", { name: "Attach photo" })).toHaveProperty("disabled", false)
  })

  it("offers no attach control for a case without media fields", async () => {
    useTaggedCases()
    await renderRoute(`${CASES}?case=strip_flicker_credit`)
    const detail = await screen.findByRole("region", { name: "Case strip_flicker_credit" })
    expect(within(detail).queryByRole("group", { name: "Media files of this case" })).toBeNull()
  })
})
