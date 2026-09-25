import { fireEvent, screen, waitFor, within } from "@testing-library/react"
import { http, HttpResponse } from "msw"
import { describe, expect, it, vi } from "vitest"
import { API_BASE } from "@/api/client"
import { server } from "@/mocks/node"
import { renderRoute } from "@/test/render-route"

vi.mock("@/features/chat", () => ({
  ChatPanel: () => null,
}))

const OPEN_PREFIX = "Open experiment "

const openLink = (id: string): Promise<HTMLElement> => screen.findByRole("link", { name: `${OPEN_PREFIX}${id}` })

const rowOf = async (id: string): Promise<HTMLElement> => {
  const row = (await openLink(id)).closest("[role=row]")
  if (!(row instanceof HTMLElement)) throw new Error(`No row for ${id}`)
  return row
}

const sectionOf = (name: string): Promise<HTMLElement> => screen.findByRole("region", { name })

const sectionTitles = async (): Promise<readonly string[]> => {
  await screen.findAllByRole("table")
  return screen.getAllByRole("heading", { level: 2 }).map((heading) => heading.textContent)
}

const experimentsIn = async (name: string): Promise<readonly string[]> =>
  within(within(await sectionOf(name)).getByRole("table", { name: `Experiments on ${name}` }))
    .getAllByRole("link")
    .map((link) => (link.getAttribute("aria-label") ?? "").replace(OPEN_PREFIX, ""))

const captureHandoffs = (): unknown[] => {
  const sent: unknown[] = []
  server.use(
    http.post(`${API_BASE}/chat/sessions/:sessionId/messages`, async ({ request }) => {
      const body: unknown = await request.json()
      sent.push(typeof body === "object" && body !== null && "text" in body ? body.text : null)
      return HttpResponse.json({ turn_id: "turn-1", accepted_at: "2026-09-18T03:00:00Z" }, { status: 202 })
    }),
  )
  return sent
}

const clickWhenReady = async (button: HTMLElement): Promise<void> => {
  await waitFor(() => {
    expect(button.hasAttribute("disabled")).toBe(false)
  })
  fireEvent.click(button)
}

