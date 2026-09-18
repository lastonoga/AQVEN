import type { ReactNode } from "react"
import { fireEvent, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { renderRoute } from "@/test/render-route"

vi.mock("@/features/chat", () => ({
  ChatPanel: ({ header }: { readonly header: ReactNode }) => header,
  useChatThread: () => [],
  useChatScope: () => "flow",
}))

describe("NodesScreen", () => {
  it("lists the nodes of the flow and waits for a selection", async () => {
    await renderRoute("/flows/support_case/nodes")
    expect(await screen.findByRole("navigation", { name: "Nodes in this flow" })).toBeTruthy()
    expect(screen.getByText("No node selected")).toBeTruthy()
    expect(screen.queryByText("Prompt files")).toBeNull()
  })

  it("opens the definition of the selected node", async () => {
    await renderRoute("/flows/support_case/nodes?node=triage")
    expect(await screen.findByRole("heading", { name: /triage/ })).toBeTruthy()
    expect(screen.queryByText(/triage\.node\.yaml/)).toBeNull()
    expect(screen.getByText("Agent")).toBeTruthy()
    expect(screen.getByRole("table", { name: "Inputs" })).toBeTruthy()
    expect(screen.getByText("$prepare.out.message")).toBeTruthy()
  })

  it("reads the prompt of an llm node on its own tab", async () => {
    await renderRoute("/flows/support_case/nodes?node=triage&tab=prompt")
    expect(await screen.findByRole("table", { name: "Slots" })).toBeTruthy()
    expect(screen.getByText("Template")).toBeTruthy()
    expect(screen.getAllByText("Document?").length).toBeGreaterThan(0)
  })

  it("offers no prompt tab for a code node", async () => {
    await renderRoute("/flows/support_case/nodes?node=prepare")
    expect(await screen.findByRole("navigation", { name: "Node views" })).toBeTruthy()
    expect(screen.queryByRole("link", { name: "Prompt" })).toBeNull()
    expect(screen.getByText("Function")).toBeTruthy()
  })

  it("falls back to the definition when the asked tab is unavailable", async () => {
    await renderRoute("/flows/support_case/nodes?node=prepare&tab=prompt")
    expect(await screen.findByRole("navigation", { name: "Node views" })).toBeTruthy()
    expect(screen.getAllByText("Definition").length).toBeGreaterThan(0)
    expect(screen.queryByText("Template")).toBeNull()
  })

  it("shows the schemas of a node as fields", async () => {
    await renderRoute("/flows/support_case/nodes?node=triage&tab=schemas")
    expect(await screen.findByRole("table", { name: "Input schema" })).toBeTruthy()
    expect(screen.getAllByText("required").length).toBeGreaterThan(0)
    fireEvent.click(screen.getByRole("radio", { name: "JSON" }))
    expect(screen.queryByRole("table", { name: "Input schema" })).toBeNull()
    expect(screen.getAllByText(/"properties"/).length).toBeGreaterThan(0)
  })
})
