import { fireEvent, screen, waitFor, within } from "@testing-library/react"
import { http, HttpResponse } from "msw"
import { describe, expect, it, vi } from "vitest"
import { API_BASE } from "@/api/client"
import { server } from "@/mocks/node"
import { renderRoute } from "@/test/render-route"

vi.mock("@/features/chat", () => ({
  ChatPanel: () => null,
}))

const table = (): Promise<HTMLElement> => screen.findByRole("table", { name: "Experiments" })

const rowOf = async (id: string): Promise<HTMLElement> => {
  const rows = within(await table()).getAllByRole("row")
  const row = rows.find((item) => within(item).queryByText(id) !== null)
  if (row === undefined) throw new Error(`No row for ${id}`)
  return row
}

const experimentIds = async (): Promise<readonly string[]> =>
  within(await table())
    .getAllByRole("link")
    .map((link) => link.getAttribute("aria-label") ?? "")

describe("ResearchScreen", () => {
  it("lists every experiment with its question, subject, variants, last series and spend", async () => {
    await renderRoute("/research")
    expect(await experimentIds()).toHaveLength(13)
    const row = await rowOf("reply_noninferior_mistral")
    expect(row.textContent).toContain("not worse")
    expect(row.textContent).toContain("support_case · polish")
    expect(row.textContent).toContain("gpt → mistral")
    expect(row.textContent).toContain("confirmedholdout")
    expect(row.textContent).toMatch(/2 series · \$0\.\d\d$/)
    expect((await rowOf("intent_split_long_messages")).textContent).toContain("arm one_step")
    expect((await rowOf("critique_planted_defects")).textContent).toContain("signaldev")
    expect((await rowOf("reply_look")).textContent).toContain("no series")
    expect((await rowOf("reply_overpromise_risk")).textContent).toContain("AWAITING APPROVAL")
    expect((await rowOf("intent_escalation_agents")).textContent).toContain("deepseek → qwen, gpt")
    expect((await rowOf("intent_escalation_agents")).textContent).toContain("arm escalation · escalate")
  })

  it("filters by flow, question and failure mode through the address", async () => {
    const router = await renderRoute("/research")
    await table()
    fireEvent.change(screen.getByRole("combobox", { name: "Flow" }), { target: { value: "judge_panel" } })
    await waitFor(() => {
      expect(router.state.location.search).toEqual({ flow: "judge_panel" })
    })
    await waitFor(async () => {
      expect(await experimentIds()).toEqual([
        "Open experiment judge_panel_agents",
        "Open experiment panel_aa_noise",
        "Open experiment panel_failure_scan",
        "Open experiment panel_single_judge",
      ])
    })
    fireEvent.change(screen.getByRole("combobox", { name: "Question" }), { target: { value: "compare" } })
    await waitFor(() => {
      expect(router.state.location.search).toEqual({ flow: "judge_panel", question: "compare" })
    })
    fireEvent.change(screen.getByRole("combobox", { name: "Failure mode" }), { target: { value: "intent_misread" } })
    expect(await screen.findByText("No experiments match these filters")).toBeTruthy()
    fireEvent.click(screen.getByRole("link", { name: "Clear filters" }))
    await waitFor(() => {
      expect(router.state.location.search).toEqual({})
    })
    expect(await experimentIds()).toHaveLength(13)
  })

  it("offers the failure modes of the project in the filter", async () => {
    await renderRoute("/research?question=%22threshold%22")
    await table()
    const options = within(screen.getByRole("combobox", { name: "Failure mode" })).getAllByRole("option")
    expect(options.map((option) => option.textContent)).toEqual(["all", "intent_misread", "judge_misses_defect", "overpromise", "panel_wrong_winner", "reply_quality"])
    expect(await experimentIds()).toEqual([
      "Open experiment critique_planted_defects",
      "Open experiment critique_recall_by_agent",
      "Open experiment reply_overpromise_risk",
      "Open experiment reply_stage_budget",
    ])
  })

  it("opens an experiment from its row", async () => {
    const router = await renderRoute("/research")
    fireEvent.click(within(await table()).getByRole("link", { name: "Open experiment judge_panel_agents" }))
    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/research/experiments/judge_panel_agents")
    })
  })

  it("hands the hypotheses to the chat with the experiments that already exist", async () => {
    const sent: unknown[] = []
    server.use(
      http.post(`${API_BASE}/chat/sessions/:sessionId/messages`, async ({ request }) => {
        const body: unknown = await request.json()
        sent.push(typeof body === "object" && body !== null && "text" in body ? body.text : null)
        return HttpResponse.json({ turn_id: "turn-1", accepted_at: "2026-09-18T03:00:00Z" }, { status: 202 })
      }),
    )
    await renderRoute("/research?flow=%22support_case%22")
    const button = await screen.findByRole("button", { name: "Suggest hypotheses" })
    await waitFor(() => {
      expect(button.hasAttribute("disabled")).toBe(false)
    })
    fireEvent.click(button)
    expect((await screen.findByRole("status")).textContent).toBe("Sent to the chat on the left.")
    expect(String(sent[0])).toContain("Suggest hypotheses worth testing")
    expect(String(sent[0])).toContain("reply_noninferior_mistral")
    expect(String(sent[0])).toContain("Focus on the flow support_case.")
  })
})
