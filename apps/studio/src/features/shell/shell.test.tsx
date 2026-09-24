import { fireEvent, screen, waitFor, within } from "@testing-library/react"
import { http, HttpResponse } from "msw"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { API_BASE } from "@/api/client"
import { liveChatSessions } from "@/mocks/data/chat"
import { liveFlowDetails, liveProject, liveProviders } from "@/mocks/data/project"
import { server } from "@/mocks/node"
import { renderRoute } from "@/test/render-route"

vi.mock("@/features/chat", () => ({
  ChatPanel: () => null,
}))

const FLOWS = "/flows"

const lastRun = (): { readonly id: string; readonly ref: string; readonly status: string } => {
  const run = liveFlowDetails["support_case"]?.last_run
  if (run === undefined || run === null) throw new Error("the support_case fixture has no last run")
  return { id: run.run_id, ref: `#${run.run_id.slice(-6)}`, status: run.status.toUpperCase() }
}

const LAST_RUN = lastRun().id

const hrefOf = (element: HTMLElement): string | null => element.getAttribute("href")

const urlOf = (element: HTMLElement | undefined): URL => new URL(element?.getAttribute("href") ?? "", "http://studio.test")

const pathOf = (element: HTMLElement | undefined): string => urlOf(element).pathname

const flowOf = (element: HTMLElement | undefined): string | null => urlOf(element).searchParams.get("flow")?.replaceAll('"', "") ?? null

const openPicker = async (): Promise<HTMLElement> => {
  fireEvent.keyDown(await screen.findByRole("button", { name: "Switch flow" }), { key: "Enter" })
  return screen.findByRole("menu")
}

const LAST_FLOW_KEY = `aqven:flow:last:${liveProject.root}`

const EMPTY_FLOWS = { items: [], next_cursor: null, total_estimate: 0 }

const navLinks = async (name: string): Promise<readonly HTMLElement[]> =>
  within(await screen.findByRole("navigation", { name })).getAllByRole("link")

const currentOf = (links: readonly HTMLElement[]): readonly (string | null)[] => links.map((link) => link.getAttribute("aria-current"))

beforeEach(() => {
  localStorage.clear()
})

