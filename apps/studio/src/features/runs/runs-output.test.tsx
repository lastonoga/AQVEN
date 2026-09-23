import { fireEvent, screen, waitFor, within } from "@testing-library/react"
import { http, HttpResponse } from "msw"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { ApiRunSnapshot } from "@/domain"
import { API_BASE } from "@/api/client"
import { COMPLETED_RUN_ID } from "@/mocks/data/runs"
import { server } from "@/mocks/node"
import { renderRoute } from "@/test/render-route"
import { completedSnapshot } from "./test-support"

vi.mock("@/features/chat", () => ({
  ChatPanel: () => null,
}))

const RUN_PAGE = `/flows/support_case/runs?run=${COMPLETED_RUN_ID}`
const CASE_URL = `${API_BASE}/datasets/support_case_cases/cases/bulb_app_offline_advice`

const fromCase = (patch: Partial<ApiRunSnapshot> = {}): ApiRunSnapshot => ({
  ...completedSnapshot(),
  dataset_item_id: "support_case_cases/bulb_app_offline_advice",
  output_ref: { kind: "inline", value: { status: "rejected", intent: "defect", case_ref: "CASE-1" } },
  ...patch,
})

const sentTexts: string[] = []

const captureChat = (): void => {
  server.use(
    http.post(`${API_BASE}/chat/sessions/:sessionId/messages`, async ({ request }) => {
      const body: unknown = await request.json()
      sentTexts.push(typeof body === "object" && body !== null && "text" in body ? String(body.text) : "")
      return HttpResponse.json({ turn_id: "turn-1", accepted_at: "2026-09-18T03:00:00Z" }, { status: 202 })
    }),
  )
}

const enabled = async (button: HTMLElement): Promise<HTMLElement> => {
  await waitFor(() => {
    expect(button.hasAttribute("disabled")).toBe(false)
  })
  return button
}

