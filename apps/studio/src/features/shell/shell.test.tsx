import { fireEvent, screen, waitFor, within } from "@testing-library/react"
import { http, HttpResponse } from "msw"
import { describe, expect, it, vi } from "vitest"
import { liveFlowDetails, liveProviders } from "@/mocks/data/project"
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

const openPicker = async (): Promise<HTMLElement> => {
  fireEvent.keyDown(await screen.findByRole("button", { name: "Switch flow" }), { key: "Enter" })
  return screen.findByRole("menu")
}

const sectionLinks = async (): Promise<readonly HTMLElement[]> =>
  within(await screen.findByRole("navigation", { name: "Project sections" })).getAllByRole("link")

describe("Project shell", () => {
  it("names the project and links its sections on every project page", async () => {
    await renderRoute(`${FLOWS}/support_case/canvas`)
    const links = await sectionLinks()
    expect(links.map((link) => link.textContent)).toEqual(["Flows", "Research", "Settings"])
    expect(links.map(hrefOf)).toEqual(["/flows", "/research", "/settings"])
    expect(links.map((link) => link.getAttribute("aria-current"))).toEqual(["page", null, null])
    expect(screen.getByText("lumen")).toBeTruthy()
  })

  it("marks the research section on a research page and hides the flow controls", async () => {
    await renderRoute("/research")
    const links = await sectionLinks()
    expect(links.map((link) => link.getAttribute("aria-current"))).toEqual([null, "page", null])
    expect(screen.queryByRole("navigation", { name: "Flow views" })).toBeNull()
    expect(screen.queryByRole("button", { name: "Switch flow" })).toBeNull()
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

  it("keeps the chat and the project bar on the settings page", async () => {
    const router = await renderRoute(`${FLOWS}/support_case/canvas`)
    const settings = (await sectionLinks())[2]
    fireEvent.click(settings ?? document.body)
    expect(await screen.findByRole("navigation", { name: "Settings sections" })).toBeTruthy()
    expect(router.state.location.pathname).toBe("/settings")
    expect((await sectionLinks()).map((link) => link.getAttribute("aria-current"))).toEqual([null, null, "page"])
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

describe("Removed flow routes", () => {
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
