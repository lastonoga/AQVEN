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

const cellsOf = (row: HTMLElement, role: "columnheader" | "cell"): readonly string[] => within(row).queryAllByRole(role).map((cell) => cell.textContent)

const headersOf = (table: HTMLElement): readonly string[] => cellsOf(within(table).getAllByRole("row")[0] ?? table, "columnheader")

const rowsOf = (table: HTMLElement): readonly (readonly string[])[] => within(table).getAllByRole("row").slice(1).map((row) => cellsOf(row, "cell"))

const factsOf = (what: HTMLElement): HTMLElement => within(what).getByRole("region", { name: "How this experiment is run" })

const tileOf = (scope: HTMLElement, name: string): HTMLElement => within(scope).getByRole("group", { name })

const itemsOf = (list: HTMLElement): readonly string[] => within(list).getAllByRole("listitem").map((item) => item.textContent)

const rulesOf = (what: HTMLElement): readonly string[] => itemsOf(within(what).getByRole("list", { name: "Decision rule" }))

const casesInput = (): HTMLElement => screen.getByRole("spinbutton", { name: "Cases" })

const repeatsInput = (): HTMLElement => screen.getByRole("spinbutton", { name: "Repeats" })

const launchSummary = async (): Promise<HTMLElement> => within(await section("Launch")).getByRole("status", { name: "Launch summary" })

const launchRun = async (): Promise<HTMLElement> => within(await section("Launch")).getByRole("button", { name: "Run" })