describe("RunsScreen expected vs actual", () => {
  it("shows the expected output of the case at the end of the run, next to the actual output", async () => {
    server.use(
      http.get(`${API_BASE}/runs/:runId`, () => HttpResponse.json(fromCase())),
      http.get(CASE_URL, () => HttpResponse.json({ name: "bulb_app_offline_advice", inputs: {}, expected_output: { status: "resolved", intent: "defect" } })),
    )
    await renderRoute(RUN_PAGE)
    const comparison = await screen.findByRole("region", { name: "Expected vs actual" })
    const output = screen.getByRole("heading", { name: "Output", level: 3 }).closest("section")
    if (output === null) throw new Error("missing run output block")
    expect(output.contains(comparison)).toBe(true)
    const stages = screen.getAllByRole("heading", { level: 3 }).filter((heading) => heading.closest("section") !== output)
    const last = stages.at(-1)
    if (last === undefined) throw new Error("missing stages")
    expect(last.compareDocumentPosition(output) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(within(comparison).getByText("1 of 2 expected fields match")).toBeTruthy()
    expect(within(comparison).getByText("case bulb_app_offline_advice of dataset support_case_cases")).toBeTruthy()
    const table = within(comparison).getByRole("table", { name: "Expected and actual output fields" })
    const rows = within(table).getAllByRole("row").slice(1).map((row) => within(row).getAllByRole("cell").map((cell) => cell.textContent))
    expect(rows).toEqual([
      ["status", "resolved", "rejected", "differs"],
      ["intent", "defect", "defect", "match"],
    ])
    const statusRow = within(table).getAllByRole("row")[1]
    expect(within(statusRow ?? table).getAllByRole("cell")[2]?.getAttribute("data-tone")).toBe("destructive")
    expect(within(comparison).getByText("1 more field is only in the actual output and is not checked")).toBeTruthy()
  })

  it("says that every expected field matches", async () => {
    server.use(
      http.get(`${API_BASE}/runs/:runId`, () => HttpResponse.json(fromCase())),
      http.get(CASE_URL, () => HttpResponse.json({ name: "bulb_app_offline_advice", inputs: {}, expected_output: { intent: "defect" } })),
    )
    await renderRoute(RUN_PAGE)
    const comparison = await screen.findByRole("region", { name: "Expected vs actual" })
    expect(within(comparison).getByText("the expected field matches")).toBeTruthy()
  })

  it("stays silent when the case has no expected output or the run did not come from a case", async () => {
    server.use(
      http.get(`${API_BASE}/runs/:runId`, () => HttpResponse.json(fromCase())),
      http.get(CASE_URL, () => HttpResponse.json({ name: "bulb_app_offline_advice", inputs: {} })),
    )
    await renderRoute(RUN_PAGE)
    await screen.findByRole("heading", { name: "Output", level: 3 })
    expect(screen.queryByRole("region", { name: "Expected vs actual" })).toBeNull()
  })

  it("tells when the case cannot be read", async () => {
    server.use(
      http.get(`${API_BASE}/runs/:runId`, () => HttpResponse.json(fromCase())),
      http.get(CASE_URL, () => HttpResponse.json({ ok: false, op: "dataset_case_get", code: "NOT_FOUND", message: "gone", problems: [], retry_after_ms: null }, { status: 404 })),
    )
    await renderRoute(RUN_PAGE)
    expect(await screen.findByText("The expected output of case bulb_app_offline_advice could not be loaded.")).toBeTruthy()
  })
})

describe("RunsScreen hand-offs", () => {
  beforeEach(() => {
    sentTexts.length = 0
    captureChat()
  })

  it("drafts a case from the run and hands it to the chat", async () => {
    server.use(
      http.get(`${API_BASE}/runs/:runId`, () => HttpResponse.json(fromCase())),
      http.get(CASE_URL, () => HttpResponse.json({ name: "bulb_app_offline_advice", inputs: {} })),
    )
    await renderRoute(RUN_PAGE)
    fireEvent.click(await screen.findByRole("button", { name: "To cases" }))
    const dialog = await screen.findByRole("dialog", { name: "Draft a case from this run" })
    expect(within(dialog).getByText("The case goes to dataset support_case_cases, where this run came from.")).toBeTruthy()
    expect(dialog.textContent).toContain("- name: \"run_b56d92\"")
    expect(dialog.textContent).toContain("  node_outputs:")
    expect(dialog.textContent).toContain(`    source_run: "${COMPLETED_RUN_ID}"`)
    fireEvent.click(await enabled(within(dialog).getByRole("button", { name: "Hand the case to the chat" })))
    expect((await within(dialog).findByRole("status")).textContent).toBe("Sent to the chat on the left.")
    expect(sentTexts).toHaveLength(1)
    expect(sentTexts[0]).toContain(`Turn run ${COMPLETED_RUN_ID} of flow support_case into a dataset case.`)
    expect(sentTexts[0]).toContain("datasets/support_case_cases.yaml")
    expect(sentTexts[0]).toContain("```yaml\ncases:\n- name: \"run_b56d92\"")
  })

  it("asks the chat to write an experiment comparing agents on the focused step", async () => {
    await renderRoute(`${RUN_PAGE}&stage=${encodeURIComponent("polish|||")}`)
    const navigation = await screen.findByRole("navigation", { name: "Nodes in this run" })
    const button = await enabled(await within(navigation).findByRole("button", { name: "Compare agents on polish" }))
    fireEvent.click(button)
    expect((await within(navigation).findByRole("status")).textContent).toBe("Sent to the chat on the left.")
    expect(sentTexts).toHaveLength(1)
    expect(sentTexts[0]).toContain("Write an experiment that compares agents on the step polish of flow support_case.")
    expect(sentTexts[0]).toContain("- polish__critique uses agent mistral")
    expect(sentTexts[0]).toContain("- polish__revise uses agent gpt")
    expect(sentTexts[0]).toContain(`I noticed it in run ${COMPLETED_RUN_ID}.`)
  })

  it("offers no agent comparison on a step without LLM nodes", async () => {
    await renderRoute(`${RUN_PAGE}&stage=${encodeURIComponent("finalize|||")}`)
    const navigation = await screen.findByRole("navigation", { name: "Nodes in this run" })
    await waitFor(() => {
      expect(within(navigation).getByRole("combobox", { name: "Jump to node" }).textContent).toContain("finalize")
    })
    expect(within(navigation).queryByRole("button", { name: /Compare agents/u })).toBeNull()
  })
})
