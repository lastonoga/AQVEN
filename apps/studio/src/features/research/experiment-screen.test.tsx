import { fireEvent, screen, waitFor, within } from "@testing-library/react"
import { http, HttpResponse } from "msw"
import { describe, expect, it, vi } from "vitest"
import { API_BASE } from "@/api/client"
import { liveExperiments } from "@/mocks/data/experiments"
import { estimateFor, RESEARCH_SERIES } from "@/mocks/data/research"
import { server } from "@/mocks/node"
import { renderRoute } from "@/test/render-route"

vi.mock("@/features/chat", () => ({
  ChatPanel: () => null,
}))

const section = (name: string): Promise<HTMLElement> => screen.findByRole("region", { name })

const nodeBox = (graph: HTMLElement, name: string): HTMLElement | null => within(graph).getByText(name).closest(".react-flow__node")

const RUN = /^Run( · .+)?$/

const casesInput = (): HTMLElement => screen.getByRole("spinbutton", { name: "Cases (N)" })

const launchText = async (): Promise<string> => (await section("Launch")).textContent

const openAdjust = async (): Promise<void> => {
  fireEvent.click(within(await section("Launch")).getByRole("button", { name: "Adjust" }))
  await section("Launch settings")
}

describe("ExperimentScreen: question", () => {
  it("titles the page with the question, the verdict of the latest series and a run button with the price", async () => {
    await renderRoute("/research/experiments/reply_noninferior_mistral")
    expect(await screen.findByRole("heading", { level: 1, name: "mistral is not worse than gpt on critique by more than 0.05" })).toBeTruthy()
    expect(screen.getByText("Guardrails: cost per pass at most 20% worse")).toBeTruthy()
    expect(screen.getByText(/^reply_noninferior_mistral · /)).toBeTruthy()
    expect(screen.getAllByText("confirmed")[0]).toBeTruthy()
    expect(screen.getByRole("button", { name: "Run · $0.45" }).hasAttribute("disabled")).toBe(false)
  })
})

describe("ExperimentScreen: what we test", () => {
  it("draws the subject flow with the range in focus and marks the swapped agent", async () => {
    await renderRoute("/research/experiments/reply_noninferior_mistral")
    const graph = await section("Graph of support_case")
    expect(await within(graph).findByText("swap: gpt → mistral")).toBeTruthy()
    expect(nodeBox(graph, "triage")?.className).toContain("opacity-35")
    expect(nodeBox(graph, "revise")?.className).not.toContain("opacity-35")
    expect(within(graph).getByText("flow support_case")).toBeTruthy()
  })

  it("opens a drawer with the agent and model of each variant on the clicked node", async () => {
    await renderRoute("/research/experiments/reply_noninferior_mistral")
    const graph = await section("Graph of support_case")
    fireEvent.click(await within(graph).findByText("revise"))
    const drawer = await screen.findByRole("dialog", { name: "polish__revise" })
    expect(within(drawer).getByText("openrouter:openai/gpt-oss-20b")).toBeTruthy()
    expect(within(drawer).getAllByText("openrouter:mistralai/mistral-nemo")).toHaveLength(1)
    expect(within(drawer).getByText("overridden")).toBeTruthy()
    fireEvent.click(within(drawer).getByRole("button", { name: "Close" }))
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "polish__revise" })).toBeNull()
    })
  })

  it("says so when the clicked node is outside the tested range", async () => {
    await renderRoute("/research/experiments/reply_noninferior_mistral")
    fireEvent.click(await within(await section("Graph of support_case")).findByText("triage"))
    const drawer = await screen.findByRole("dialog", { name: "triage" })
    expect(within(drawer).getByText(/Outside the tested range/)).toBeTruthy()
  })

  it("stacks one graph per arm with its variants above it", async () => {
    await renderRoute("/research/experiments/intent_split_long_messages")
    const one = await section("Graph of one_step")
    const two = await section("Graph of two_step")
    expect(one.compareDocumentPosition(two) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(within(one).getByText("arm one_step")).toBeTruthy()
    expect(within(two).getByText("two_step", { selector: "span" })).toBeTruthy()
    expect(await within(two).findByText("condense_message")).toBeTruthy()
  })

  it("lists the cases in words", async () => {
    await renderRoute("/research/experiments/reply_look")
    const canvas = await section("What we test")
    expect(within(canvas).getByText("Cases: 5 of 12 from support_case_cases, tagged regression=yes; 4 working, 1 held out")).toBeTruthy()
    expect(within(canvas).getByRole("link", { name: /Open the cases/ }).getAttribute("href")).toContain("/flows/support_case/cases")
  })

  it("names each check with its source and the judge's validation", async () => {
    await renderRoute("/research/experiments/reply_noninferior_mistral")
    const checks = within(await section("What we test")).getByText(/^Checks: /).textContent
    expect(checks).toContain("critique (judge, validated by critique_planted_defects)")
    expect(checks).toContain("promises (code)")
  })
})

