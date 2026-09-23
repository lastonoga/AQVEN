import { fireEvent, screen, waitFor } from "@testing-library/react"
import { http, HttpResponse } from "msw"
import { describe, expect, it } from "vitest"
import type { ApiChatSession } from "@/domain"
import { API_BASE } from "@/api/client"
import { liveChatSessions } from "@/mocks/data/chat"
import { server } from "@/mocks/node"
import { renderRoute } from "@/test/render-route"

describe("CreateDataset", () => {
  it("creates a flow dataset without split fields", async () => {
    let submitted: unknown = null
    server.use(http.post(`${API_BASE}/datasets`, async ({ request }) => {
      submitted = await request.json()
      return HttpResponse.json({
        dataset_id: "fresh_cases",
        flow_id: "support_case",
        path: "datasets/fresh_cases.yaml",
        file_hash: "sha256-test",
        cases: 1,
        splits: {},
      }, { status: 201 })
    }))

    await renderRoute("/flows/support_case/datasets?create=true")
    expect(screen.queryByLabelText("Split")).toBeNull()
    fireEvent.change(await screen.findByLabelText("Dataset ID"), { target: { value: "fresh_cases" } })
    fireEvent.click(screen.getByRole("button", { name: "Save dataset" }))
    await waitFor(() => { expect(submitted).toMatchObject({ cases: [{ metadata: null }] }) })
  })

  it("stores supplied outputs of earlier nodes for a middle-stage case", async () => {
    let submitted: unknown = null
    server.use(http.post(`${API_BASE}/datasets`, async ({ request }) => {
      submitted = await request.json()
      return HttpResponse.json({ dataset_id: "stage_cases" }, { status: 201 })
    }))

    await renderRoute("/flows/support_case/datasets?create=true")
    fireEvent.change(await screen.findByLabelText("Dataset ID"), { target: { value: "stage_cases" } })
    fireEvent.change(screen.getByLabelText("Node outputs (JSON)"), {
      target: { value: JSON.stringify({ prepare: { message: "prepared" } }) },
    })
    fireEvent.click(screen.getByRole("button", { name: "Save dataset" }))
    await waitFor(() => {
      expect(submitted).toMatchObject({ cases: [{ node_outputs: { prepare: { message: "prepared" } } }] })
    })
  })

  it("does not create an empty thread when the selected agent is signed out", async () => {
    const claude = liveChatSessions[0]
    if (claude === undefined) throw new Error("chat fixture is missing")
    let creates = 0
    server.use(
      http.get(`${API_BASE}/chat/backend`, () => HttpResponse.json({ backend: "codex" })),
      http.get(`${API_BASE}/chat/status`, () => HttpResponse.json({ backend: "codex", state: "logged_out", method: null, account: null, detail: null })),
      http.get(`${API_BASE}/chat/sessions`, () => HttpResponse.json({ items: [claude], next_cursor: null, total_estimate: 1 })),
      http.post(`${API_BASE}/chat/sessions`, () => { creates += 1; return HttpResponse.json(claude) }),
    )
    await renderRoute("/flows/support_case/datasets?create=true")
    fireEvent.change(await screen.findByLabelText("Dataset ID"), { target: { value: "agent_cases" } })
    fireEvent.change(screen.getByLabelText("Scenarios to cover"), { target: { value: "urgent issue" } })
    fireEvent.click(screen.getByRole("button", { name: "Generate dataset" }))
    expect((await screen.findByRole("alert")).textContent).toContain("Sign in to Codex")
    expect(creates).toBe(0)
  })

  it("sends generation to a thread of the selected agent", async () => {
    const claude = liveChatSessions[0]
    if (claude === undefined) throw new Error("chat fixture is missing")
    const codex: ApiChatSession = {
      ...claude,
      session_id: "01a0b15e-69af-71c7-a54d-213c4df23861",
      backend: "codex",
      created_at: "2026-09-16T21:55:49Z",
    }
    const sent: string[] = []
    server.use(
      http.get(`${API_BASE}/chat/backend`, () => HttpResponse.json({ backend: "codex" })),
      http.get(`${API_BASE}/chat/status`, () => HttpResponse.json({ backend: "codex", state: "logged_in", method: "subscription", account: null, detail: null })),
      http.get(`${API_BASE}/chat/sessions`, () => HttpResponse.json({ items: [claude, codex], next_cursor: null, total_estimate: 2 })),
      http.post(`${API_BASE}/chat/sessions/:sessionId/messages`, ({ params }) => {
        sent.push(String(params["sessionId"]))
        return HttpResponse.json({ session_id: params["sessionId"], turn_id: "01a0b15e-69af-71c7-a54d-213c4df23862" }, { status: 202 })
      }),
    )
    await renderRoute("/flows/support_case/datasets?create=true")
    fireEvent.change(await screen.findByLabelText("Dataset ID"), { target: { value: "agent_cases" } })
    fireEvent.change(screen.getByLabelText("Scenarios to cover"), { target: { value: "urgent issue" } })
    fireEvent.click(screen.getByRole("button", { name: "Generate dataset" }))
    await waitFor(() => { expect(sent).toEqual([codex.session_id]) })
  })
})
