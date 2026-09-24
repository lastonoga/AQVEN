import { screen, waitFor } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { COMPLETED_RUN_ID } from "@/mocks/data/runs"
import { RESEARCH_SERIES } from "@/mocks/data/research"
import { renderRoute } from "@/test/render-route"

vi.mock("@/features/chat", () => ({
  ChatPanel: () => null,
}))

type Loaded = { readonly routeId: string; readonly loaderData?: unknown }

const loaded = (matches: readonly Loaded[], routeId: string): unknown => matches.find((match) => match.routeId === routeId)?.loaderData

const ARM_RUN = `${RESEARCH_SERIES.critiqueDev.slice(0, 24)}0001${RESEARCH_SERIES.critiqueDev.slice(-8)}`

describe("research routes", () => {
  it("loads the experiments of every flow filtered by the question in the search and drops a flow", async () => {
    const router = await renderRoute("/research?flow=judge_panel&question=compare")
    await waitFor(() => {
      expect(loaded(router.state.matches, "/_project/research/")).toMatchObject({
        experiments: [
          { id: "intent_ballot_pair" },
          { id: "intent_split_long_messages" },
          { id: "judge_panel_agents" },
          { id: "panel_aa_noise" },
          { id: "panel_single_judge" },
        ],
      })
    })
    expect(loaded(router.state.matches, "/_project/research/")).toHaveProperty("filter", { question: "compare" })
  })

  it("loads every series of the project whatever flow the address names", async () => {
    const router = await renderRoute("/research/series?flow=judge_panel")
    await waitFor(() => {
      expect(loaded(router.state.matches, "/_project/research/series/")).toHaveProperty("series.length", Object.keys(RESEARCH_SERIES).length)
    })
  })

  it("loads an experiment with its series and the launch plan on the working cases", async () => {
    const router = await renderRoute("/research/experiments/reply_noninferior_mistral")
    await waitFor(() => {
      expect(loaded(router.state.matches, "/_project/research/experiments/$experimentId")).toMatchObject({
        experiment: { id: "reply_noninferior_mistral", plan: { cases: 12, repeats: 3 }, cases: { splits: { dev: 6, holdout: 6 } } },
        series: [{ id: RESEARCH_SERIES.noninferiorHoldout }, { id: RESEARCH_SERIES.noninferiorDev }],
        launch: { on: "dev", cases: 6, repeats: 3 },
        plan: { attempts: 36, capUsd: 1, recommended: { cases: 52, reason: "short_of_cases" } },
      })
    })
  })

  it("loads a series with its case rows filtered by the search", async () => {
    const router = await renderRoute(`/research/series/${RESEARCH_SERIES.noninferiorHoldout}?failures=true`)
    await waitFor(() => {
      expect(loaded(router.state.matches, "/_project/research/series/$seriesId")).toMatchObject({
        series: { id: RESEARCH_SERIES.noninferiorHoldout, status: "done", origin: { kind: "experiment", experiment: "reply_noninferior_mistral" } },
        experiment: { id: "reply_noninferior_mistral" },
        filter: { failures: true },
      })
    })
  })

  it("renders not found for an unknown experiment", async () => {
    await renderRoute("/research/experiments/no_such_experiment")
    expect(await screen.findByText("Page not found")).toBeTruthy()
  })
})

describe("run route", () => {
  it("shows a run whose flow is not a project flow on its own page", async () => {
    const router = await renderRoute(`/runs/${ARM_RUN}`)
    await waitFor(() => {
      expect(loaded(router.state.matches, "/_project/runs/$runId")).toMatchObject({
        snapshot: { run_id: ARM_RUN, flow_id: "critique_only", mode: "experiment", series_id: RESEARCH_SERIES.critiqueDev },
      })
    })
    expect(await screen.findByRole("heading", { level: 1, name: /^Run #/ })).toBeTruthy()
    expect(router.state.location.pathname).toBe(`/runs/${ARM_RUN}`)
  })

  it("sends a run of a project flow to the runs of that flow", async () => {
    const router = await renderRoute(`/runs/${COMPLETED_RUN_ID}`)
    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/flows/support_case/runs")
    })
    expect(router.state.location.search).toEqual({ run: COMPLETED_RUN_ID })
  })

  it("renders not found for an unknown run", async () => {
    await renderRoute("/runs/no-such-run")
    expect(await screen.findByText("Page not found")).toBeTruthy()
  })
})