describe("Project shell", () => {
  it("names the project and the flow as one breadcrumb and switches between the flow and research modes", async () => {
    await renderRoute(`${FLOWS}/support_case/canvas`)
    const modes = await navLinks("Project modes")
    expect(modes.map((link) => link.textContent)).toEqual(["Flow", "Research"])
    expect(modes.map(pathOf)).toEqual([`${FLOWS}/support_case/canvas`, "/research"])
    expect(flowOf(modes[1])).toBe("support_case")
    expect(currentOf(modes)).toEqual(["true", null])
    const crumbs = await screen.findByRole("navigation", { name: "Project and flow" })
    expect(within(crumbs).getByText("lumen")).toBeTruthy()
    expect(within(crumbs).getByRole("button", { name: "Switch flow" }).textContent).toBe("support_case")
  })

  it("keeps the flow picker in research mode and lists the research views of the selected flow", async () => {
    await renderRoute("/research?flow=%22support_case%22")
    expect(currentOf(await navLinks("Project modes"))).toEqual([null, "true"])
    const tabs = await navLinks("Research views")
    expect(tabs.map((tab) => tab.textContent)).toEqual(["Experiments", "Series"])
    expect(tabs.map(pathOf)).toEqual(["/research", "/research/series"])
    expect(tabs.map(flowOf)).toEqual(["support_case", "support_case"])
    expect(currentOf(tabs)).toEqual(["true", null])
    expect(screen.queryByRole("navigation", { name: "Flow views" })).toBeNull()
    expect(screen.getByRole("button", { name: "Switch flow" }).textContent).toBe("support_case")
  })

  it("offers all experiments in the research picker and scopes the list to the picked flow", async () => {
    const router = await renderRoute("/research")
    expect((await screen.findByRole("button", { name: "Switch flow" })).textContent).toBe("All experiments")
    const items = within(await openPicker()).getAllByRole("menuitem")
    expect(items[0]?.textContent).toMatch(/^All experiments.*OPEN$/)
    expect(items.slice(1).map(pathOf)).toEqual(["/research", "/research"])
    fireEvent.click(items.find((item) => item.textContent.startsWith("judge_panel")) ?? document.body)
    await waitFor(() => {
      expect(router.state.location.search).toEqual({ flow: "judge_panel" })
    })
    await waitFor(() => {
      expect(localStorage.getItem(LAST_FLOW_KEY)).toBe("judge_panel")
    })
    await waitFor(() => {
      expect(screen.queryByRole("menu")).toBeNull()
    })
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(document.activeElement).not.toBe(screen.getByRole("button", { name: "Switch flow" }))
  })

  it("switches the selected flow to the flow an opened experiment tests", async () => {
    localStorage.setItem(LAST_FLOW_KEY, "judge_panel")
    await renderRoute("/research/experiments/reply_noninferior_mistral")
    expect((await screen.findByRole("button", { name: "Switch flow" })).textContent).toBe("support_case")
    await waitFor(() => {
      expect(localStorage.getItem(LAST_FLOW_KEY)).toBe("support_case")
    })
    expect(flowOf((await navLinks("Research views"))[0])).toBe("support_case")
  })

  it("files an experiment of arms only under all experiments", async () => {
    await renderRoute("/research/experiments/intent_split_long_messages")
    expect((await screen.findByRole("button", { name: "Switch flow" })).textContent).toBe("All experiments")
    expect((await navLinks("Research views")).map(flowOf)).toEqual([null, null])
  })

  it("marks the series view on the series list", async () => {
    await renderRoute("/research/series")
    expect(currentOf(await navLinks("Research views"))).toEqual([null, "true"])
  })

  it("shows the flow tabs of the open flow and marks the matched one", async () => {
    await renderRoute(`${FLOWS}/support_case/canvas`)
    const tabs = within(await screen.findByRole("navigation", { name: "Flow views" })).getAllByRole("link")
    expect(tabs.map((tab) => tab.textContent)).toEqual(["Graph", "Runs", "Cases"])
    expect(tabs.map(hrefOf)).toEqual([`${FLOWS}/support_case/canvas`, `${FLOWS}/support_case/runs`, `${FLOWS}/support_case/cases`])
    expect(tabs.map((tab) => tab.getAttribute("aria-current"))).toEqual(["page", null, null])
  })

  it("links the run badge to the last run on the runs tab", async () => {
    await renderRoute(`${FLOWS}/support_case/canvas`)
    const badge = await screen.findByRole("link", { name: `Open run ${lastRun().ref}` })
    const target = new URL(hrefOf(badge) ?? "", "http://studio.test")
    expect(target.pathname).toBe(`${FLOWS}/support_case/runs`)
    expect(target.searchParams.get("run")?.replaceAll('"', "")).toBe(LAST_RUN)
    expect(badge.textContent).toBe(`${lastRun().ref}${lastRun().status}`)
  })

  it("hides the run badge for a flow that never ran", async () => {
    await renderRoute(`${FLOWS}/judge_panel/canvas`)
    await screen.findByRole("navigation", { name: "Flow views" })
    expect(screen.queryByRole("link", { name: /^Open run/ })).toBeNull()
  })

  it("lists every flow in the picker and keeps the current tab in the links", async () => {
    await renderRoute(`${FLOWS}/support_case/runs`)
    expect((await screen.findByRole("button", { name: "Switch flow" })).textContent).toBe("support_case")
    const menu = await openPicker()
    const items = within(menu).getAllByRole("menuitem")
    expect(items.map((item) => item.textContent)[0]).toBe("judge_panel8 nodes · never run")
    expect(items[1]?.textContent).toMatch(new RegExp(`^support_case30 nodes · run ${lastRun().ref} · .+OPEN$`))
    expect(items.map(hrefOf)).toEqual([`${FLOWS}/judge_panel/runs`, `${FLOWS}/support_case/runs`])
  })

  it("opens settings from the gear at the end of the bar", async () => {
    const router = await renderRoute(`${FLOWS}/support_case/canvas`)
    const gear = await screen.findByRole("link", { name: "Settings" })
    expect(hrefOf(gear)).toBe("/settings")
    fireEvent.click(gear)
    expect(await screen.findByRole("navigation", { name: "Settings sections" })).toBeTruthy()
    expect(router.state.location.pathname).toBe("/settings")
    expect(currentOf(await navLinks("Project modes"))).toEqual([null, null])
    expect(screen.getByRole("link", { name: "Settings" }).getAttribute("aria-current")).toBe("page")
  })

  it("loads provider settings only when their section opens", async () => {
    const reads = { providers: 0, secrets: 0 }
    server.use(
      http.get("*/api/settings/providers", () => {
        reads.providers += 1
        return HttpResponse.json(liveProviders)
      }),
      http.get("*/api/settings/secrets", () => {
        reads.secrets += 1
        return HttpResponse.json([])
      }),
    )
    await renderRoute("/settings")
    const nav = await screen.findByRole("navigation", { name: "Settings sections" })
    expect(reads).toEqual({ providers: 0, secrets: 0 })
    fireEvent.click(within(nav).getByRole("link", { name: "Model keys" }))
    await waitFor(() => {
      expect(reads.providers).toBe(1)
    })
    expect(reads.secrets).toBe(1)
  })

  it("keeps settings usable when providers fail and retries them", async () => {
    server.use(http.get("*/api/settings/providers", () => HttpResponse.error()))
    await renderRoute("/settings?section=providers")
    expect((await screen.findByRole("alert")).textContent).toContain("Settings could not be loaded")
    server.use(http.get("*/api/settings/providers", () => HttpResponse.json(liveProviders)))
    fireEvent.click(screen.getByRole("button", { name: "Try again" }))
    expect(await screen.findByText("Project secrets")).toBeTruthy()
  })

  it("renders not found for a flow the engine does not know", async () => {
    await renderRoute(`${FLOWS}/no_such_flow/canvas`)
    expect(await screen.findByText("Page not found")).toBeDefined()
  })

  it("shows a route error and retries the failed loader", async () => {
    server.use(http.get("*/api/flows/support_case", () => HttpResponse.error()))
    await renderRoute(`${FLOWS}/support_case/canvas`)
    expect((await screen.findByRole("alert")).textContent).toContain("could not be loaded")
    server.use(http.get("*/api/flows/support_case", () => HttpResponse.json(liveFlowDetails["support_case"])))
    fireEvent.click(screen.getByRole("button", { name: "Try again" }))
    expect(await screen.findByRole("navigation", { name: "Flow views" })).toBeTruthy()
  })
})

