import type { ReactNode } from "react"
import { screen, within } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { EVAL_RUN_ID } from "@/mocks/data/evals"
import { renderRoute } from "@/test/render-route"

vi.mock("@/features/chat", () => ({
  ChatPanel: ({ header }: { readonly header: ReactNode }) => header,
  useChatThread: () => [],
  useChatScope: () => "flow",
}))

const EVALS_PATH = "/flows/support_case/evals"

const rowTexts = (table: HTMLElement): readonly (readonly string[])[] =>
  within(table)
    .getAllByRole("row")
    .slice(1)
    .map((row) => within(row).getAllByRole("cell").map((cell) => cell.textContent))

const table = async (name: string): Promise<HTMLElement> => await screen.findByRole("table", { name })

describe("EvalsScreen", () => {
  it("lists the evals the engine serves for this flow", async () => {
    await renderRoute(EVALS_PATH)
    const rows = rowTexts(await table("Evals"))
    expect(rows).toHaveLength(1)
    expect(rows[0]?.[0]).toContain("reply_quality")
    expect(rows[0]?.slice(1)).toEqual(["revise · gpt", "4 scorers", "reply_cases", "evals/support_case/reply_quality.yaml"])
  })

  it("shows the target, the scorer names and the declared policy of the selected eval", async () => {
    await renderRoute(EVALS_PATH)
    expect(await screen.findByRole("heading", { name: "reply_quality" })).toBeTruthy()
    expect(screen.getAllByText("critique").length).toBeGreaterThan(0)
    expect(screen.getAllByText("cost_usd").length).toBeGreaterThan(0)
    expect(screen.getAllByText("declared")).toHaveLength(2)
    expect(screen.getByText(/thresholds it is held to, stay in/)).toBeTruthy()
  })

  it("counts the dataset cases and its splits", async () => {
    await renderRoute(EVALS_PATH)
    expect(await screen.findByRole("heading", { name: "Dataset" })).toBeTruthy()
    expect(screen.getByText("train 1 · dev 1 · test 1")).toBeTruthy()
    expect(screen.getByText("evals/support_case/reply_cases.yaml")).toBeTruthy()
  })

  it("lists the eval runs of the selected eval", async () => {
    await renderRoute(EVALS_PATH)
    const rows = rowTexts(await table("Eval runs"))
    expect(rows).toHaveLength(1)
    expect(rows[0]?.[0]).toContain("#f16784")
    expect(rows[0]?.[1]).toBe("FAILED")
    expect(rows[0]?.[2]).toBe("0 / 9")
  })

  it("shows the scorers of the run and says why it has no gate verdict", async () => {
    await renderRoute(EVALS_PATH)
    expect(await screen.findByRole("heading", { name: "Eval run #f16784" })).toBeTruthy()
    const scorers = rowTexts(await table("Scorers"))
    expect(scorers.map((row) => row[0])).toEqual(["critique", "citations", "promises", "cost_usd"])
    expect(scorers[0]?.slice(1)).toEqual(["continuous", "0", "—", "—", "—"])
    expect(screen.getByText(/ran without a baseline/)).toBeTruthy()
    expect(screen.getByText("37 notes")).toBeTruthy()
  })

  it("lists every case of the run and opens the first one", async () => {
    await renderRoute(EVALS_PATH)
    const cases = rowTexts(await table("Cases"))
    expect(cases).toHaveLength(9)
    expect(cases[0]?.[0]).toBe("bulb_app_offline_advice #0")
    expect(cases[0]?.[1]).toBe("FAILED")
    expect(screen.getByRole("heading", { name: "Case bulb_app_offline_advice #0" })).toBeTruthy()
    expect(screen.getAllByText(/no API key for provider openrouter/).length).toBeGreaterThan(0)
  })

  it("opens the repeat named in the url", async () => {
    await renderRoute(`${EVALS_PATH}?eval=reply_quality&run=${EVAL_RUN_ID}&case=strip_flicker_credit&rep=2`)
    expect(await screen.findByRole("heading", { name: "Case strip_flicker_credit #2" })).toBeTruthy()
  })

  it("says where evals live when the flow has none", async () => {
    await renderRoute("/flows/judge_panel/evals")
    expect(await screen.findByText("No evals for this flow. Evals live in evals/judge_panel/.")).toBeTruthy()
    expect(screen.queryByRole("table", { name: "Cases" })).toBeNull()
  })
})
