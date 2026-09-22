import { screen, within } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { liveFlows, liveProject } from "@/mocks/data/project"
import { renderRoute } from "@/test/render-route"

const PROJECT_PATH = "/project"

describe("ProjectScreen", () => {
  it("shows the launched project with its index state", async () => {
    await renderRoute(PROJECT_PATH)
    expect(await screen.findByRole("heading", { name: liveProject.package ?? liveProject.root })).toBeTruthy()
    expect(screen.getByText(liveProject.root)).toBeTruthy()
    expect(screen.getByText("ready")).toBeTruthy()
    expect(screen.getByText("no problems")).toBeTruthy()
  })

  it("lists every workflow the server reports with a link into its canvas", async () => {
    await renderRoute(PROJECT_PATH)
    const list = await screen.findByRole("navigation", { name: "Workflows of the project" })
    expect(within(list).getAllByRole("heading").map((row) => row.textContent)).toEqual(liveFlows.map((flow) => flow.flow_id))
    expect(within(list).getAllByRole("link").map((link) => link.getAttribute("href"))).toEqual(
      liveFlows.map((flow) => `/flows/${flow.flow_id}/canvas`),
    )
    expect(within(list).getByText("30 nodes")).toBeTruthy()
    expect(within(list).getByText("CaseRequest → CaseOutcome")).toBeTruthy()
  })
})
