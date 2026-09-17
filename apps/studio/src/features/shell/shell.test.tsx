import { fireEvent, screen, within } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { renderRoute } from "@/test/render-route"

const WORKSPACE = "/en/hotel_pitch"

const hrefOf = (element: HTMLElement): string | null => element.getAttribute("href")

const openPicker = async (): Promise<HTMLElement> => {
  fireEvent.keyDown(screen.getByRole("button", { name: "Switch workflow" }), { key: "Enter" })
  return screen.findByRole("menu")
}

describe("Shell", () => {
  it("marks the mode tab of the matched child route as the current page", async () => {
    await renderRoute(`${WORKSPACE}/pitch_pipeline/review`)
    const tabs = within(await screen.findByRole("navigation", { name: "Workflow views" })).getAllByRole("link")
    expect(tabs.map((tab) => tab.textContent)).toEqual(["Schema", "Dataflow", "Nodes", "Tests", "Review"])
    expect(tabs.map((tab) => tab.getAttribute("aria-current"))).toEqual([null, null, null, null, "page"])
  })

  it("links the run badge to the latest run in Dataflow", async () => {
    await renderRoute(`${WORKSPACE}/pitch_pipeline/schema?node=pitch_gen_b`)
    const badge = await screen.findByRole("link", { name: "Open run #8247 in Dataflow" })
    const target = new URL(hrefOf(badge) ?? "", "http://studio.test")
    expect(target.pathname).toBe(`${WORKSPACE}/pitch_pipeline/dataflow`)
    expect(target.searchParams.get("run")?.replaceAll('"', "")).toBe("8247")
    expect(badge.textContent).toBe("#8247DEGRADED")
  })

  it("hides the run badge for a workflow that never ran", async () => {
    await renderRoute(`${WORKSPACE}/support_triage/schema`)
    await screen.findByRole("navigation", { name: "Workflow views" })
    expect(screen.queryByRole("link", { name: /^Open run/ })).toBeNull()
  })

  it("lists every workflow with relative run times and keeps the current mode in the links", async () => {
    await renderRoute(`${WORKSPACE}/pitch_pipeline/nodes?node=pitch_gen_b`)
    const menu = await openPicker()
    const items = within(menu).getAllByRole("menuitem")
    expect(items.map((item) => item.textContent)).toEqual([
      "pitch_pipeline7 stages · run #8247 · 2h agoOPEN",
      "seo_brief_writer4 stages · run #8102 · yesterday",
      "review_summarizer3 stages · run #7980 · 3d ago",
      "support_triage8 stages · never run",
      "New workflow",
      "All workflows",
      "Workflow settings",
      "Studio settings",
    ])
    expect(items.slice(0, 4).map((item) => item.getAttribute("data-selected"))).toEqual(["true", "false", "false", "false"])
    expect(items.slice(0, 4).map(hrefOf)).toEqual([
      `${WORKSPACE}/pitch_pipeline/nodes`,
      `${WORKSPACE}/seo_brief_writer/nodes`,
      `${WORKSPACE}/review_summarizer/nodes`,
      `${WORKSPACE}/support_triage/nodes`,
    ])
    expect(within(menu).getByRole("menuitem", { name: "Workflow settings" }).getAttribute("href")).toBe(
      `${WORKSPACE}/pitch_pipeline/nodes`,
    )
    expect(within(menu).getByRole("menuitem", { name: "Studio settings" }).getAttribute("href")).toBe("/en/settings")
  })

  it("maps a test detail page to the tests list when switching workflow", async () => {
    await renderRoute(`${WORKSPACE}/pitch_pipeline/tests/pitch_gen_b?row=07`)
    const menu = await openPicker()
    expect(hrefOf(within(menu).getByRole("menuitem", { name: /^seo_brief_writer/ }))).toBe(`${WORKSPACE}/seo_brief_writer/tests`)
  })

  it("renders not found for an unknown workflow", async () => {
    await renderRoute(`${WORKSPACE}/unknown_flow/schema`)
    expect(await screen.findByText("Page not found")).toBeDefined()
  })
})
