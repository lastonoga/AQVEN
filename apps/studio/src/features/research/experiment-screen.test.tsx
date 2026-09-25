import { fireEvent, screen, waitFor, within } from "@testing-library/react"
import { http, HttpResponse } from "msw"
import { describe, expect, it, vi } from "vitest"
import { API_BASE } from "@/api/client"
import { liveExperiments } from "@/mocks/data/experiments"
import type { ApiSeriesSummary } from "@/domain"
import { initialSeries, launchPlanFor, RESEARCH_SERIES, summaryOf } from "@/mocks/data/research"
import { server } from "@/mocks/node"
import { renderRoute } from "@/test/render-route"

vi.mock("@/features/chat", () => ({
  ChatPanel: () => null,
}))

const section = (name: string): Promise<HTMLElement> => screen.findByRole("region", { name })

const nodeBox = (graph: HTMLElement, name: string): HTMLElement | null => within(graph).getByText(name).closest(".react-flow__node")

const RUN = "Run"

const cellsOf = (row: HTMLElement, role: "columnheader" | "cell"): readonly string[] => within(row).queryAllByRole(role).map((cell) => cell.textContent)

const headersOf = (table: HTMLElement): readonly string[] => cellsOf(within(table).getAllByRole("row")[0] ?? table, "columnheader")

const rowsOf = (table: HTMLElement): readonly (readonly string[])[] => within(table).getAllByRole("row").slice(1).map((row) => cellsOf(row, "cell"))

const factsOf = (what: HTMLElement): HTMLElement => within(what).getByRole("region", { name: "How this experiment is run" })

const captionOf = (what: HTMLElement, text: string): HTMLElement => within(what).getByText((_, element) => element?.tagName === "P" && element.textContent === text)

const tableOf = (what: HTMLElement): HTMLElement => within(what).getByRole("table", { name: "Variants of this experiment" })

const changesOf = (what: HTMLElement): HTMLElement => within(what).getByRole("region", { name: "What changes" })

const scrolledTo = (scroll: { readonly mock: { readonly instances: readonly unknown[] } }, id: string): boolean =>
  scroll.mock.instances.some((element) => element instanceof Element && element.id === id)

const tileOf = (scope: HTMLElement, name: string): HTMLElement => within(scope).getByRole("group", { name })

const itemsOf = (list: HTMLElement): readonly string[] => within(list).getAllByRole("listitem").map((item) => item.textContent)

const rulesOf = (what: HTMLElement): readonly string[] => itemsOf(within(what).getByRole("list", { name: "Decision rule" }))

const casesInput = (): HTMLElement => screen.getByRole("spinbutton", { name: "Cases" })

const repeatsInput = (): HTMLElement => screen.getByRole("spinbutton", { name: "Repeats" })

const launchSummary = async (): Promise<HTMLElement> => within(await section("Launch")).getByRole("status", { name: "Launch summary" })

const launchRun = async (): Promise<HTMLElement> => within(await section("Launch")).getByRole("button", { name: "Run" })

describe("ExperimentScreen: question", () => {
  it("titles the page with the question, the verdict of the latest series and a run button", async () => {
    await renderRoute("/research/experiments/reply_noninferior_mistral")
    expect(await screen.findByRole("heading", { level: 1, name: "Variant mistral is not worse than variant gpt on critique by more than 0.05" })).toBeTruthy()
    expect(screen.queryByText(/^Guardrails:/)).toBeNull()
    expect(screen.getAllByText("reply_noninferior_mistral").length).toBeGreaterThan(0)
    expect(screen.getAllByText("confirmed")[0]).toBeTruthy()
    expect(screen.getAllByRole("button", { name: RUN }).map((button) => button.hasAttribute("disabled"))).toEqual([false, false])
  })
})