describe("ExperimentScreen: question", () => {
  it("titles the page with the question, the verdict of the latest series and a run button with the price", async () => {
    await renderRoute("/research/experiments/reply_noninferior_mistral")
    expect(await screen.findByRole("heading", { level: 1, name: "Variant mistral is not worse than variant gpt on critique by more than 0.05" })).toBeTruthy()
    expect(screen.queryByText(/^Guardrails:/)).toBeNull()
    expect(screen.getAllByText("reply_noninferior_mistral").length).toBeGreaterThan(0)
    expect(screen.getAllByText("confirmed")[0]).toBeTruthy()
    expect(screen.getByRole("button", { name: "Run · ≈ $0.45 from past series" }).hasAttribute("disabled")).toBe(false)
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

  it("opens the clicked step in a sidebar beside the page, not inside the canvas, and closes it", async () => {
    await renderRoute("/research/experiments/reply_noninferior_mistral")
    const graph = await section("Graph of support_case")
    fireEvent.click(await within(graph).findByText("revise"))
    const sidebar = await screen.findByRole("dialog", { name: "polish__revise" })
    expect((await section("What we test")).contains(sidebar)).toBe(false)
    expect(nodeBox(graph, "revise")?.querySelector("[aria-current=true]")).toBeTruthy()
    expect(nodeBox(graph, "panel")?.querySelector("[aria-current=true]")).toBeNull()
    expect(within(sidebar).getByRole("tablist", { name: "Step details" }).textContent).toBe("AgentsInputPromptOutputResults")
    expect(within(sidebar).getByText("openrouter:openai/gpt-oss-20b")).toBeTruthy()
    expect(within(sidebar).getAllByText("openrouter:mistralai/mistral-nemo")).toHaveLength(1)
    expect(within(sidebar).getByText("overridden")).toBeTruthy()
    fireEvent.click(within(sidebar).getByRole("button", { name: "Close step details" }))
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "polish__revise" })).toBeNull()
    })
  })

  it("shows the prompt of a flow step and the results of the step in the latest series", async () => {
    await renderRoute("/research/experiments/reply_noninferior_mistral")
    fireEvent.click(await within(await section("Graph of support_case")).findByText("revise"))
    const sidebar = await screen.findByRole("dialog", { name: "polish__revise" })
    fireEvent.mouseDown(within(sidebar).getByRole("tab", { name: "Prompt" }))
    expect(await within(sidebar).findByText("Template source")).toBeTruthy()
    fireEvent.mouseDown(within(sidebar).getByRole("tab", { name: "Results" }))
    const gpt = await within(sidebar).findByRole("region", { name: "gpt" })
    expect(within(gpt).getAllByRole("listitem")).toHaveLength(4)
    expect(within(gpt).getByText(/^4 of 4 ok · median /)).toBeTruthy()
    expect(new Set(within(gpt).getAllByText(/ · repeat 1$/).map((item) => item.textContent)).size).toBe(4)
    expect(within(sidebar).getByRole("region", { name: "mistral" })).toBeTruthy()
    expect(within(sidebar).getByRole("link", { name: /^Open series/ }).getAttribute("href")).toBe(`/research/series/${RESEARCH_SERIES.noninferiorHoldout}`)
  })

  it("shows the fields and the prompt of an arm step", async () => {
    await renderRoute("/research/experiments/intent_split_long_messages")
    const graph = await section("Graph of one_step")
    expect(nodeBox(graph, "classify_message")?.textContent).toMatch(/1 input.*3 outputs/)
    fireEvent.click(await within(graph).findByText("classify_message"))
    const sidebar = await screen.findByRole("dialog", { name: "classify_message" })
    fireEvent.mouseDown(within(sidebar).getByRole("tab", { name: "Input" }))
    expect(within(sidebar).getByText("message")).toBeTruthy()
    fireEvent.mouseDown(within(sidebar).getByRole("tab", { name: "Output" }))
    expect(within(sidebar).getByText("intent")).toBeTruthy()
    fireEvent.mouseDown(within(sidebar).getByRole("tab", { name: "Prompt" }))
    expect(within(sidebar).getByText(/You decide the intent of a case to the support desk/)).toBeTruthy()
  })

  it("says so when the clicked node is outside the tested range", async () => {
    await renderRoute("/research/experiments/reply_noninferior_mistral")
    fireEvent.click(await within(await section("Graph of support_case")).findByText("triage"))
    const drawer = await screen.findByRole("dialog", { name: "triage" })
    expect(within(drawer).getByText(/Outside the tested range/)).toBeTruthy()
  })

  it("describes a flow step with the description of its node, like the graph inspector", async () => {
    await renderRoute("/research/experiments/reply_noninferior_mistral")
    fireEvent.click(await within(await section("Graph of support_case")).findByText("triage"))
    const sidebar = await screen.findByRole("dialog", { name: "triage" })
    expect(await within(sidebar).findByText(/^Разбирает текст обращения и все вложения/)).toBeTruthy()
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

  it("states the hypothesis with its decision rule, then the variants with the difference from the baseline, then the fact tiles, above the canvas", async () => {
    await renderRoute("/research/experiments/reply_noninferior_mistral")
    const what = await section("What we test")
    const hypothesis = within(what).getByRole("region", { name: "Hypothesis" })
    expect(within(hypothesis).getByText(/^mistral in the revision step of the polish loop is not worse than gpt/)).toBeTruthy()
    expect(rulesOf(what)).toEqual(["critique: difference ≥ −0.05", "cost per passing run ≤ +20%"])
    const table = within(what).getByRole("table", { name: "Variants of this experiment" })
    expect(hypothesis.compareDocumentPosition(table) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(headersOf(table)).toEqual(["Variant", "Role", "Difference from baseline", "Agents · models"])
    expect(rowsOf(table)).toEqual([
      ["gpt", "baseline", "—", "mistralmistral-nemogptgpt-oss-20b"],
      ["mistral", "candidate", "polish › revise: agent gpt → agent mistralgpt-oss-20b → mistral-nemo", "mistralmistral-nemo"],
    ])
    expect(within(table).getAllByText("mistral-nemo")[0]?.getAttribute("title")).toBe("openrouter:mistralai/mistral-nemo")
    const facts = factsOf(what)
    expect(within(facts).getAllByRole("group")).toEqual([tileOf(facts, "Cases"), tileOf(facts, "Measured by"), tileOf(facts, "Where")])
    const graph = within(what).getByRole("region", { name: "Graph of support_case" })
    expect(facts.compareDocumentPosition(graph) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it("shows the cases as a count with the dataset, the working and held-out split, the tags and a link", async () => {
    await renderRoute("/research/experiments/reply_noninferior_mistral")
    const cases = tileOf(factsOf(await section("What we test")), "Cases")
    expect(within(cases).getByText("12")).toBeTruthy()
    expect(within(cases).getByText("of 12")).toBeTruthy()
    expect(within(cases).getByText("support_case_cases")).toBeTruthy()
    expect(within(cases).getByRole("img", { name: "6 working, 6 held out" })).toBeTruthy()
    expect(within(cases).getByText("all tags")).toBeTruthy()
    expect(within(cases).getByRole("link", { name: /Open the cases/ }).getAttribute("href")).toContain("/flows/support_case/cases")
  })

  it("lists each check on its own line with its type and whether a judge is validated", async () => {
    await renderRoute("/research/experiments/reply_noninferior_mistral")
    const measured = tileOf(factsOf(await section("What we test")), "Measured by")
    expect(itemsOf(within(measured).getByRole("list", { name: "Checks" }))).toEqual(["critiquejudgevalidated", "promisescode"])
    expect(within(measured).getByText("validated").closest("[title]")?.getAttribute("title")).toBe("validated by critique_planted_defects")
  })

  it("says where the variants run: the flow and only the tested range, the rest from the case", async () => {
    await renderRoute("/research/experiments/reply_noninferior_mistral")
    const where = tileOf(factsOf(await section("What we test")), "Where")
    expect(within(where).getByText("flow")).toBeTruthy()
    expect(within(where).getByText("support_case")).toBeTruthy()
    expect(within(where).getByText("› only polish")).toBeTruthy()
    expect(within(where).getByText("Earlier steps come from the case")).toBeTruthy()
  })

  it("shows the step chain of each arm when the variants run on different arms", async () => {
    await renderRoute("/research/experiments/intent_split_long_messages")
    const what = await section("What we test")
    const table = within(what).getByRole("table", { name: "Variants of this experiment" })
    expect(headersOf(table)).toEqual(["Variant", "Role", "Steps", "Agents · models"])
    expect(rowsOf(table)).toEqual([
      ["one_step", "baseline", "classify_message", "llamallama-3.1-8b-instruct"],
      ["two_step", "candidate", "condense_message → classify_summary", "llamallama-3.1-8b-instruct"],
    ])
    const where = tileOf(factsOf(what), "Where")
    expect(within(where).getByText("arms")).toBeTruthy()
    expect(within(where).getByText("one_step, two_step")).toBeTruthy()
  })

  it("marks the one variant of a threshold as tested, with no difference column and the threshold as the rule", async () => {
    await renderRoute("/research/experiments/critique_planted_defects")
    const what = await section("What we test")
    const table = within(what).getByRole("table", { name: "Variants of this experiment" })
    expect(headersOf(table)).toEqual(["Variant", "Role", "Agents · models"])
    expect(rowsOf(table)).toEqual([["deepseek", "tested", "deepseekdeepseek-v4-flash-0731"]])
    expect(rulesOf(what)).toEqual(["label ≥ 0.85 ± 0.05"])
    const facts = factsOf(what)
    expect(itemsOf(within(tileOf(facts, "Measured by")).getByRole("list", { name: "Checks" }))).toEqual(["labelbuilt-in"])
    const where = tileOf(facts, "Where")
    expect(within(where).getByText("arm")).toBeTruthy()
    expect(within(where).getByText("critique_only")).toBeTruthy()
    expect(within(where).getByText("every step")).toBeTruthy()
    expect(within(within(what).getByRole("region", { name: "Graph of critique_only" })).getByText("tested")).toBeTruthy()
  })

  it("compares the variants of a threshold on many variants with the first one", async () => {
    await renderRoute("/research/experiments/reply_stage_budget")
    const table = within(await section("What we test")).getByRole("table", { name: "Variants of this experiment" })
    expect(headersOf(table)).toEqual(["Variant", "Role", "Difference from three_families", "Agents · models"])
    expect(rowsOf(table)[1]).toEqual([
      "mistral_only",
      "tested",
      "drafts › gemini: agent gemini → agent mistralgemini-2.5-flash-lite → mistral-nemodrafts › gpt: agent gpt → agent mistralgpt-oss-20b → mistral-nemo",
      "mistralmistral-nemo",
    ])
  })

  it("names the goal of a look with no verdict, and its cases by tag", async () => {
    await renderRoute("/research/experiments/reply_look")
    const what = await section("What we test")
    expect(within(what).getByRole("region", { name: "Goal" })).toBeTruthy()
    expect(rulesOf(what)).toEqual(["no verdict"])
    expect(rowsOf(within(what).getByRole("table", { name: "Variants of this experiment" }))).toEqual([["current", "tested", "mistralmistral-nemogptgpt-oss-20b"]])
    const cases = tileOf(factsOf(what), "Cases")
    expect(within(cases).getByText("5")).toBeTruthy()
    expect(within(cases).getByText("of 12")).toBeTruthy()
    expect(within(cases).getByRole("img", { name: "4 working, 1 held out" })).toBeTruthy()
    expect(within(cases).getByText("regression=yes")).toBeTruthy()
    expect(within(cases).getByRole("link", { name: /Open the cases/ }).getAttribute("href")).toContain("/flows/support_case/cases")
  })

  it("says so when two variants run the same setup", async () => {
    await renderRoute("/research/experiments/panel_aa_noise")
    const table = within(await section("What we test")).getByRole("table", { name: "Variants of this experiment" })
    expect(rowsOf(table)[1]?.[2]).toBe("no difference")
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

  it("keeps the run buttons in the header and the launch when there is no series yet", async () => {
    await renderRoute("/research/experiments/reply_look")
    const answer = await section("Answer")
    expect(within(answer).getByText("No series yet")).toBeTruthy()
    expect(within(answer).queryByRole("button", { name: RUN })).toBeNull()
    expect(screen.getAllByRole("button", { name: RUN })).toHaveLength(2)
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
    expect((await within(await section("Answer")).findByRole("status")).textContent).toBe("Sent to the chat on the left.")
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
  it("lays the launch out as a compact form, a notice line and one summary line ending with the run button", async () => {
    await renderRoute("/research/experiments/reply_noninferior_mistral")
    const launch = await section("Launch")
    expect(within(launch).queryByRole("button", { name: "Adjust" })).toBeNull()
    expect(casesInput()).toHaveProperty("value", "6")
    expect(within(launch).getByText("of 6")).toBeTruthy()
    const hint = within(launch).getByText("52 recommended, only 6 here: expect a wide interval")
    expect(hint.getAttribute("title")).toMatch(/only 6 are available: expect a wide interval/)
    expect(repeatsInput()).toHaveProperty("value", "3")
    expect(within(launch).getByRole("radio", { name: "working" }).getAttribute("aria-checked")).toBe("true")
    const summary = await launchSummary()
    expect(summary.textContent).toBe("36 attempts · ≈ $0.45 from past series · cap $1.00")
    expect(summary.compareDocumentPosition(await launchRun()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect((await launchRun()).hasAttribute("disabled")).toBe(false)
  })

  it("steps the cases and repeats and re-counts the attempts", async () => {
    await renderRoute("/research/experiments/reply_noninferior_mistral")
    const launch = await section("Launch")
    expect(within(launch).getByRole("button", { name: "More cases" }).hasAttribute("disabled")).toBe(true)
    fireEvent.click(within(launch).getByRole("button", { name: "Fewer cases" }))
    fireEvent.click(within(launch).getByRole("button", { name: "More repeats" }))
    expect(casesInput()).toHaveProperty("value", "5")
    expect(repeatsInput()).toHaveProperty("value", "4")
    expect((await launchSummary()).textContent).toMatch(/^40 attempts · /)
    await waitFor(async () => {
      expect((await launchSummary()).textContent).toBe("40 attempts · ≈ $0.50 from past series · cap $1.00")
    })
  })

  it("keeps the last estimate dimmed while it re-estimates and asks once after the steps settle", async () => {
    const experiment = liveExperiments.find((item) => item.experiment_id === "reply_noninferior_mistral")
    if (experiment === undefined) throw new Error("no experiment")
    await renderRoute("/research/experiments/reply_noninferior_mistral")
    const launch = await section("Launch")
    const asked = vi.fn()
    server.use(
      http.post(`${API_BASE}/experiments/:experimentId/estimate`, () => {
        asked()
        return HttpResponse.json(estimateFor(experiment, { on: "dev", cases: 6, repeats: 6 }))
      }),
    )
    const more = within(launch).getByRole("button", { name: "More repeats" })
    fireEvent.click(more)
    fireEvent.click(more)
    fireEvent.click(more)
    const summary = await launchSummary()
    expect(summary.textContent).toBe("72 attempts · ≈ $0.45 from past series · cap $1.00")
    expect(summary.querySelector("[aria-busy=true]")).toBeTruthy()
    await waitFor(() => {
      expect(summary.querySelector("[aria-busy=true]")).toBeNull()
    })
    expect(summary.textContent).toBe("72 attempts · ≈ $0.90 from past series · cap $1.00")
    expect(asked).toHaveBeenCalledTimes(1)
  })

  it("re-estimates a smaller launch and keeps it runnable with a warning", async () => {
    await renderRoute("/research/experiments/reply_noninferior_mistral")
    fireEvent.change(casesInput(), { target: { value: "3" } })
    await waitFor(async () => {
      expect((await launchSummary()).textContent).toMatch(/^18 attempts · /)
    })
    expect(await within(await section("Launch")).findByText("52 recommended, only 6 here: expect a wide interval")).toBeTruthy()
    expect((await launchRun()).hasAttribute("disabled")).toBe(false)
    expect(screen.getByRole("button", { name: /^Run · / }).hasAttribute("disabled")).toBe(false)
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
    expect((await launchSummary()).textContent).toBe("36 attempts · no price estimate · needs your approval")
    expect(screen.getByRole("button", { name: "Run · no price estimate" })).toBeTruthy()
  })

  it.each([
    ["history", "≈ $0.45 from past series"],
    ["prices", "≈ $0.45 at provider prices"],
    ["bound", "≤ $0.45 upper bound"],
  ] as const)("names where a %s estimate comes from in the launch and on the run button", async (source, label) => {
    const experiment = liveExperiments.find((item) => item.experiment_id === "reply_noninferior_mistral")
    if (experiment === undefined) throw new Error("no experiment")
    server.use(http.post(`${API_BASE}/experiments/:experimentId/estimate`, () => HttpResponse.json({ ...estimateFor(experiment, { on: "dev" }), usd_source: source })))
    await renderRoute("/research/experiments/reply_noninferior_mistral")
    expect((await launchSummary()).textContent).toBe(`36 attempts · ${label} · cap $1.00`)
    expect(screen.getByRole("button", { name: `Run · ${label}` })).toBeTruthy()
  })

  it("refuses a size outside the cases of the split", async () => {
    await renderRoute("/research/experiments/reply_noninferior_mistral")
    fireEvent.change(casesInput(), { target: { value: "7" } })
    expect(await screen.findByText("Cases: a whole number from 1 to 6")).toBeTruthy()
    expect(casesInput().getAttribute("aria-invalid")).toBe("true")
    expect(screen.getAllByRole("button", { name: RUN }).map((button) => button.hasAttribute("disabled"))).toEqual([true, true])
    fireEvent.change(repeatsInput(), { target: { value: "21" } })
    expect(await screen.findByText("Repeats: a whole number from 1 to 20")).toBeTruthy()
    expect(screen.getByText("Cases: a whole number from 1 to 6")).toBeTruthy()
    expect((await launchSummary()).textContent).toBe("—")
  })

  it("runs a series on the held-out cases and opens it", async () => {
    const router = await renderRoute("/research/experiments/reply_noninferior_mistral")
    fireEvent.click(within(await section("Launch")).getByRole("radio", { name: "held-out" }))
    fireEvent.change(casesInput(), { target: { value: "4" } })
    await waitFor(async () => {
      expect((await launchSummary()).textContent).toMatch(/^24 attempts · /)
    })
    fireEvent.click(await launchRun())
    await waitFor(() => {
      expect(router.state.location.pathname).toMatch(/^\/research\/series\//)
    })
    expect(await screen.findByText("RUNNING")).toBeTruthy()
    expect(screen.getByText("0 of 24 attempts")).toBeTruthy()
  })

  it("approves the spend of a waiting series, then stops it", async () => {
    await renderRoute("/research/experiments/reply_overpromise_risk")
    const launch = await section("Launch")
    expect((await launchSummary()).textContent).toMatch(/ · over the \$1\.00 cap: needs your approval$/)
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

  it("marks the spend of a series with unpriced attempts as a lower bound and says why", async () => {
    await renderRoute("/research/experiments/intent_split_long_messages")
    const history = await screen.findByRole("list", { name: "Series of this experiment" })
    expect(within(history).getAllByRole("listitem")[0]?.textContent).toMatch(/ · ≥ \$\d+\.\d+/)
    expect(within(await section("Series history")).getByText("Spend is a lower bound: 6 attempts in 1 series ran on a model without a known price.")).toBeTruthy()
  })

  it("shows plain spend without a note when every attempt was priced", async () => {
    await renderRoute("/research/experiments/reply_noninferior_mistral")
    const history = await section("Series history")
    expect(history.textContent).not.toContain("≥")
    expect(within(history).queryByText(/Spend is a lower bound/)).toBeNull()
  })

  it("keeps the files, the question parameters, the plan and the notes collapsed", async () => {
    await renderRoute("/research/experiments/reply_noninferior_mistral")
    const details = await section("Technical details")
    expect(within(details).queryByText(/experiment\.yaml/)).toBeNull()
    fireEvent.click(within(details).getByRole("button", { name: "Technical details" }))
    expect(within(details).getByText(/experiments\/reply_noninferior_mistral\/experiment\.yaml/)).toBeTruthy()
    expect(within(details).getByText(/not worse · critique ↑ · primary · margin 0\.05; cost per passing run ↓ · guardrail · margin 20%/)).toBeTruthy()
    expect(within(details).getByText("12 cases × 3 repeats")).toBeTruthy()
    expect(within(details).getByRole("region", { name: "Notes of this experiment" }).textContent).toContain("mistral in the revision step")
  })
})
