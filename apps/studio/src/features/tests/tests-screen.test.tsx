import { fireEvent, screen, within } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { renderRoute } from "@/test/render-route"

const TESTS_PATH = "/en/hotel_pitch/pitch_pipeline/tests"

const bodyRowsOf = (table: HTMLElement): readonly HTMLElement[] => within(table).getAllByRole("row").slice(1)

const cellTexts = (row: HTMLElement): readonly string[] => within(row).getAllByRole("cell").map((cell) => cell.textContent)

describe("TestsScreen", () => {
  it("lists five tests whose rows link to the test detail", async () => {
    await renderRoute(TESTS_PATH)
    const rows = bodyRowsOf(await screen.findByRole("table", { name: "Tests" }))
    expect(rows).toHaveLength(5)
    expect(cellTexts(rows[0] ?? document.body)).toEqual([
      "FAILEDpitch_gen_bcall · stage 4 · divergence",
      "pitch_golden_v4 · 48 rows",
      "44 / 48",
      "2 hours ago",
      "Open",
    ])
    const rowLink = screen.getByRole("link", { name: "diverge_stage_4" })
    expect(rowLink.getAttribute("href")).toBe(`${TESTS_PATH}/diverge_stage_4`)
    expect(rowLink.tabIndex).toBe(-1)
  })

  it("lists five datasets without row links", async () => {
    await renderRoute(TESTS_PATH)
    const table = await screen.findByRole("table", { name: "Datasets" })
    const rows = bodyRowsOf(table)
    expect(rows.map((row) => cellTexts(row).slice(0, 5))).toEqual([
      ["pitch_golden_v448 rows · 5 columns + expected", "spreadsheet + agent-extended", "3 assertions", "tests: 2", "2 hours ago"],
      ["regress_truncated12 rows · agent-built from failures", "agent · from runs #8210…#8247", "2 assertions", "tests: 1", "yesterday"],
      ["hotels_500500 rows · DB export", "tool hotels.search · snapshot", "1 assertion", "tests: 1", "3 days ago"],
      ["loop_regress20 rows · candidates for the critic loop", "spreadsheet", "4 assertions", "tests: 1", "yesterday"],
      ["smoke_1212 rows · end-to-end run", "manual", "3 assertions", "tests: 1", "last week"],
    ])
    expect(within(table).queryAllByRole("link")).toHaveLength(0)
  })

  it("runs a test without navigating", async () => {
    const router = await renderRoute(TESTS_PATH)
    fireEvent.click(await screen.findByRole("button", { name: "Run test pitch_gen_b" }))
    expect(router.state.location.pathname).toBe(TESTS_PATH)
  })

  it("shows empty states for a workflow without tests", async () => {
    await renderRoute("/en/hotel_pitch/support_triage/tests")
    expect(await screen.findByText("No tests yet")).toBeDefined()
    expect(screen.getByText("No datasets yet")).toBeDefined()
    expect(screen.queryByRole("table")).toBeNull()
  })
})
