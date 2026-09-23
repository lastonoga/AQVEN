import { fireEvent, screen, waitFor, within } from "@testing-library/react"
import { http, HttpResponse } from "msw"
import { describe, expect, it, vi } from "vitest"
import { API_BASE } from "@/api/client"
import { liveChatSessions } from "@/mocks/data/chat"
import { liveFlowDetails } from "@/mocks/data/project"
import { server } from "@/mocks/node"
import { renderRoute } from "@/test/render-route"

vi.mock("@/features/chat", () => ({
  ChatPanel: () => null,
}))

const description = (flowId: string): string => liveFlowDetails[flowId]?.description ?? ""

const flowList = (): Promise<HTMLElement> => screen.findByRole("navigation", { name: "Flows of the project" })

describe("FlowsScreen", () => {
  it("lists the flows of the project with the most recently run first", async () => {
    await renderRoute("/flows")
    const rows = within(await flowList()).getAllByRole("link")
    expect(rows.map((row) => row.getAttribute("href"))).toEqual(["/flows/support_case/canvas", "/flows/judge_panel/canvas"])
    expect(within(rows[0] ?? document.body).getByText(description("support_case"))).toBeTruthy()
    expect(rows[0]?.textContent).toMatch(/30 nodes · last run .+ · 5 experiments/)
    expect(rows[1]?.textContent).toContain("8 nodes · never run · 4 experiments")
  })

  it("opens the graph of a flow from its row", async () => {
    const router = await renderRoute("/flows")
    const [first] = within(await flowList()).getAllByRole("link")
    fireEvent.click(first ?? document.body)
    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/flows/support_case/canvas")
    })
    await waitFor(() => {
      expect(router.state.status).toBe("idle")
    })
  })

  it("shows an empty project with the hand-off to the chat", async () => {
    server.use(http.get(`${API_BASE}/flows`, () => HttpResponse.json({ items: [], next_cursor: null, total_estimate: 0 })))
    await renderRoute("/flows")
    expect(await screen.findByText("No flows yet")).toBeTruthy()
    expect(screen.getByRole("button", { name: "Ask the agent to write a flow" })).toBeTruthy()
  })

  it("hands the flow writing to the open chat thread", async () => {
    const sent: { readonly session: unknown; readonly text: unknown }[] = []
    server.use(
      http.post(`${API_BASE}/chat/sessions/:sessionId/messages`, async ({ params, request }) => {
        const body: unknown = await request.json()
        sent.push({ session: params["sessionId"], text: typeof body === "object" && body !== null && "text" in body ? body.text : null })
        return HttpResponse.json({ turn_id: "turn-1", accepted_at: "2026-09-18T03:00:00Z" }, { status: 202 })
      }),
    )
    await renderRoute("/flows")
    const button = await screen.findByRole("button", { name: "Ask the agent to write a flow" })
    await waitFor(() => {
      expect(button.hasAttribute("disabled")).toBe(false)
    })
    fireEvent.click(button)
    expect((await screen.findByRole("status")).textContent).toBe("Sent to the chat on the left.")
    expect(sent).toHaveLength(1)
    expect(sent[0]?.session).toBe(liveChatSessions[0]?.session_id)
    expect(String(sent[0]?.text)).toContain("Help me write a new flow")
  })
})
