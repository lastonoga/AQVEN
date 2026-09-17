import { fireEvent, screen, within } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { MOCK_SCENARIO_KEY } from "@/mocks/data/setup"
import { renderRoute } from "@/test/render-route"

const hrefOf = (element: HTMLElement): URL => new URL(element.getAttribute("href") ?? "", "http://studio.test")

const firstRun = (): void => {
  localStorage.setItem(MOCK_SCENARIO_KEY, "first-run")
}

afterEach(() => {
  localStorage.removeItem(MOCK_SCENARIO_KEY)
})

describe("Landing", () => {
  it("opens the first workflow of the launched project", async () => {
    const router = await renderRoute("/")
    expect(router.state.location.pathname).toBe("/en/hotel_pitch/pitch_pipeline/schema")
  })

  it("starts setup when the project has no workflows", async () => {
    firstRun()
    const router = await renderRoute("/")
    expect(router.state.location.pathname).toBe("/en/setup")
  })
})

describe("Onboarding", () => {
  it("names the launched project and shows a single agent without a default-agent choice", async () => {
    await renderRoute("/en/setup")
    expect(await screen.findByRole("heading", { name: "Set up hotel-pitch" })).toBeTruthy()
    expect(screen.getByText("READY")).toBeTruthy()
    expect(screen.queryByText("Default agent")).toBeNull()
    expect(screen.queryByText("Codex")).toBeNull()
  })

  it("tells how to sign in to Claude when it is signed out", async () => {
    firstRun()
    await renderRoute("/en/setup?step=agent")
    expect(await screen.findByText("SIGN IN")).toBeTruthy()
    expect(screen.getByText("Run this in Terminal, type /login, then check again")).toBeTruthy()
    expect(screen.getByText("claude")).toBeTruthy()
  })

  it("lists model keys with where each one comes from", async () => {
    await renderRoute("/en/setup?step=providers")
    expect(await screen.findByText("OpenRouter")).toBeTruthy()
    expect(screen.getByText("PROJECT")).toBeTruthy()
    expect(screen.getByText("••••f3Qa · from ANTHROPIC_API_KEY")).toBeTruthy()
    expect(screen.getAllByText("NOT SET")).toHaveLength(3)
  })

  it("warns when no model key resolves", async () => {
    firstRun()
    await renderRoute("/en/setup?step=providers")
    expect(await screen.findByText("Workflows that call models need at least one key. You can add keys later in Settings.")).toBeTruthy()
  })

  it("offers three ways to start in a project without workflows", async () => {
    firstRun()
    await renderRoute("/en/setup?step=workflow")
    expect(await screen.findByText("Start your first workflow")).toBeTruthy()
    expect(screen.getByText("Describe it to the agent")).toBeTruthy()
    expect(screen.getByText("Start from an example")).toBeTruthy()
    expect(screen.getByText("Empty workflow")).toBeTruthy()
  })

  it("links existing workflows into Studio", async () => {
    await renderRoute("/en/setup?step=workflow")
    const list = await screen.findByRole("navigation", { name: "Workflows in hotel-pitch" })
    expect(within(list).getAllByRole("link").map((link) => hrefOf(link).pathname)).toEqual([
      "/en/hotel_pitch/pitch_pipeline/schema",
      "/en/hotel_pitch/seo_brief_writer/schema",
      "/en/hotel_pitch/review_summarizer/schema",
      "/en/hotel_pitch/support_triage/schema",
    ])
  })
})

describe("Settings", () => {
  it("shows the launched project read-only with the command for another project", async () => {
    await renderRoute("/en/settings")
    const nav = await screen.findByRole("navigation", { name: "Settings sections" })
    expect(within(nav).getAllByRole("link").map((link) => link.textContent)).toEqual(["Project", "Chat agent", "Model keys", "MCP connections", "Updates"])
    expect(screen.getByText("/Users/you/Projects/hotel-pitch")).toBeTruthy()
    expect(screen.getByText("aqven studio")).toBeTruthy()
  })

  it("configures the Claude agent and rebuilds effort when the model changes", async () => {
    await renderRoute("/en/settings?section=agents")
    const model = await screen.findByRole("radiogroup", { name: "Claude Agent Model" })
    expect(within(model).getByRole("radio", { name: "Sonnet" }).getAttribute("aria-checked")).toBe("true")
    expect(within(screen.getByRole("radiogroup", { name: "Claude Agent Permissions" })).getByRole("radio", { name: "default" }).getAttribute("aria-checked")).toBe("true")
    expect(screen.getByRole("spinbutton", { name: "Claude Agent Spend limit per request, $" })).toHaveProperty("value", "2")
    fireEvent.click(within(model).getByRole("radio", { name: "Haiku" }))
    expect(screen.getByText("Haiku has no effort setting")).toBeTruthy()
    expect(screen.queryByRole("radiogroup", { name: /^Codex/ })).toBeNull()
  })

  it("connects external agents through aqven mcp and upgrades through the package manager", async () => {
    await renderRoute("/en/settings?section=mcp")
    expect(await screen.findByText("claude mcp add --scope project aqven -- uv run aqven mcp")).toBeTruthy()
    await renderRoute("/en/settings?section=updates")
    expect(await screen.findByText("uv lock --upgrade-package aqven && uv sync")).toBeTruthy()
  })
})
