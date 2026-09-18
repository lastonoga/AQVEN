import type { ReactNode } from "react"
import { fireEvent, screen, waitFor, within } from "@testing-library/react"
import { http, HttpResponse } from "msw"
import { describe, expect, it, vi } from "vitest"
import { liveFlowDetails, liveProviders } from "@/mocks/data/project"
import { server } from "@/mocks/node"
import { renderRoute } from "@/test/render-route"

vi.mock("@/features/chat", () => ({
  ChatPanel: ({ header }: { readonly header: ReactNode }) => header,
  useChatThread: () => [],
  useChatScope: () => "flow",
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
  fireEvent.keyDown(screen.getByRole("button", { name: "Switch flow" }), { key: "Enter" })
  return screen.findByRole("menu")
}

describe("Shell", () => {
  it("marks the tab of the matched child route as the current page", async () => {
    await renderRoute(`${FLOWS}/support_case/canvas`)
    const tabs = within(await screen.findByRole("navigation", { name: "Flow views" })).getAllByRole("link")
    expect(tabs.map((tab) => tab.textContent)).toEqual(["Runs", "Nodes", "Datasets", "Evals"])
    expect(tabs.map((tab) => tab.getAttribute("aria-current"))).toEqual([null, "page", null, null])
  })

  it("links the run badge to the last run on the runs tab", async () => {
    await renderRoute(`${FLOWS}/support_case/nodes`)
    const badge = await screen.findByRole("link", { name: `Open run ${lastRun().ref}` })
    const target = new URL(hrefOf(badge) ?? "", "http://studio.test")
    expect(target.pathname).toBe(`${FLOWS}/support_case/runs`)
    expect(target.searchParams.get("run")?.replaceAll('"', "")).toBe(LAST_RUN)
    expect(badge.textContent).toBe(`${lastRun().ref}${lastRun().status}`)
  })

  it("hides the run badge for a flow that never ran", async () => {
    await renderRoute(`${FLOWS}/judge_panel/nodes`)
    await screen.findByRole("navigation", { name: "Flow views" })
    expect(screen.queryByRole("link", { name: /^Open run/ })).toBeNull()
  })

  it("keeps the flow frame focused on navigation", async () => {
    await renderRoute(`${FLOWS}/support_case/nodes`)
    expect((await screen.findByRole("button", { name: "Switch flow" })).textContent).toContain("lumen")
    expect(screen.queryByText("CaseRequest → CaseOutcome")).toBeNull()
    expect(screen.queryByText("last run FAILED")).toBeNull()
    expect(screen.queryByRole("radiogroup", { name: "Value format" })).toBeNull()
  })

  it("lists every flow with relative run times and keeps the current tab in the links", async () => {
    await renderRoute(`${FLOWS}/support_case/nodes`)
    const menu = await openPicker()
    const items = within(menu).getAllByRole("menuitem")
    const texts = items.map((item) => item.textContent)
    expect(texts[0]).toBe("judge_panel8 nodes · never run")
    expect(texts[1]).toMatch(new RegExp(`^support_case30 nodes · run ${lastRun().ref} · .+OPEN$`))
    expect(texts.slice(2)).toEqual(["Project overview", "Studio settings"])
    expect(items.slice(0, 2).map(hrefOf)).toEqual([`${FLOWS}/judge_panel/nodes`, `${FLOWS}/support_case/nodes`])
    expect(hrefOf(within(menu).getByRole("menuitem", { name: "Project overview" }))).toBe("/project")
    expect(hrefOf(within(menu).getByRole("menuitem", { name: "Studio settings" }))).toBeNull()
  })

  it("opens settings over the current flow and closes back to it", async () => {
    const router = await renderRoute(`${FLOWS}/support_case/nodes`)
    const menu = await openPicker()
    fireEvent.click(within(menu).getByRole("menuitem", { name: "Studio settings" }))

    const dialog = await screen.findByRole("dialog", { name: "Settings" })
    expect(router.state.location.pathname).toBe(`${FLOWS}/support_case/nodes`)
    expect(within(dialog).getByRole("navigation", { name: "Settings sections" })).toBeTruthy()
    expect(await within(dialog).findByText("Open another project")).toBeTruthy()

    fireEvent.click(within(dialog).getByRole("button", { name: "Model keys" }))
    expect(await within(dialog).findByText("Project secrets")).toBeTruthy()
    expect(router.state.location.pathname).toBe(`${FLOWS}/support_case/nodes`)

    fireEvent.click(within(dialog).getByRole("button", { name: "Close settings" }))
    expect(screen.queryByRole("dialog", { name: "Settings" })).toBeNull()
    expect(router.state.location.pathname).toBe(`${FLOWS}/support_case/nodes`)
  })

  it("loads provider settings only when their section opens", async () => {
    const reads = { providers: 0, secrets: 0, status: 0 }
    server.use(
      http.get("*/api/settings/providers", () => { reads.providers += 1; return HttpResponse.json(liveProviders) }),
      http.get("*/api/settings/secrets", () => { reads.secrets += 1; return HttpResponse.json([]) }),
      http.get("*/api/chat/status", () => { reads.status += 1; return HttpResponse.json({ backend: "claude", state: "logged_in", method: "subscription", account: null, detail: null }) }),
    )
    await renderRoute(`${FLOWS}/support_case/nodes`)
    expect(reads).toEqual({ providers: 0, secrets: 0, status: 0 })
    const menu = await openPicker()
    fireEvent.click(within(menu).getByRole("menuitem", { name: "Studio settings" }))
    const dialog = await screen.findByRole("dialog", { name: "Settings" })
    expect(within(dialog).getByText("Open another project")).toBeTruthy()
    expect(reads).toEqual({ providers: 0, secrets: 0, status: 0 })
    fireEvent.click(within(dialog).getByRole("button", { name: "Model keys" }))
    await waitFor(() => { expect(reads.providers).toBe(1) })
    expect(reads.secrets).toBe(1)
    expect(reads.status).toBe(0)
  })

  it("keeps the flow usable when settings fail and retries them in the dialog", async () => {
    server.use(http.get("*/api/settings/providers", () => HttpResponse.error()))
    const router = await renderRoute(`${FLOWS}/support_case/nodes`)
    const menu = await openPicker()
    fireEvent.click(within(menu).getByRole("menuitem", { name: "Studio settings" }))

    const dialog = await screen.findByRole("dialog", { name: "Settings" })
    fireEvent.click(within(dialog).getByRole("button", { name: "Model keys" }))
    expect((await within(dialog).findByRole("alert")).textContent).toContain("Settings could not be loaded")
    expect(router.state.location.pathname).toBe(`${FLOWS}/support_case/nodes`)

    server.use(http.get("*/api/settings/providers", () => HttpResponse.json(liveProviders)))
    fireEvent.click(within(dialog).getByRole("button", { name: "Try again" }))
    expect(await within(dialog).findByText("Project secrets")).toBeTruthy()
  })

  it("renders not found for a flow the engine does not know", async () => {
    await renderRoute(`${FLOWS}/no_such_flow/nodes`)
    expect(await screen.findByText("Page not found")).toBeDefined()
  })

  it("shows a route error and retries the failed loader", async () => {
    server.use(http.get("*/api/flows/support_case", () => HttpResponse.error()))
    await renderRoute(`${FLOWS}/support_case/nodes`)
    expect((await screen.findByRole("alert")).textContent).toContain("could not be loaded")
    server.use(http.get("*/api/flows/support_case", () => HttpResponse.json(liveFlowDetails["support_case"])))
    fireEvent.click(screen.getByRole("button", { name: "Try again" }))
    expect(await screen.findByRole("navigation", { name: "Flow views" })).toBeTruthy()
  })
})