describe("ExperimentScreen: archived", () => {
  it("still opens an archived experiment and tags it in the header", async () => {
    await renderRoute("/research/experiments/panel_failure_scan")
    const heading = await screen.findByRole("heading", { level: 1 })
    expect(heading.parentElement?.textContent).toContain("Archived")
  })

  it("does not tag an experiment in use", async () => {
    await renderRoute("/research/experiments/reply_noninferior_mistral")
    const heading = await screen.findByRole("heading", { level: 1, name: /mistral is not worse/ })
    expect(heading.parentElement?.textContent).not.toContain("Archived")
  })
})

describe("ExperimentScreen: what we test", () => {
  it("draws the subject flow with the range in focus and marks the swapped agent", async () => {
    await renderRoute("/research/experiments/reply_noninferior_mistral")
    const graph = await section("Graph of support_case")
    expect(await within(graph).findByText("swap: gpt → mistral")).toBeTruthy()
    expect(nodeBox(graph, "triage")?.className).toContain("opacity-35")
    expect(nodeBox(graph, "revise")?.className).not.toContain("opacity-35")
    expect(within(graph).getByText("subject · flow support_case")).toBeTruthy()
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

  it("shows the fields and the prompt of a step of a flow of the experiment", async () => {
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

  it("stacks the subject graph first, then one graph per flow of the experiment with the variants that call it", async () => {
    await renderRoute("/research/experiments/intent_split_long_messages")
    const subject = await section("Graph of message_intent")
    const one = await section("Graph of one_step")
    const two = await section("Graph of two_step")
    expect(subject.compareDocumentPosition(one) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(one.compareDocumentPosition(two) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(within(subject).getByText("subject · flow message_intent of this experiment")).toBeTruthy()
    expect(within(subject).getByText("one_step", { selector: "span" })).toBeTruthy()
    expect(await within(subject).findByText("called flow: two_step")).toBeTruthy()
    expect(within(one).getByText("flow one_step of this experiment")).toBeTruthy()
    expect(within(one).queryByText("two_step", { selector: "span" })).toBeNull()
    expect(within(two).getByText("flow two_step of this experiment")).toBeTruthy()
    expect(within(two).getByText("two_step", { selector: "span" })).toBeTruthy()
    expect(await within(two).findByText("condense_message")).toBeTruthy()
  })

  it("marks the nodes a prompt factor changes with the prompts the variants give them", async () => {
    await renderRoute("/research/experiments/panel_judge_prompt")
    const graph = await section("Graph of judge_panel")
    expect(await within(graph).findAllByText("prompt: claims_first · anchored_scale")).toHaveLength(3)
  })

  it("states the hypothesis with its decision rule, then the factor and the value of each variant, then the fact tiles, above the canvas", async () => {
    await renderRoute("/research/experiments/reply_noninferior_mistral")
    const what = await section("What we test")
    const hypothesis = within(what).getByRole("region", { name: "Hypothesis" })
    expect(within(hypothesis).getByText(/^mistral in the revision step of the polish loop is not worse than gpt/)).toBeTruthy()
    expect(rulesOf(what)).toEqual(["critique: difference ≥ −0.05", "cost per passing run ≤ +20%"])
    const table = within(what).getByRole("table", { name: "Variants of this experiment" })
    expect(hypothesis.compareDocumentPosition(table) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    const caption = captionOf(what, "Varies: agent of revise")
    expect(caption.compareDocumentPosition(table) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(headersOf(table)).toEqual(["Variant", "Role", "Agent", "Agents · models"])
    expect(rowsOf(table)).toEqual([
      ["gpt", "baseline", "as written: gpt", "mistralmistral-nemogptgpt-oss-20b"],
      ["mistral", "candidate", "mistral", "mistralmistral-nemo"],
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

  it("names the flow each variant calls at the slot of a flow factor and the flows of the experiment", async () => {
    await renderRoute("/research/experiments/intent_split_long_messages")
    const what = await section("What we test")
    expect(captionOf(what, "Varies: flow called by classify")).toBeTruthy()
    const table = tableOf(what)
    expect(headersOf(table)).toEqual(["Variant", "Role", "Flow"])
    expect(rowsOf(table)).toEqual([
      ["one_step", "baseline", "as written: one_step"],
      ["two_step", "candidate", "two_step"],
    ])
    expect(within(what).queryByText("no agent")).toBeNull()
    expect(within(what).queryByRole("region", { name: "What changes" })).toBeNull()
    const where = tileOf(factsOf(what), "Where")
    expect(within(where).getByText("experiment flow")).toBeTruthy()
    expect(within(where).getByText("message_intent")).toBeTruthy()
    expect(within(where).getByText("flows of this experiment: one_step, two_step")).toBeTruthy()
  })

  it("names the prompt of each variant under a prompt factor", async () => {
    await renderRoute("/research/experiments/panel_judge_prompt")
    const what = await section("What we test")
    expect(captionOf(what, "Varies: prompt of deepseek, qwen, llama")).toBeTruthy()
    const table = tableOf(what)
    expect(headersOf(table)).toEqual(["Variant", "Role", "Prompt", "Agents · models"])
    expect(rowsOf(table).map((row) => row.slice(0, 3))).toEqual([
      ["as_written", "baseline", "as written: tie_break"],
      ["claims_first", "candidate", "claims_first"],
      ["anchored_scale", "other", "anchored_scale"],
    ])
  })

  it("names the alternative node of each variant under a use factor and lists the alternatives in the details", async () => {
    await renderRoute("/research/experiments/panel_merge_rule")
    const what = await section("What we test")
    expect(captionOf(what, "Varies: implementation of aggregate")).toBeTruthy()
    const table = tableOf(what)
    expect(headersOf(table)).toEqual(["Variant", "Role", "Alternative", "Agents · models"])
    expect(rowsOf(table).map((row) => row[2])).toEqual(["as written: aggregate", "majority_only", "always_tie_break"])
    const details = await section("Technical details")
    fireEvent.click(within(details).getByRole("button", { name: "Technical details" }))
    expect(within(details).getByText("Alternative nodes")).toBeTruthy()
    expect(within(details).getByText(/^always_tie_break · experiments\/panel_merge_rule\/nodes\/always_tie_break\/always_tie_break\.node\.yaml; majority_only · /)).toBeTruthy()
  })

  it("marks the one variant of a threshold as tested, with no factor and the threshold as the rule", async () => {
    await renderRoute("/research/experiments/critique_planted_defects")
    const what = await section("What we test")
    const table = within(what).getByRole("table", { name: "Variants of this experiment" })
    expect(headersOf(table)).toEqual(["Variant", "Role", "Agents · models"])
    expect(rowsOf(table)).toEqual([["deepseek", "tested", "deepseekdeepseek-v4-flash-0731"]])
    expect(rulesOf(what)).toEqual(["label ≥ 0.85 ± 0.05"])
    const facts = factsOf(what)
    expect(itemsOf(within(tileOf(facts, "Measured by")).getByRole("list", { name: "Checks" }))).toEqual(["labelbuilt-in"])
    const where = tileOf(facts, "Where")
    expect(within(what).queryByText(/^Varies:/)).toBeNull()
    expect(within(where).getByText("experiment flow")).toBeTruthy()
    expect(within(where).getByText("critique_only")).toBeTruthy()
    expect(within(where).getByText("every step")).toBeTruthy()
    expect(within(within(what).getByRole("region", { name: "Graph of critique_only" })).getByText("tested")).toBeTruthy()
  })

  it("lists the value per node when a variant sets only some nodes of the factor", async () => {
    await renderRoute("/research/experiments/reply_stage_budget")
    const what = await section("What we test")
    expect(captionOf(what, "Varies: agent of gpt, gemini, mistral")).toBeTruthy()
    const table = tableOf(what)
    expect(headersOf(table)).toEqual(["Variant", "Role", "Agent", "Agents · models"])
    expect(rowsOf(table)[1]).toEqual(["mistral_only", "tested", "gpt, gemini: mistralmistral as written: mistral", "mistralmistral-nemo"])
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

  it("shows the value a variant sets even when it repeats the subject as written", async () => {
    await renderRoute("/research/experiments/panel_aa_noise")
    const table = within(await section("What we test")).getByRole("table", { name: "Variants of this experiment" })
    expect(rowsOf(table).map((row) => row[2])).toEqual(["as written: gpt", "gpt"])
  })
})

describe("ExperimentScreen: what changes", () => {
  it("opens the prompt a variant gives under the table, with the prompt as written below it, from a click on the value", async () => {
    const scroll = vi.spyOn(Element.prototype, "scrollIntoView")
    const router = await renderRoute("/research/experiments/panel_judge_prompt")
    const what = await section("What we test")
    const changes = changesOf(what)
    expect(within(changes).getAllByRole("button", { expanded: false }).map((button) => button.textContent)).toEqual([
      "as_writtendeepseek, qwen, llama: prompt of tie_break as written",
      "claims_firstdeepseek, qwen, llama: prompt claims_first",
      "anchored_scaledeepseek, qwen, llama: prompt anchored_scale",
    ])
    expect(tableOf(what).compareDocumentPosition(changes) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    fireEvent.click(within(tableOf(what)).getByRole("button", { name: "claims_first" }))
    const block = await within(changes).findByRole("region", { name: "claims_first · deepseek, qwen, llama: prompt claims_first" })
    const variant = within(block).getByRole("region", { name: "Prompt claims_first" })
    const written = within(block).getByRole("region", { name: "As written · deepseek, qwen, llama" })
    expect(within(variant).getByText("experiments/panel_judge_prompt/prompts/claims_first.md")).toBeTruthy()
    expect(await within(variant).findByText(/^Before you score, read every candidate claim by claim/)).toBeTruthy()
    expect(within(written).getByText("flows/judge_panel/nodes/decide/tie_break.prompt.md")).toBeTruthy()
    expect(await within(written).findByText(/^Score against the three rubric criteria/)).toBeTruthy()
    expect(variant.compareDocumentPosition(written) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    await waitFor(() => {
      expect(scrolledTo(scroll, "change-claims_first-deepseek")).toBe(true)
    })
    expect(router.state.location.hash).toBe("change-claims_first-deepseek")
    fireEvent.click(within(changes).getByRole("button", { name: /^claims_first/, expanded: true }))
    expect(within(changes).queryByRole("region", { name: /^claims_first · / })).toBeNull()
    await waitFor(() => {
      expect(router.state.location.hash).toBe("")
    })
    scroll.mockRestore()
  })

  it("opens and closes a block from its line with the keyboard-reachable toggle, and keeps the address on open", async () => {
    const router = await renderRoute("/research/experiments/panel_judge_prompt")
    const changes = changesOf(await section("What we test"))
    const toggle = within(changes).getByRole("button", { name: /^anchored_scale/ })
    expect(toggle.getAttribute("aria-expanded")).toBe("false")
    fireEvent.click(toggle)
    expect(toggle.getAttribute("aria-expanded")).toBe("true")
    expect(document.getElementById(toggle.getAttribute("aria-controls") ?? "")?.getAttribute("aria-label")).toBe("anchored_scale · deepseek, qwen, llama: prompt anchored_scale")
    await waitFor(() => {
      expect(router.state.location.hash).toBe("change-anchored_scale-deepseek")
    })
  })

  it("shows the prompt as written of the variant that keeps the subject", async () => {
    await renderRoute("/research/experiments/panel_judge_prompt")
    const what = await section("What we test")
    fireEvent.click(within(tableOf(what)).getByRole("button", { name: "as written: tie_break" }))
    const block = await within(changesOf(what)).findByRole("region", { name: "as_written · deepseek, qwen, llama: prompt of tie_break as written" })
    expect(await within(block).findByText(/^Score against the three rubric criteria/)).toBeTruthy()
    expect(within(block).queryByRole("region", { name: /^Prompt / })).toBeNull()
  })

  it("shows the files of an alternative node and shows its slot on the graph", async () => {
    const scroll = vi.spyOn(Element.prototype, "scrollIntoView")
    const router = await renderRoute("/research/experiments/panel_merge_rule")
    const what = await section("What we test")
    fireEvent.click(within(tableOf(what)).getByRole("button", { name: "majority_only" }))
    const block = await within(changesOf(what)).findByRole("region", { name: "majority_only · aggregate: node majority_only" })
    expect(within(block).getByText(/^Merges the verdicts by majority alone/)).toBeTruthy()
    expect(within(block).getAllByRole("region").map((file) => file.getAttribute("aria-label"))).toEqual(["Node", "Code"])
    const code = within(block).getByRole("region", { name: "Code" })
    expect(within(code).getByText("experiments/panel_merge_rule/nodes/majority_only/majority_only.py")).toBeTruthy()
    expect(await within(code).findByText(/def majority_only\(verdicts/)).toBeTruthy()
    fireEvent.click(within(block).getByRole("button", { name: "Show aggregate on the graph" }))
    expect(await screen.findByRole("dialog", { name: "aggregate" })).toBeTruthy()
    await waitFor(() => {
      expect(scrolledTo(scroll, "graph-judge_panel")).toBe(true)
    })
    expect(router.state.location.hash).toBe("step-aggregate")
    scroll.mockRestore()
  })

  it("shows the node as written with its own code", async () => {
    await renderRoute("/research/experiments/panel_merge_rule")
    const what = await section("What we test")
    fireEvent.click(within(tableOf(what)).getByRole("button", { name: "as written: aggregate" }))
    const block = await within(changesOf(what)).findByRole("region", { name: "majority_and_spread · aggregate: node aggregate as written" })
    expect(await within(within(block).getByRole("region", { name: "Code" })).findByText(/def aggregate\(verdicts/)).toBeTruthy()
  })

  it("shows the model and the settings of the agent a variant gives", async () => {
    await renderRoute("/research/experiments/judge_panel_agents")
    const what = await section("What we test")
    fireEvent.click(within(tableOf(what)).getByRole("button", { name: "deepseek" }))
    const block = await within(changesOf(what)).findByRole("region", { name: "deepseek_tie_break · tie_break: agent deepseek" })
    expect(within(block).getByText("agents/deepseek.yaml")).toBeTruthy()
    expect(within(block).getByText("deepseek/deepseek-v4-flash-0731")).toBeTruthy()
    expect(within(block).getByText("Temperature")).toBeTruthy()
    fireEvent.click(within(tableOf(what)).getByRole("button", { name: "as written: gpt" }))
    const written = await within(changesOf(what)).findByRole("region", { name: "gpt_tie_break · tie_break: agent gpt as written" })
    expect(within(written).getByText("openai/gpt-oss-20b")).toBeTruthy()
  })

  it("scrolls to the graph of the flow a variant calls and highlights it", async () => {
    const scroll = vi.spyOn(Element.prototype, "scrollIntoView")
    const router = await renderRoute("/research/experiments/intent_split_long_messages")
    const what = await section("What we test")
    const two = await section("Graph of two_step")
    expect(two.getAttribute("data-highlighted")).toBe("false")
    fireEvent.click(within(tableOf(what)).getByRole("button", { name: "two_step" }))
    await waitFor(() => {
      expect(scrolledTo(scroll, "graph-two_step")).toBe(true)
    })
    expect(two.getAttribute("data-highlighted")).toBe("true")
    expect((await section("Graph of one_step")).getAttribute("data-highlighted")).toBe("false")
    expect(router.state.location.hash).toBe("graph-two_step")
    scroll.mockRestore()
  })

  it("links a project flow without a graph on the page to its canvas", async () => {
    await renderRoute("/research/experiments/panel_single_judge")
    const table = tableOf(await section("What we test"))
    expect(within(table).getByRole("link", { name: "Open the canvas of flow judge_panel" }).getAttribute("href")).toBe("/flows/judge_panel/canvas")
    expect(within(table).getByRole("button", { name: "single_judge" })).toBeTruthy()
  })

  it("selects a node of the factor on the graph from the caption", async () => {
    const scroll = vi.spyOn(Element.prototype, "scrollIntoView")
    const router = await renderRoute("/research/experiments/panel_judge_prompt")
    const what = await section("What we test")
    fireEvent.click(within(what).getByRole("button", { name: "Show qwen on the graph" }))
    expect(await screen.findByRole("dialog", { name: "judges__qwen" })).toBeTruthy()
    await waitFor(() => {
      expect(scrolledTo(scroll, "graph-judge_panel")).toBe(true)
    })
    expect(router.state.location.hash).toBe("step-qwen")
    scroll.mockRestore()
  })

  it("opens the block named in the address after a reload, whichever node of the block it names", async () => {
    const scroll = vi.spyOn(Element.prototype, "scrollIntoView")
    await renderRoute("/research/experiments/panel_judge_prompt#change-anchored_scale-qwen")
    const changes = changesOf(await section("What we test"))
    expect(await within(changes).findByRole("region", { name: "anchored_scale · deepseek, qwen, llama: prompt anchored_scale" })).toBeTruthy()
    expect(within(changes).queryByRole("region", { name: /^claims_first · / })).toBeNull()
    await waitFor(() => {
      expect(scrolledTo(scroll, "change-anchored_scale-deepseek")).toBe(true)
    })
    scroll.mockRestore()
  })

  it("selects the node named in the address after a reload and clears the address on close", async () => {
    const router = await renderRoute("/research/experiments/panel_merge_rule#step-aggregate")
    const sidebar = await screen.findByRole("dialog", { name: "aggregate" })
    fireEvent.click(within(sidebar).getByRole("button", { name: "Close step details" }))
    await waitFor(() => {
      expect(router.state.location.hash).toBe("")
    })
  })

  it("highlights the graph named in the address after a reload", async () => {
    await renderRoute("/research/experiments/intent_split_long_messages#graph-two_step")
    expect((await section("Graph of two_step")).getAttribute("data-highlighted")).toBe("true")
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
    expect(within(launch).getByRole("radio", { name: "Explore · working cases" }).getAttribute("aria-checked")).toBe("true")
    const summary = await launchSummary()
    expect(summary.textContent).toBe("36 attempts · 6 cases × 3 repeats × 2 variants · cap $1.00, pauses near it for your approval")
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
      expect((await launchSummary()).textContent).toBe("40 attempts · 5 cases × 4 repeats × 2 variants · cap $1.00, pauses near it for your approval")
    })
  })

  it("keeps the last plan dimmed while it re-plans and asks once after the steps settle", async () => {
    const experiment = liveExperiments.find((item) => item.experiment_id === "reply_noninferior_mistral")
    if (experiment === undefined) throw new Error("no experiment")
    await renderRoute("/research/experiments/reply_noninferior_mistral")
    const launch = await section("Launch")
    const asked = vi.fn()
    server.use(
      http.post(`${API_BASE}/experiments/:experimentId/launch-plan`, () => {
        asked()
        return HttpResponse.json(launchPlanFor(experiment, { on: "dev", cases: 6, repeats: 6 }))
      }),
    )
    const more = within(launch).getByRole("button", { name: "More repeats" })
    fireEvent.click(more)
    fireEvent.click(more)
    fireEvent.click(more)
    const summary = await launchSummary()
    expect(summary.textContent).toBe("72 attempts · 6 cases × 6 repeats × 2 variants · cap $1.00, pauses near it for your approval")
    expect(summary.querySelector("[aria-busy=true]")).toBeTruthy()
    await waitFor(() => {
      expect(summary.querySelector("[aria-busy=true]")).toBeNull()
    })
    expect(summary.textContent).toBe("72 attempts · 6 cases × 6 repeats × 2 variants · cap $1.00, pauses near it for your approval")
    expect(asked).toHaveBeenCalledTimes(1)
  })

  it("re-plans a smaller launch and keeps it runnable with a warning", async () => {
    await renderRoute("/research/experiments/reply_noninferior_mistral")
    fireEvent.change(casesInput(), { target: { value: "3" } })
    await waitFor(async () => {
      expect((await launchSummary()).textContent).toMatch(/^18 attempts · /)
    })
    expect(await within(await section("Launch")).findByText("52 recommended, only 6 here: expect a wide interval")).toBeTruthy()
    expect((await launchRun()).hasAttribute("disabled")).toBe(false)
    expect(screen.getAllByRole("button", { name: RUN }).map((button) => button.hasAttribute("disabled"))).toEqual([false, false])
  })

  it("says why the planned cases are enough when the plan meets the recommendation", async () => {
    const experiment = liveExperiments.find((item) => item.experiment_id === "reply_noninferior_mistral")
    if (experiment === undefined) throw new Error("no experiment")
    const enough = { cases: 6, repeats: 3, reason: "enough", text: "enough" }
    server.use(
      http.post(`${API_BASE}/experiments/:experimentId/launch-plan`, () =>
        HttpResponse.json({ ...launchPlanFor(experiment, { on: "dev" }), half_width: 0.04, recommended: enough, below_recommended: false }),
      ),
    )
    await renderRoute("/research/experiments/reply_noninferior_mistral")
    const launch = await section("Launch")
    expect(await within(launch).findByText(/^At 6 cases the expected interval is ±.+, inside the .+ margin\.$/)).toBeTruthy()
    expect(within(launch).queryByText(/recommended/)).toBeNull()
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
    fireEvent.click(within(await section("Launch")).getByRole("radio", { name: "Confirm · held-out cases" }))
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
    expect((await launchSummary()).textContent).toMatch(/ · cap \$1\.00, pauses near it for your approval$/)
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

describe("ExperimentScreen: a series paused near its cap", () => {
  const pausedSummary = (): ApiSeriesSummary => {
    const state = initialSeries().find((series) => series.id === RESEARCH_SERIES.escalationRunning)
    if (state === undefined) throw new Error("missing running series fixture")
    return {
      ...summaryOf(state),
      status: "awaiting_approval",
      spend: { usd: "0.91", cap_usd: "1.00", unpriced_attempts: 0 },
      pause: { reason: "spend_near_cap", spent_usd: "0.91" },
    }
  }

  it("continues it from the launch panel up to double the cap", async () => {
    const approved: unknown[] = []
    const paused = pausedSummary()
    server.use(
      http.get(`${API_BASE}/series`, () => HttpResponse.json({ items: [paused], next_cursor: null, total_estimate: 1 })),
      http.post(`${API_BASE}/series/:seriesId/approve`, async ({ request }) => {
        approved.push(await request.json())
        return HttpResponse.json({ ...paused, status: "running", pause: null })
      }),
    )
    await renderRoute("/research/experiments/intent_escalation_agents")
    const launch = await section("Launch")
    const pause = await within(launch).findByRole("group", { name: "Spend paused near the cap" })
    expect(pause.textContent).toContain("Spent $0.91 of $1.00 — the series paused. Continue up to $?")
    expect(within(launch).queryByRole("button", { name: "Approve spend" })).toBeNull()
    fireEvent.click(within(pause).getByRole("button", { name: "Continue" }))
    await waitFor(() => {
      expect(approved).toEqual([{ cap_usd: 2 }])
    })
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
