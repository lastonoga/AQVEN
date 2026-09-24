import { fireEvent, screen, waitFor, within } from "@testing-library/react"
import { http, HttpResponse } from "msw"
import { describe, expect, it } from "vitest"
import type { ApiChatSession } from "@/domain"
import { API_BASE } from "@/api/client"
import { server } from "@/mocks/node"
import { renderRoute } from "@/test/render-route"

const CREATED: ApiChatSession = {
  session_id: "01a0b15e-69af-71c7-a54d-213c4df2385e",
  backend: "claude",
  project_root: "/Users/kirunya/Projects/my/ai-workflows-automate/examples/lumen",
  flow_id: "support_case",
  model: null,
  permission_mode: "default",
  created_at: "2026-09-17T21:55:49.808312Z",
  last_seq: 0,
}

const openAgentSettings = async (): Promise<HTMLElement> => {
  fireEvent.click(await screen.findByRole("link", { name: "Settings" }))
  await screen.findByRole("radiogroup", { name: "Chat backend" })
  return document.body
}

describe("ChatPanel", () => {
  it("leaves a new agent empty until New thread is chosen", async () => {
    const bodies: unknown[] = []
    server.use(
      http.get(`${API_BASE}/chat/sessions`, () => HttpResponse.json({ items: [], next_cursor: null, total_estimate: 0 })),
      http.post(`${API_BASE}/chat/sessions`, async ({ request }) => {
        bodies.push(await request.json())
        return HttpResponse.json(CREATED)
      }),
    )
    await renderRoute("/flows/support_case/canvas")
    const trigger = await screen.findByRole("button", { name: "Switch thread" })
    expect(screen.queryByText("Workflow · support_case")).toBeNull()
    expect(bodies).toEqual([])
    expect(await screen.findByText("No thread for this agent yet. Open the thread menu to start one.")).toBeTruthy()
    fireEvent.keyDown(trigger, { key: "Enter" })
    fireEvent.click(within(await screen.findByRole("menu", { name: "Switch thread" })).getByRole("menuitem", { name: "New thread" }))
    await waitFor(() => {
      expect(bodies).toEqual([expect.objectContaining({ flow_id: "support_case", resume_session_id: null })])
    })
  })

  it("keeps project threads and new thread inside a single dropdown", async () => {
    sessionStorage.removeItem(`aqven:chat:session:${CREATED.project_root}`)
    const codex: ApiChatSession = {
      ...CREATED,
      session_id: "01a0b15e-69af-71c7-a54d-213c4df2385f",
      backend: "codex",
      flow_id: "other_flow",
      created_at: "2026-09-18T09:00:00Z",
    }
    const created: ApiChatSession = { ...CREATED, session_id: "01a0b15e-69af-71c7-a54d-213c4df23860", backend: "claude" }
    const bodies: unknown[] = []
    let selected = "codex"
    server.use(
      http.get(`${API_BASE}/chat/backend`, () => HttpResponse.json({ backend: selected })),
      http.put(`${API_BASE}/chat/backend`, async ({ request }) => {
        const body: unknown = await request.json()
        if (typeof body === "object" && body !== null && "backend" in body && typeof body.backend === "string") selected = body.backend
        return HttpResponse.json({ backend: selected })
      }),
      http.get(`${API_BASE}/chat/status`, () => HttpResponse.json({ backend: selected, state: "logged_in", method: "subscription", account: "test@example.com", detail: null })),
      http.get(`${API_BASE}/chat/sessions`, () => HttpResponse.json({ items: [CREATED, codex], next_cursor: null, total_estimate: 2 })),
      http.post(`${API_BASE}/chat/sessions`, async ({ request }) => {
        bodies.push(await request.json())
        return HttpResponse.json(created)
      }),
    )
    await renderRoute("/flows/support_case/canvas")
    const trigger = await screen.findByRole("button", { name: "Switch thread" })
    expect(trigger.textContent).toContain("Codex · other_flow")
    expect(screen.queryByRole("menuitem", { name: "New thread" })).toBeNull()
    expect(screen.queryByText("Threads")).toBeNull()
    fireEvent.keyDown(trigger, { key: "Enter" })
    const menu = await screen.findByRole("menu", { name: "Switch thread" })
    expect(within(menu).getByRole("menuitem", { name: /Codex.*other_flow/ }).getAttribute("aria-current")).toBe("true")
    fireEvent.click(within(menu).getByRole("menuitem", { name: /Claude.*support_case/ }))
    await waitFor(() => { expect(trigger.textContent).toContain("Claude Agent · support_case") })
    expect(screen.queryByText("Workflow · support_case")).toBeNull()
    fireEvent.keyDown(trigger, { key: "Enter" })
    fireEvent.click(within(await screen.findByRole("menu", { name: "Switch thread" })).getByRole("menuitem", { name: "New thread" }))
    await waitFor(() => {
      expect(bodies).toEqual([expect.objectContaining({ flow_id: "support_case", resume_session_id: null })])
    })
    await waitFor(() => {
      expect(trigger.textContent).toContain("Claude Agent · support_case")
    })
  })

  it("keeps old threads browsable when the selected backend is signed out", async () => {
    const bodies: unknown[] = []
    server.use(
      http.get(`${API_BASE}/chat/backend`, () => HttpResponse.json({ backend: "codex" })),
      http.get(`${API_BASE}/chat/status`, () => HttpResponse.json({ backend: "codex", state: "logged_out", method: null, account: null, detail: "Run codex login" })),
      http.get(`${API_BASE}/chat/sessions`, () => HttpResponse.json({ items: [CREATED], next_cursor: null, total_estimate: 1 })),
      http.post(`${API_BASE}/chat/sessions`, async ({ request }) => {
        bodies.push(await request.json())
        return HttpResponse.json(CREATED)
      }),
    )
    await renderRoute("/flows/support_case/canvas")
    const trigger = await screen.findByRole("button", { name: "Switch thread" })
    expect(trigger.textContent).toContain("Select thread")
    fireEvent.keyDown(trigger, { key: "Enter" })
    const menu = await screen.findByRole("menu", { name: "Switch thread" })
    expect(within(menu).getByRole("menuitem", { name: /Claude.*support_case/ })).toBeTruthy()
    fireEvent.click(within(menu).getByRole("menuitem", { name: "New thread" }))
    expect((await screen.findByRole("alert")).textContent).toContain("Run codex login")
    expect(bodies).toEqual([])
  })

  it("switches the visible conversation to the selected agent without rewriting old threads", async () => {
    sessionStorage.removeItem(`aqven:chat:session:${CREATED.project_root}`)
    const codex: ApiChatSession = {
      ...CREATED,
      session_id: "01a0b15e-69af-71c7-a54d-213c4df2385f",
      backend: "codex",
      created_at: "2026-09-18T09:00:00Z",
    }
    let backend = "claude"
    server.use(
      http.get(`${API_BASE}/chat/backend`, () => HttpResponse.json({ backend })),
      http.put(`${API_BASE}/chat/backend`, async ({ request }) => {
        const body: unknown = await request.json()
        if (typeof body === "object" && body !== null && "backend" in body && body.backend === "codex") backend = "codex"
        return HttpResponse.json({ backend })
      }),
      http.get(`${API_BASE}/chat/sessions`, () => HttpResponse.json({ items: [CREATED, codex], next_cursor: null, total_estimate: 2 })),
    )
    await renderRoute("/flows/support_case/canvas")
    expect(screen.getByRole("button", { name: "Switch thread" }).textContent).toContain("Claude Agent")
    expect(screen.queryByRole("radiogroup", { name: "Chat backend" })).toBeNull()
    const dialog = await openAgentSettings()
    const switcher = await within(dialog).findByRole("radiogroup", { name: "Chat backend" })
    fireEvent.click(within(switcher).getByRole("radio", { name: "Codex" }))
    await waitFor(() => { expect(within(switcher).getByRole("radio", { name: "Codex" }).getAttribute("aria-checked")).toBe("true") })
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Switch thread" }).textContent).toContain("Codex")
    })
    expect(backend).toBe("codex")
    fireEvent.keyDown(screen.getByRole("button", { name: "Switch thread" }), { key: "Enter" })
    expect(within(await screen.findByRole("menu", { name: "Switch thread" })).getByRole("menuitem", { name: /Claude.*support_case/ })).toBeTruthy()
  })

  it("keeps the current conversation and agent when switching fails", async () => {
    sessionStorage.removeItem(`aqven:chat:session:${CREATED.project_root}`)
    server.use(
      http.get(`${API_BASE}/chat/sessions`, () => HttpResponse.json({ items: [CREATED], next_cursor: null, total_estimate: 1 })),
      http.put(`${API_BASE}/chat/backend`, () => HttpResponse.json({ ok: false, op: "chat_backend_select", code: "BACKEND_UNAVAILABLE", message: "Cannot select Codex", problems: [], retry_after_ms: null }, { status: 503 })),
    )
    await renderRoute("/flows/support_case/canvas")
    const trigger = await screen.findByRole("button", { name: "Switch thread" })
    const dialog = await openAgentSettings()
    const switcher = await within(dialog).findByRole("radiogroup", { name: "Chat backend" })
    fireEvent.click(within(switcher).getByRole("radio", { name: "Codex" }))
    expect((await screen.findAllByRole("alert")).map((alert) => alert.textContent).join(" ")).toContain("Cannot select Codex")
    expect(within(switcher).getByRole("radio", { name: "Claude Agent" }).getAttribute("aria-checked")).toBe("true")
    expect(trigger.textContent).toContain("Claude Agent · support_case")
  })

  it("shows a retry when the selected agent cannot be loaded", async () => {
    server.use(http.get(`${API_BASE}/chat/backend`, () => HttpResponse.error()))
    await renderRoute("/flows/support_case/canvas")
    expect((await screen.findByRole("alert")).textContent).toContain("Could not load the selected agent")
    server.use(http.get(`${API_BASE}/chat/backend`, () => HttpResponse.json({ backend: "claude" })))
    fireEvent.click(screen.getByRole("button", { name: "Retry" }))
    expect(await screen.findByRole("button", { name: "Switch thread" })).toBeTruthy()
  })

  it("keeps a failed thread load local to chat and offers retry", async () => {
    server.use(http.get(`${API_BASE}/chat/sessions`, () => HttpResponse.error()))
    await renderRoute("/flows/support_case/canvas")
    expect((await screen.findByRole("alert")).textContent).toContain("Could not load threads")
    server.use(http.get(`${API_BASE}/chat/sessions`, () => HttpResponse.json({ items: [CREATED], next_cursor: null, total_estimate: 1 })))
    fireEvent.click(screen.getByRole("button", { name: "Retry" }))
    expect(await screen.findByRole("button", { name: "Switch thread" })).toBeTruthy()
  })

  it("does not expose the old agent thread while the new agent threads load", async () => {
    const codex: ApiChatSession = { ...CREATED, session_id: "01a0b15e-69af-71c7-a54d-213c4df2385f", backend: "codex" }
    let selected = "claude"
    let reads = 0
    const gate: { release: () => void } = { release: () => undefined }
    const blocked = new Promise<void>((resolve) => { gate.release = resolve })
    server.use(
      http.get(`${API_BASE}/chat/backend`, () => HttpResponse.json({ backend: selected })),
      http.put(`${API_BASE}/chat/backend`, () => { selected = "codex"; return HttpResponse.json({ backend: selected }) }),
      http.get(`${API_BASE}/chat/sessions`, async () => {
        reads += 1
        if (reads > 1) await blocked
        return HttpResponse.json({ items: [CREATED, codex], next_cursor: null, total_estimate: 2 })
      }),
    )
    await renderRoute("/flows/support_case/canvas")
    expect((await screen.findByRole("button", { name: "Switch thread" })).textContent).toContain("Claude Agent")
    const dialog = await openAgentSettings()
    const switcher = await within(dialog).findByRole("radiogroup", { name: "Chat backend" })
    fireEvent.click(within(switcher).getByRole("radio", { name: "Codex" }))
    await waitFor(() => { expect(within(switcher).getByRole("radio", { name: "Codex" }).getAttribute("aria-checked")).toBe("true") })
    expect(screen.queryByRole("button", { name: "Switch thread" })).toBeNull()
    expect(screen.getAllByRole("status").map((status) => status.textContent).join(" ")).toContain("Connecting to the agent")
    gate.release()
    expect((await screen.findByRole("button", { name: "Switch thread" })).textContent).toContain("Codex")
  })

  it("does not create a thread if another tab changed the selected agent", async () => {
    let selected = "claude"
    let creates = 0
    server.use(
      http.get(`${API_BASE}/chat/backend`, () => HttpResponse.json({ backend: selected })),
      http.get(`${API_BASE}/chat/status`, () => {
        selected = "codex"
        return HttpResponse.json({ backend: "codex", state: "logged_in", method: "subscription", account: null, detail: null })
      }),
      http.get(`${API_BASE}/chat/sessions`, () => HttpResponse.json({ items: [CREATED], next_cursor: null, total_estimate: 1 })),
      http.post(`${API_BASE}/chat/sessions`, () => { creates += 1; return HttpResponse.json(CREATED) }),
    )
    await renderRoute("/flows/support_case/canvas")
    const trigger = await screen.findByRole("button", { name: "Switch thread" })
    fireEvent.keyDown(trigger, { key: "Enter" })
    fireEvent.click(within(await screen.findByRole("menu", { name: "Switch thread" })).getByRole("menuitem", { name: "New thread" }))
    expect((await screen.findByRole("alert")).textContent).toContain("selected agent changed")
    expect(creates).toBe(0)
    expect(await screen.findByText("No thread for this agent yet. Open the thread menu to start one.")).toBeTruthy()
  })

  it("keeps the old thread usable if creation returns a different agent", async () => {
    server.use(
      http.get(`${API_BASE}/chat/sessions`, () => HttpResponse.json({ items: [CREATED], next_cursor: null, total_estimate: 1 })),
      http.post(`${API_BASE}/chat/sessions`, () => HttpResponse.json({ ...CREATED, session_id: "01a0b15e-69af-71c7-a54d-213c4df2385f", backend: "codex" })),
    )
    await renderRoute("/flows/support_case/canvas")
    const trigger = await screen.findByRole("button", { name: "Switch thread" })
    fireEvent.keyDown(trigger, { key: "Enter" })
    fireEvent.click(within(await screen.findByRole("menu", { name: "Switch thread" })).getByRole("menuitem", { name: "New thread" }))
    expect((await screen.findByRole("alert")).textContent).toContain("selected agent changed")
    expect(trigger.textContent).toContain("Claude Agent · support_case")
  })
})