describe("Landing", () => {
  it("opens the graph of the most recently run flow on a first visit", async () => {
    const router = await renderRoute("/")
    expect(router.state.location.pathname).toBe(`${FLOWS}/support_case/canvas`)
  })

  it("remembers the last opened flow and opens it again", async () => {
    await renderRoute(`${FLOWS}/judge_panel/canvas`)
    await screen.findByRole("navigation", { name: "Flow views" })
    expect(localStorage.getItem(LAST_FLOW_KEY)).toBe("judge_panel")
    const router = await renderRoute("/")
    expect(router.state.location.pathname).toBe(`${FLOWS}/judge_panel/canvas`)
  })

  it("falls back when the remembered flow is gone", async () => {
    localStorage.setItem(LAST_FLOW_KEY, "gone_flow")
    const router = await renderRoute("/")
    expect(router.state.location.pathname).toBe(`${FLOWS}/support_case/canvas`)
  })

  it("brings the flow mode back to the last opened flow", async () => {
    const router = await renderRoute(`${FLOWS}/judge_panel/runs`)
    await screen.findByRole("navigation", { name: "Flow views" })
    fireEvent.click(within(await screen.findByRole("navigation", { name: "Project modes" })).getByRole("link", { name: "Research" }))
    await screen.findByRole("navigation", { name: "Research views" })
    fireEvent.click(within(screen.getByRole("navigation", { name: "Project modes" })).getByRole("link", { name: "Flow" }))
    await waitFor(() => {
      expect(router.state.location.pathname).toBe(`${FLOWS}/judge_panel/canvas`)
    })
  })

  it("shows an empty project on the graph area with the hand-off to the chat", async () => {
    server.use(http.get(`${API_BASE}/flows`, () => HttpResponse.json(EMPTY_FLOWS)))
    const router = await renderRoute("/")
    expect(router.state.location.pathname).toBe("/")
    expect(await screen.findByText("No flows yet")).toBeTruthy()
    expect(screen.getByRole("button", { name: "Ask the agent to write a flow" })).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Switch flow" })).toBeNull()
  })

  it("hands the flow writing to the open chat thread", async () => {
    const sent: { readonly session: unknown; readonly text: unknown }[] = []
    server.use(
      http.get(`${API_BASE}/flows`, () => HttpResponse.json(EMPTY_FLOWS)),
      http.post(`${API_BASE}/chat/sessions/:sessionId/messages`, async ({ params, request }) => {
        const body: unknown = await request.json()
        sent.push({ session: params["sessionId"], text: typeof body === "object" && body !== null && "text" in body ? body.text : null })
        return HttpResponse.json({ turn_id: "turn-1", accepted_at: "2026-09-18T03:00:00Z" }, { status: 202 })
      }),
    )
    await renderRoute("/")
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

describe("Removed flow routes", () => {
  it("renders not found for the old flow list", async () => {
    await renderRoute(FLOWS)
    expect(await screen.findByText("Page not found")).toBeDefined()
  })


  it.each(["nodes", "evals", "review", "datasets"])("renders not found for the old %s tab", async (tab) => {
    await renderRoute(`${FLOWS}/support_case/${tab}`)
    expect(await screen.findByText("Page not found")).toBeDefined()
  })

  it("opens a flow on its graph", async () => {
    const router = await renderRoute(`${FLOWS}/support_case`)
    await waitFor(() => {
      expect(router.state.location.pathname).toBe(`${FLOWS}/support_case/canvas`)
    })
  })
})