describe("ResearchScreen", () => {
  it("shows every experiment of the project in one section per flow, ordered by flow name with experiment flows last", async () => {
    await renderRoute("/research")
    expect(await sectionTitles()).toEqual(["judge_panel", "support_case", "Flows of experiments"])
    expect(await experimentsIn("judge_panel")).toEqual(["judge_panel_agents", "panel_aa_noise", "panel_failure_scan", "panel_judge_prompt", "panel_merge_rule"])
    expect(await experimentsIn("support_case")).toEqual(["reply_look", "reply_noninferior_mistral", "reply_overpromise_risk", "reply_stage_budget"])
    expect(within(await sectionOf("support_case")).getByText("4 experiments")).toBeTruthy()
    expect(screen.getByText("15 experiments")).toBeTruthy()
  })

  it("files experiments whose subject is a flow of their own under experiment flows, even when their cases belong to a flow", async () => {
    await renderRoute("/research")
    expect(await experimentsIn("Flows of experiments")).toEqual([
      "critique_planted_defects",
      "critique_recall_by_agent",
      "intent_ballot_pair",
      "intent_escalation_agents",
      "intent_split_long_messages",
      "panel_single_judge",
    ])
    expect(within(await sectionOf("Flows of experiments")).getByText("6 experiments")).toBeTruthy()
  })

  it("shows the question, subject, variants, last series and spend of each experiment", async () => {
    await renderRoute("/research")
    const row = await rowOf("reply_noninferior_mistral")
    expect(row.textContent).toContain("not worse")
    expect(row.textContent).toContain("support_case · polish")
    expect(row.textContent).toContain("gpt → mistral")
    expect(row.textContent).toContain("confirmedholdout")
    expect(row.textContent).toMatch(/2 series · \$0\.\d\d$/)
    expect((await rowOf("intent_split_long_messages")).textContent).toContain("experiment flow message_intent")
    expect((await rowOf("critique_planted_defects")).textContent).toContain("signaldev")
    expect((await rowOf("reply_look")).textContent).toContain("no series")
    expect((await rowOf("reply_overpromise_risk")).textContent).toContain("AWAITING APPROVAL")
    expect((await rowOf("intent_escalation_agents")).textContent).toContain("deepseek → qwen, gpt")
    expect((await rowOf("intent_escalation_agents")).textContent).toContain("experiment flow escalation · escalate")
  })

  it("filters every section by question and failure mode and hides the flows left empty", async () => {
    const router = await renderRoute("/research")
    await sectionTitles()
    fireEvent.change(screen.getByRole("combobox", { name: "Question" }), { target: { value: "compare" } })
    await waitFor(() => {
      expect(router.state.location.search).toEqual({ question: "compare" })
    })
    await waitFor(async () => {
      expect(await sectionTitles()).toEqual(["judge_panel", "Flows of experiments"])
    })
    expect(await experimentsIn("judge_panel")).toEqual(["judge_panel_agents", "panel_aa_noise", "panel_judge_prompt"])
    expect(await experimentsIn("Flows of experiments")).toEqual(["intent_ballot_pair", "intent_split_long_messages", "panel_single_judge"])
    fireEvent.change(screen.getByRole("combobox", { name: "Failure mode" }), { target: { value: "reply_quality" } })
    expect(await screen.findByText("No experiments match these filters")).toBeTruthy()
    expect(screen.queryByRole("heading", { level: 2 })).toBeNull()
    fireEvent.click(screen.getByRole("link", { name: "Clear filters" }))
    await waitFor(() => {
      expect(router.state.location.search).toEqual({})
    })
    await waitFor(async () => {
      expect(await sectionTitles()).toEqual(["judge_panel", "support_case", "Flows of experiments"])
    })
  })

  it("offers the failure modes of the project in the filter", async () => {
    await renderRoute("/research?question=%22threshold%22")
    expect(await sectionTitles()).toEqual(["support_case", "Flows of experiments"])
    const options = within(screen.getByRole("combobox", { name: "Failure mode" })).getAllByRole("option")
    expect(options.map((option) => option.textContent)).toEqual(["all", "intent_misread", "judge_misses_defect", "overpromise", "panel_wrong_winner", "reply_quality"])
    expect(await experimentsIn("support_case")).toEqual(["reply_overpromise_risk", "reply_stage_budget"])
    expect(await experimentsIn("Flows of experiments")).toEqual(["critique_planted_defects", "critique_recall_by_agent"])
  })

  it("opens an experiment from its row", async () => {
    const router = await renderRoute("/research")
    fireEvent.click(await openLink("judge_panel_agents"))
    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/research/experiments/judge_panel_agents")
    })
  })

  it("hands hypotheses about one flow to the chat from the heading of its section", async () => {
    const sent = captureHandoffs()
    await renderRoute("/research")
    await clickWhenReady(within(await sectionOf("judge_panel")).getByRole("button", { name: "Suggest hypotheses" }))
    expect((await within(await sectionOf("judge_panel")).findByRole("status")).textContent).toBe("Sent to the chat on the left.")
    expect(String(sent[0])).toContain("Suggest hypotheses worth testing")
    expect(String(sent[0])).toContain("reply_noninferior_mistral")
    expect(String(sent[0])).toContain("Focus on the flow judge_panel.")
    expect(String(sent[0])).not.toContain("support_case.")
  })

  it("hands project-wide hypotheses from the page header and offers none on the section of experiment flows", async () => {
    const sent = captureHandoffs()
    await renderRoute("/research?failureMode=%22intent_misread%22")
    expect(await sectionTitles()).toEqual(["Flows of experiments"])
    expect(within(await sectionOf("Flows of experiments")).queryByRole("button")).toBeNull()
    const [pageButton] = screen.getAllByRole("button", { name: "Suggest hypotheses" })
    if (pageButton === undefined) throw new Error("no page-level hypotheses button")
    await clickWhenReady(pageButton)
    expect((await screen.findByRole("status")).textContent).toBe("Sent to the chat on the left.")
    expect(String(sent[0])).not.toContain("Focus on the flow")
    expect(String(sent[0])).toContain("Focus on the failure mode intent_misread.")
  })

  it("says so when the project has no experiments yet", async () => {
    server.use(http.get(`${API_BASE}/experiments`, () => HttpResponse.json({ items: [], next_cursor: null, total_estimate: 0 })))
    await renderRoute("/research")
    expect(await screen.findByText("No experiments yet")).toBeTruthy()
    expect(screen.queryByRole("heading", { level: 2 })).toBeNull()
    expect(screen.getByRole("button", { name: "Suggest hypotheses" })).toBeTruthy()
  })
})
