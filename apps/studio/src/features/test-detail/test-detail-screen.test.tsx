import { act, fireEvent, screen, within } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { renderRoute } from "@/test/render-route"

const TEST_PATH = "/en/hotel_pitch/pitch_pipeline/tests/pitch_gen_b"

const bodyRowIds = (table: HTMLElement): readonly string[] =>
  within(table)
    .getAllByRole("row")
    .slice(1)
    .map((row) => within(row).getAllByRole("cell")[0]?.textContent ?? "")

const click = async (element: HTMLElement): Promise<void> => {
  await act(async () => {
    fireEvent.click(element)
    await new Promise((resolve) => setTimeout(resolve, 200))
  })
}

beforeEach(() => {
  vi.spyOn(window, "scrollTo").mockImplementation(() => undefined)
})

describe("TestDetailScreen", () => {
  it("renders both stages and the row navigator for row 07", async () => {
    await renderRoute(`${TEST_PATH}?row=07`)
    expect(await screen.findByRole("heading", { name: "Pitch divergence" })).toBeTruthy()
    expect(screen.getByRole("heading", { name: "Critic loop" })).toBeTruthy()
    expect(screen.getByText("Dataset row")).toBeTruthy()
    expect(screen.getByText("#07")).toBeTruthy()
    expect(screen.getByText("7 / 48")).toBeTruthy()
    expect(screen.getByText("Row #07 · FAIL")).toBeTruthy()
    expect(screen.getByText("r42 draft · 44/48 · $0.61")).toBeTruthy()
  })

  it("renders the summary, dataset and per-row tables", async () => {
    await renderRoute(`${TEST_PATH}?row=07`)
    expect(await screen.findByRole("heading", { name: "Test of a workflow slice" })).toBeTruthy()
    expect(screen.getByText("48 rows · 3 assertions · source: spreadsheet, agent-extended")).toBeTruthy()
    const dataset = screen.getByRole("table", { name: "Dataset rows" })
    expect(bodyRowIds(dataset)).toEqual(["07", "12", "19", "24", "33", "41", "46"])
    expect(within(dataset).getByText("“A holiday next to the park”")).toBeTruthy()
    expect(within(dataset).getAllByRole("row")[1]?.getAttribute("aria-current")).toBe("true")
    expect(bodyRowIds(screen.getByRole("table", { name: "Per-row result" }))).toEqual(["07", "12", "19", "24", "33", "41", "46"])
  })

  it("moves to the next row and keeps a trace for it", async () => {
    const router = await renderRoute(`${TEST_PATH}?row=07`)
    await click(await screen.findByRole("link", { name: "Next row" }))
    expect(await screen.findByText("#12")).toBeTruthy()
    expect(router.state.location.search).toMatchObject({ row: "12" })
    expect(screen.getByText("Row #12 · PASS")).toBeTruthy()
    expect(screen.getByRole("heading", { name: "Critic loop" })).toBeTruthy()
  })

  it("closes the call sheet when the row changes", async () => {
    const router = await renderRoute(`${TEST_PATH}?row=07&call=call_01HT9&callTab=prompt`)
    await click(await screen.findByRole("link", { name: "Next row" }))
    expect(await screen.findByText("Row #12 · PASS")).toBeTruthy()
    expect(router.state.location.search).toEqual({ row: "12" })
  })

  it("jumps to the next failure", async () => {
    const router = await renderRoute(`${TEST_PATH}?row=07`)
    await click(await screen.findByRole("link", { name: "Next failure" }))
    expect(await screen.findByText("Row #19 · FAIL")).toBeTruthy()
    expect(router.state.location.search).toMatchObject({ row: "19" })
  })

  it("filters both tables with the failures toggle", async () => {
    const router = await renderRoute(`${TEST_PATH}?row=07`)
    const toggles = await screen.findAllByRole("radio", { name: "failures only · 4" })
    expect(toggles).toHaveLength(2)
    await click(toggles[0] ?? document.body)
    expect(router.state.location.search).toMatchObject({ failures: true })
    expect(bodyRowIds(screen.getByRole("table", { name: "Dataset rows" }))).toEqual(["07", "19", "33", "41"])
    expect(bodyRowIds(screen.getByRole("table", { name: "Per-row result" }))).toEqual(["07", "19", "33", "41"])
  })

  it("opens the call sheet from a matrix cell", async () => {
    const router = await renderRoute(`${TEST_PATH}?row=07`)
    const cell = (await screen.findByText("verdicts of 3 judges")).closest("button")
    await click(cell ?? document.body)
    expect(router.state.location.search).toMatchObject({ call: "call_01HT9", callTab: "assertions" })
  })

  it("shows an empty trace and no navigator for an unknown row", async () => {
    await renderRoute(`${TEST_PATH}?row=99`)
    expect(await screen.findByText("No trace for this row")).toBeTruthy()
    expect(screen.queryByText("Dataset row")).toBeNull()
  })

  it("shows the not found state for an unknown test", async () => {
    await renderRoute("/en/hotel_pitch/pitch_pipeline/tests/unknown_test")
    expect(await screen.findByText("No data for this test")).toBeTruthy()
  })
})