describe("ExperimentScreen: answer", () => {
  it("answers with the verdict of the latest series and offers what to do next", async () => {
    await renderRoute("/research/experiments/reply_noninferior_mistral")
    const answer = await section("Answer")
    expect(within(answer).getByText(/clears the 0\.05 margin; cost per pass stays within 20%/)).toBeTruthy()
    expect(within(answer).getByRole("button", { name: "Run again on fresh cases" })).toBeTruthy()
    expect(within(answer).getByRole("button", { name: "Ask the agent for the next hypothesis" })).toBeTruthy()
    expect(within(answer).getByRole("link", { name: /Open series/ }).getAttribute("href")).toBe(`/research/series/${RESEARCH_SERIES.noninferiorHoldout}`)
  })

  it("waits for a running series", async () => {
    await renderRoute("/research/experiments/intent_escalation_agents")
    expect(within(await section("Answer")).getByText("The answer comes when the series finishes.")).toBeTruthy()
  })

  it("offers the run when there is no series yet", async () => {
    await renderRoute("/research/experiments/reply_look")
    const answer = await section("Answer")
    expect(within(answer).getByText("No series yet")).toBeTruthy()
    expect(within(answer).getByRole("button", { name: RUN })).toBeTruthy()
    expect(screen.queryByRole("region", { name: "Comparison" })).toBeNull()
    expect(screen.queryByRole("region", { name: "Series history" })).toBeNull()
  })

  it("runs again on the held-out cases", async () => {
    const router = await renderRoute("/research/experiments/reply_noninferior_mistral")
    fireEvent.click(within(await section("Answer")).getByRole("button", { name: "Run again on fresh cases" }))
    await waitFor(() => {
      expect(router.state.location.pathname).toMatch(/^\/research\/series\//)
    })
    expect(await screen.findByText("RUNNING")).toBeTruthy()
    expect(screen.getByText("holdout")).toBeTruthy()
    expect(screen.getByText("0 of 36 attempts")).toBeTruthy()
  })

  it("hands the next hypothesis to the chat with the latest verdict", async () => {
    const sent: unknown[] = []
    server.use(
      http.post(`${API_BASE}/chat/sessions/:sessionId/messages`, async ({ request }) => {
        const body: unknown = await request.json()
        sent.push(typeof body === "object" && body !== null && "text" in body ? body.text : null)
        return HttpResponse.json({ turn_id: "turn-1", accepted_at: "2026-09-18T03:00:00Z" }, { status: 202 })
      }),
    )
    await renderRoute("/research/experiments/reply_noninferior_mistral")
    const button = within(await section("Answer")).getByRole("button", { name: "Ask the agent for the next hypothesis" })
    await waitFor(() => {
      expect(button.hasAttribute("disabled")).toBe(false)
    })
    fireEvent.click(button)
    expect((await screen.findByRole("status")).textContent).toBe("Sent to the chat on the left.")
    expect(String(sent[0])).toContain("Suggest the next hypothesis after the experiment reply_noninferior_mistral")
    expect(String(sent[0])).toContain("ended confirmed")
  })
})

describe("ExperimentScreen: comparison", () => {
  it("puts baseline and candidate side by side with the difference between them", async () => {
    await renderRoute("/research/experiments/reply_noninferior_mistral")
    const comparison = await section("Comparison")
    const [baseline, difference, candidate] = within(comparison).getAllByRole("group")
    expect(baseline?.getAttribute("aria-label")).toBe("gpt")
    expect(difference?.getAttribute("aria-label")).toBe("Difference")
    expect(candidate?.getAttribute("aria-label")).toBe("mistral")
    expect(difference?.textContent).toMatch(/95% CI .+margin 0\.05/)
    expect(within(baseline ?? comparison).getByText(/^cost per pass \$/)).toBeTruthy()
    expect(within(baseline ?? comparison).getByRole("img", { name: /always, .* flaky, .* never/ })).toBeTruthy()
  })

  it("shows one card with the threshold for a threshold question", async () => {
    await renderRoute("/research/experiments/critique_planted_defects")
    const comparison = await section("Comparison")
    expect(within(comparison).getByText(/above 0\.85 ± 0\.05$/)).toBeTruthy()
    expect(within(comparison).getAllByRole("group").map((group) => group.getAttribute("aria-label"))).toEqual(["deepseek"])
  })
})

describe("ExperimentScreen: cases where variants disagree", () => {
  it("lists the cases of the latest series where the variants disagree and links to them in the series", async () => {
    await renderRoute("/research/experiments/reply_noninferior_mistral")
    const disagree = await section("Cases where variants disagree")
    const items = within(disagree).getAllByRole("listitem")
    expect(items.map((item) => item.firstChild?.textContent)).toEqual(["nova_no_charge_replacement", "nova_runtime_advice", "zigbee_pairing_advice"])
    expect(items[0]?.textContent).toMatch(/gpt \d\/3mistral \d\/3/)
    expect(within(disagree).getByRole("link", { name: /^All 3 in the series/ }).getAttribute("href")).toBe(`/research/series/${RESEARCH_SERIES.noninferiorHoldout}?divergent=true`)
  })

  it("skips the block for a single variant", async () => {
    await renderRoute("/research/experiments/critique_planted_defects")
    await section("Answer")
    expect(screen.queryByRole("region", { name: "Cases where variants disagree" })).toBeNull()
  })
})

describe("ExperimentScreen: launch", () => {
  it("sums the launch up in one line and keeps the settings behind Adjust", async () => {
    await renderRoute("/research/experiments/reply_noninferior_mistral")
    expect(await launchText()).toContain("6 cases × 3 repeats · 36 attempts · ≈ $0.45")
    expect(await launchText()).toContain("working cases")
    expect(screen.queryByRole("spinbutton", { name: "Cases (N)" })).toBeNull()
    await openAdjust()
    expect(casesInput()).toHaveProperty("value", "6")
    expect(screen.getByText("1 to 6 on working cases")).toBeTruthy()
    expect(screen.getByText("Recommended N ≈ 52")).toBeTruthy()
    expect(screen.getByText(/only 6 are available: expect a wide interval/)).toBeTruthy()
    expect(screen.getByText(/Spend cap \$1\.00/)).toBeTruthy()
  })

  it("re-estimates a smaller launch and keeps it runnable with a warning", async () => {
    await renderRoute("/research/experiments/reply_noninferior_mistral")
    await openAdjust()
    fireEvent.change(casesInput(), { target: { value: "3" } })
    await waitFor(async () => {
      expect(await launchText()).toContain("18 attempts")
    })
    expect(screen.getAllByRole("note")[0]?.textContent).toContain("Fewer cases than recommended (52)")
    expect(screen.getByRole("button", { name: RUN }).hasAttribute("disabled")).toBe(false)
  })

  it("says so when the models have no price and the series needs an approval", async () => {
    const experiment = liveExperiments.find((item) => item.experiment_id === "reply_noninferior_mistral")
    if (experiment === undefined) throw new Error("no experiment")
    server.use(
      http.post(`${API_BASE}/experiments/:experimentId/estimate`, () =>
        HttpResponse.json({ ...estimateFor(experiment, { on: "dev" }), usd: null, minutes: null, usd_source: "unknown", needs_approval: true }),
      ),
    )
    await renderRoute("/research/experiments/reply_noninferior_mistral")
    expect(await launchText()).toContain("no price estimate")
    expect(screen.getByRole("button", { name: "Run" })).toBeTruthy()
    expect(screen.getByText(/have no price yet, so the spend cannot be estimated/)).toBeTruthy()
  })

  it("refuses a size outside the cases of the split", async () => {
    await renderRoute("/research/experiments/reply_noninferior_mistral")
    await openAdjust()
    fireEvent.change(casesInput(), { target: { value: "7" } })
    expect(await screen.findByText("N must be a whole number from 1 to 6")).toBeTruthy()
    expect(screen.getByRole("button", { name: RUN }).hasAttribute("disabled")).toBe(true)
    fireEvent.change(screen.getByRole("spinbutton", { name: "Repeats (R)" }), { target: { value: "21" } })
    expect(await screen.findByText("R must be a whole number from 1 to 20")).toBeTruthy()
  })

  it("runs a series on the held-out cases and opens it", async () => {
    const router = await renderRoute("/research/experiments/reply_noninferior_mistral")
    await openAdjust()
    fireEvent.click(screen.getByRole("radio", { name: "held-out cases" }))
    fireEvent.change(casesInput(), { target: { value: "4" } })
    await waitFor(async () => {
      expect(await launchText()).toContain("24 attempts")
    })
    fireEvent.click(screen.getByRole("button", { name: /^Run · / }))
    await waitFor(() => {
      expect(router.state.location.pathname).toMatch(/^\/research\/series\//)
    })
    expect(await screen.findByText("RUNNING")).toBeTruthy()
    expect(screen.getByText("0 of 24 attempts")).toBeTruthy()
  })

  it("approves the spend of a waiting series, then stops it", async () => {
    await renderRoute("/research/experiments/reply_overpromise_risk")
    const launch = await section("Launch")
    expect(within(launch).getByText("This estimate is above the $1.00 spend cap: the series will wait for your approval before it runs.")).toBeTruthy()
    expect(within(launch).getByText("AWAITING APPROVAL")).toBeTruthy()
    fireEvent.click(within(launch).getByRole("button", { name: "Approve spend" }))
    expect(await within(launch).findByText("RUNNING")).toBeTruthy()
    expect(within(launch).queryByRole("button", { name: "Approve spend" })).toBeNull()
    fireEvent.click(within(launch).getByRole("button", { name: "Stop" }))
    await waitFor(() => {
      expect(within(launch).queryByRole("button", { name: "Stop" })).toBeNull()
    })
    expect(within(await section("Series history")).getByText("CANCELLED")).toBeTruthy()
  })
})

describe("ExperimentScreen: history and details", () => {
  it("lists the series newest first and opens one", async () => {
    const router = await renderRoute("/research/experiments/reply_noninferior_mistral")
    const history = await screen.findByRole("list", { name: "Series of this experiment" })
    const rows = within(history).getAllByRole("listitem")
    expect(rows.map((row) => row.textContent)).toEqual([expect.stringMatching(/holdout · 6×3 · \$0\.\d\dDONEconfirmed$/), expect.stringMatching(/dev · 6×3 · \$0\.\d\dDONEsignal$/)])
    fireEvent.click(within(history).getAllByRole("link")[0] ?? document.body)
    await waitFor(() => {
      expect(router.state.location.pathname).toBe(`/research/series/${RESEARCH_SERIES.noninferiorHoldout}`)
    })
  })

  it("keeps the files, the question parameters, the plan and the notes collapsed", async () => {
    await renderRoute("/research/experiments/reply_noninferior_mistral")
    const details = await section("Technical details")
    expect(within(details).queryByText(/experiment\.yaml/)).toBeNull()
    fireEvent.click(within(details).getByRole("button", { name: "Technical details" }))
    expect(within(details).getByText(/experiments\/reply_noninferior_mistral\/experiment\.yaml/)).toBeTruthy()
    expect(within(details).getByText(/not worse · critique ↑ · primary · margin 0\.05; cost per pass ↓ · guardrail · margin 20%/)).toBeTruthy()
    expect(within(details).getByText("12 cases × 3 repeats")).toBeTruthy()
    expect(within(details).getByRole("region", { name: "Notes of this experiment" }).textContent).toContain("mistral in the revision step")
  })
})
