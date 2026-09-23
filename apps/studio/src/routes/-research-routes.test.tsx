import { screen, waitFor } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { renderRoute } from "@/test/render-route"
import { RESEARCH_FIXTURE_SERIES } from "@/test/research-fixtures"

vi.mock("@/features/chat", () => ({
  ChatPanel: () => null,
}))

type Loaded = { readonly routeId: string; readonly loaderData?: unknown }

const loaded = (matches: readonly Loaded[], routeId: string): unknown => matches.find((match) => match.routeId === routeId)?.loaderData

describe("research routes", () => {
  it("loads the experiments filtered by the flow in the search", async () => {
    const router = await renderRoute("/research?flow=judge_panel")
    await waitFor(() => {
      expect(loaded(router.state.matches, "/_project/research/")).toMatchObject({
        experiments: [{ id: "judge_panel_agents" }, { id: "panel_single_judge" }],
        filter: { flow: "judge_panel" },
      })
    })
  })

  it("loads an experiment with its series and the estimate of its plan", async () => {
    const router = await renderRoute("/research/experiments/reply_noninferior_mistral")
    await waitFor(() => {
      expect(loaded(router.state.matches, "/_project/research/experiments/$experimentId")).toMatchObject({
        experiment: { id: "reply_noninferior_mistral", plan: { cases: 12, repeats: 3 } },
        series: [{ id: RESEARCH_FIXTURE_SERIES.replyNoninferiorHoldout }, { id: RESEARCH_FIXTURE_SERIES.replyNoninferiorDev }],
        launch: { on: "dev", cases: 12, repeats: 3 },
        estimate: { attempts: 72 },
      })
    })
  })

  it("loads a series with its case rows filtered by the search", async () => {
    const router = await renderRoute(`/research/series/${RESEARCH_FIXTURE_SERIES.replyNoninferiorHoldout}?failures=true`)
    await waitFor(() => {
      expect(loaded(router.state.matches, "/_project/research/series/$seriesId")).toMatchObject({
        series: { id: RESEARCH_FIXTURE_SERIES.replyNoninferiorHoldout, status: "done" },
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
