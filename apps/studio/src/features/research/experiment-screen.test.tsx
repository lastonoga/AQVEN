import { fireEvent, screen, waitFor, within } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import type { ExperimentDetail } from "@/domain"
import * as ids from "@/data/ids"
import { router as appRouter } from "@/router"
import { renderInStudio, renderRoute } from "@/test/render-route"
import { RESEARCH_FIXTURE_SERIES, resetResearchFixtures } from "@/test/research-fixtures"
import { ExperimentMeasure } from "./experiment-measure"

vi.mock("@/features/chat", () => ({
  ChatPanel: () => null,
}))

afterEach(() => {
  resetResearchFixtures()
})

const section = (name: string): Promise<HTMLElement> => screen.findByRole("region", { name })

const casesInput = (): HTMLElement => screen.getByRole("spinbutton", { name: "Cases (N)" })

const estimateText = async (): Promise<string> => (await screen.findByRole("region", { name: "Estimate of this launch" })).textContent

const withoutValidation = (experiment: ExperimentDetail): ExperimentDetail => ({
  ...experiment,
  checks: experiment.checks.map((check) =>
    check.source.kind === "judge" ? { ...check, source: { ...check.source, validatedBy: null } } : check,
  ),
})

describe("ExperimentScreen header", () => {
  it("states the question in plain words with its guardrails, files and notes", async () => {
    await renderRoute("/research/experiments/reply_noninferior_mistral")
    expect(await screen.findByRole("heading", { level: 1, name: "reply_noninferior_mistral" })).toBeTruthy()
    expect(screen.getByText("mistral is not worse than gpt on critique by more than 0.05")).toBeTruthy()
    expect(screen.getByText("Guardrails: cost per pass at most 20% worse")).toBeTruthy()
    expect(screen.getByText("failure mode reply_quality")).toBeTruthy()
    expect(screen.getByText(/Defined in experiments\/reply_noninferior_mistral\/experiment\.yaml/)).toBeTruthy()
    expect(screen.queryByRole("region", { name: "Notes of this experiment" })).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "Show notes" }))
    expect((await section("Notes of this experiment")).textContent).toContain("mistral in the revision step")
  })
})

describe("ExperimentScreen: what we run", () => {
  it("shows the subject, the selected cases and each variant as node to agent and model", async () => {
    await renderRoute("/research/experiments/reply_noninferior_mistral")
    const run = await section("What we run")
    expect(within(run).getByText("support_case, nodes polish")).toBeTruthy()
    expect(within(run).getByText("support_case_cases · 12 of 12 cases")).toBeTruthy()
    expect(within(run).getByRole("link", { name: /Open the cases/ }).getAttribute("href")).toContain("/flows/support_case/cases")
    const variants = within(within(run).getByRole("table", { name: "Variants of this experiment" })).getAllByRole("row")
    expect(variants.slice(1).map((row) => row.textContent)).toEqual([
      "gptbaseline—polish__revisegptopenrouter:openai/gpt-oss-20b",
      "mistralcandidate—polish__revisemistraloverriddenopenrouter:mistralai/mistral-nemo",
    ])
  })

  it("draws the steps of each arm and filters the cases by tags", async () => {
    await renderRoute("/research/experiments/intent_split_long_messages")
    const steps = await screen.findByRole("table", { name: "Steps of arm two_step" })
    expect(within(steps).getAllByRole("row").slice(1).map((row) => row.textContent)).toEqual([
      "1condense_messageLLMllamaopenrouter:meta-llama/llama-3.1-8b-instructCondenses the message to what the customer needs now, at most 600 characters",
      "2classify_summaryLLMllamaopenrouter:meta-llama/llama-3.1-8b-instructDecides the intent from the summary",
    ])
    expect(screen.getByRole("table", { name: "Steps of arm one_step" })).toBeTruthy()
    expect(within(await section("What we run")).getByText("arm one_step")).toBeTruthy()
  })

  it("names the tag filter of a look experiment", async () => {
    await renderRoute("/research/experiments/reply_look")
    const run = await section("What we run")
    expect(within(run).getByText("support_case_cases · 5 of 12 cases")).toBeTruthy()
    expect(within(run).getByText("regression=yes")).toBeTruthy()
    expect(within(await section("How we measure")).getByText("A look has no primary metric and no guardrails.")).toBeTruthy()
  })
})

