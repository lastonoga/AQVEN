import type { ReactNode } from "react"
import { screen, within } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { COMPLETED_RUN_ID } from "@/mocks/data/runs"
import { RECOVERED_RUN_ID } from "@/mocks/data/recovered-run"
import { renderRoute } from "@/test/render-route"

vi.mock("@/features/chat", () => ({
  ChatPanel: ({ header }: { readonly header: ReactNode }) => header,
  useChatThread: () => [],
  useChatScope: () => "flow",
}))

const RUNS = "/flows/support_case/runs"
const RECOVERED_ITEM = 2
const CHECK_FEEDBACK = "check intent_in_allowed_set rejected the output: $out.intent: value outside the allowed set: refund_maybe"

const traceRow = (table: HTMLElement, header: string): HTMLElement => {
  const row = within(table)
    .getAllByRole("row")
    .find((candidate) => within(candidate).queryByRole("rowheader", { name: new RegExp(`^${header}`) }) !== null)
  if (row === undefined) throw new Error(`no trace row for ${header}`)
  return row
}

const itemCell = (table: HTMLElement, header: string, item: number): HTMLElement => {
  const cell = within(traceRow(table, header)).getAllByRole("cell")[item]
  if (cell === undefined) throw new Error(`no ${header} cell for item ${String(item)}`)
  return cell
}

const nodesCard = async (note: string): Promise<HTMLElement> => {
  const card = (await screen.findByText(note)).parentElement
  if (card === null) throw new Error("missing the Nodes card")
  expect(within(card).getByText("Nodes")).toBeTruthy()
  return card
}

const voteStage = async (): Promise<HTMLElement> => {
  const heading = await screen.findByRole("heading", { name: "vote", level: 3 })
  const stage = heading.closest("section")
  if (stage === null) throw new Error("missing the vote stage")
  return stage
}

describe("a map item recovered by on_item_error", () => {
  it("counts the replaced item on the Nodes card in warning tone instead of a failed node", async () => {
    await renderRoute(`${RUNS}?run=${RECOVERED_RUN_ID}`)
    const card = await nodesCard("1 item replaced")
    expect(within(card).queryByText(/failed node/)).toBeNull()
    expect(within(card).getByText("1").getAttribute("data-tone")).toBe("warning")
  })

  it("keeps the red failed node of an old run without recovered items", async () => {
    await renderRoute(`${RUNS}?run=${COMPLETED_RUN_ID}`)
    const card = await nodesCard("1 failed node")
    expect(within(card).queryByText(/replaced|skipped|recovered/)).toBeNull()
    expect(within(card).getByText("1").getAttribute("data-tone")).toBe("destructive")
  })

  it("tags the map header next to its status and names the policy in the hint", async () => {
    await renderRoute(`${RUNS}?run=${RECOVERED_RUN_ID}`)
    const stage = await voteStage()
    const tag = within(stage).getByText("1 replaced")
    expect(tag.getAttribute("data-tone")).toBe("warning")
    expect(tag.getAttribute("title")).toBe("on_item_error abstain replaced a failed item; the run continued")
    expect(tag.parentElement?.textContent).toBe("OK1 replaced")
  })

  it("reads the recovered item as failed and replaced, and shows the default with one caption", async () => {
    await renderRoute(`${RUNS}?run=${RECOVERED_RUN_ID}`)
    const table = await screen.findByRole("table", { name: "vote" })
    const call = itemCell(table, "Call", RECOVERED_ITEM)
    expect(within(call).getByText("FAILED · replaced").getAttribute("data-tone")).toBe("warning")
    expect(call.getAttribute("data-tone")).toBe("warning")
    const output = itemCell(table, "Output", RECOVERED_ITEM)
    expect(within(output).getAllByText("Default from abstain — not a model answer")).toHaveLength(1)
    expect(output.textContent).toContain("abstain")
    expect(output.textContent).toContain("This perspective was not read")
    expect(within(itemCell(table, "Call", 0)).getByText("OK")).toBeTruthy()
  })

  it("folds identical post-check outcomes into one line with the feedback once", async () => {
    await renderRoute(`${RUNS}?run=${RECOVERED_RUN_ID}`)
    const table = await screen.findByRole("table", { name: "vote" })
    const check = itemCell(table, "Post check", RECOVERED_ITEM)
    expect(within(check).getAllByText("check_failed")).toHaveLength(1)
    expect(within(check).getByText("×4 · 4 attempts", { exact: false })).toBeTruthy()
    expect(within(check).getAllByText(CHECK_FEEDBACK)).toHaveLength(1)
    expect(within(check).getByText("4 failed attempts")).toBeTruthy()
  })

  it("shows one of the identical answers of a response with their count, and different answers as recorded", async () => {
    await renderRoute(`${RUNS}?run=${RECOVERED_RUN_ID}`)
    const attempts = await screen.findByRole("list", { name: /Failed attempts of ballot item 2/ })
    expect(within(attempts).getAllByRole("listitem")).toHaveLength(4)
    expect(within(attempts).getAllByText("×14 identical answers in one response")).toHaveLength(3)
    const first = within(attempts).getAllByRole("listitem")[0]
    if (first === undefined) throw new Error("missing the first attempt")
    const excerpt = within(first).getByText("Raw excerpt").parentElement?.querySelector("dd")?.textContent ?? ""
    expect(excerpt.split("\n")).toHaveLength(2)
  })
})