describe("ExperimentScreen: how we measure", () => {
  it("lists the checks with their source and the judge's validation", async () => {
    await renderRoute("/research/experiments/reply_noninferior_mistral")
    const checks = await screen.findByRole("table", { name: "Checks of this experiment" })
    const [, critique, promises] = within(checks).getAllByRole("row")
    expect(critique?.textContent).toContain("judge")
    expect(critique?.textContent).toContain("critique · deepseek (openrouter:deepseek/deepseek-v4-flash-0731)")
    expect(within(critique ?? document.body).getByRole("link", { name: "validated by critique_planted_defects" }).getAttribute("href")).toBe(
      "/research/experiments/critique_planted_defects",
    )
    expect(promises?.textContent).toContain("@root.code.support_case:promises_match_resolution")
    const metrics = within(screen.getByRole("table", { name: "Metrics of the question" })).getAllByRole("row")
    expect(metrics.slice(1).map((row) => row.textContent)).toEqual(["critiqueprimary↑ higher is better0.05", "cost per passguardrail↓ lower is better20%"])
  })

  it("shows the threshold of a threshold question as its margin", async () => {
    await renderRoute("/research/experiments/critique_planted_defects")
    const metrics = within(await screen.findByRole("table", { name: "Metrics of the question" })).getAllByRole("row")
    expect(metrics[1]?.textContent).toContain("above 0.85 ± 0.05")
  })

  it("marks a judge without validation", async () => {
    const experiment = await appRouter.options.context.api.research.experiment(ids.experimentId("reply_noninferior_mistral"))
    await renderInStudio(<ExperimentMeasure experiment={withoutValidation(experiment)} />)
    expect(await screen.findByText("unvalidated judge")).toBeTruthy()
  })
})

describe("ExperimentScreen: launch", () => {
  it("starts from the plan with the recommended size, its reason and the estimate", async () => {
    await renderRoute("/research/experiments/reply_noninferior_mistral")
    await section("Launch")
    expect(casesInput()).toHaveProperty("value", "12")
    expect(screen.getByText("Recommended N ≈ 65")).toBeTruthy()
    expect(screen.getByText(/At 12 cases the expected interval is ±0\.12, wider than the 0\.05 margin/)).toBeTruthy()
    expect(await estimateText()).toContain("Attempts72")
    expect(await estimateText()).toContain("Spend$0.91")
    expect(screen.getByRole("note").textContent).toContain("only 12 are selected")
    expect(screen.getByRole("button", { name: "Start" }).hasAttribute("disabled")).toBe(false)
  })

  it("re-estimates a smaller launch and keeps it startable with a warning", async () => {
    await renderRoute("/research/experiments/reply_noninferior_mistral")
    await section("Launch")
    fireEvent.change(casesInput(), { target: { value: "6" } })
    await waitFor(async () => {
      expect(await estimateText()).toContain("Attempts36")
    })
    expect(screen.getByText(/At 6 cases the expected interval/)).toBeTruthy()
    expect(screen.getAllByRole("note")[0]?.textContent).toContain("Fewer cases than recommended (65)")
    expect(screen.getByRole("button", { name: "Start" }).hasAttribute("disabled")).toBe(false)
  })

  it("refuses a size outside the selection", async () => {
    await renderRoute("/research/experiments/reply_noninferior_mistral")
    await section("Launch")
    fireEvent.change(casesInput(), { target: { value: "0" } })
    expect(await screen.findByText("N must be a whole number from 1 to 12")).toBeTruthy()
    expect(screen.getByRole("button", { name: "Start" }).hasAttribute("disabled")).toBe(true)
    fireEvent.change(screen.getByRole("spinbutton", { name: "Repeats (R)" }), { target: { value: "21" } })
    expect(await screen.findByText("R must be a whole number from 1 to 20")).toBeTruthy()
  })

  it("starts a series on the chosen cases and opens it", async () => {
    const router = await renderRoute("/research/experiments/reply_noninferior_mistral")
    await section("Launch")
    fireEvent.change(casesInput(), { target: { value: "4" } })
    fireEvent.click(screen.getByRole("radio", { name: "held-out cases" }))
    await waitFor(async () => {
      expect(await estimateText()).toContain("Attempts24")
    })
    fireEvent.click(screen.getByRole("button", { name: "Start" }))
    await waitFor(() => {
      expect(router.state.location.pathname).toMatch(/^\/research\/series\//)
    })
    expect(await screen.findByText("RUNNING")).toBeTruthy()
    expect(screen.getByText("holdout")).toBeTruthy()
    expect(screen.getByText("0 of 24 attempts")).toBeTruthy()
  })

  it("approves the spend of a waiting series, then stops it", async () => {
    await renderRoute("/research/experiments/reply_overpromise_risk")
    const launch = await section("Launch")
    expect(within(launch).getByText("This estimate is above the spend limit: the series will wait for your approval before it runs.")).toBeTruthy()
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

describe("ExperimentScreen: series history", () => {
  it("lists the series newest first and opens one", async () => {
    const router = await renderRoute("/research/experiments/reply_noninferior_mistral")
    const history = await screen.findByRole("table", { name: "Series of this experiment" })
    const rows = within(history).getAllByRole("row").slice(1)
    expect(rows.map((row) => row.textContent)).toEqual([
      expect.stringContaining("holdout12×372 of 72 attempts$0.89DONEconfirmed"),
      expect.stringContaining("dev12×372 of 72 attempts$0.90DONEsignal"),
    ])
    fireEvent.click(within(history).getAllByRole("link")[0] ?? document.body)
    await waitFor(() => {
      expect(router.state.location.pathname).toBe(`/research/series/${RESEARCH_FIXTURE_SERIES.replyNoninferiorHoldout}`)
    })
  })

  it("says when an experiment has no series yet", async () => {
    await renderRoute("/research/experiments/reply_look")
    expect(await screen.findByText("No series yet")).toBeTruthy()
  })
})
