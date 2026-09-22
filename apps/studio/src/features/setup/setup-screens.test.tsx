import { fireEvent, screen, waitFor, within } from "@testing-library/react"
import { http, HttpResponse } from "msw"
import { describe, expect, it } from "vitest"
import { liveChatStatus } from "@/mocks/data/chat"
import { liveFlows, liveProject, liveProviders, liveSecrets } from "@/mocks/data/project"
import { renderRoute } from "@/test/render-route"
import { API_BASE } from "@/api/client"
import { server } from "@/mocks/node"

const unresolvedProviders = liveProviders.filter((provider) => provider.source === null)

const hrefs = (container: HTMLElement): readonly (string | null)[] =>
  within(container)
    .getAllByRole("link")
    .map((link) => link.getAttribute("href"))

describe("Landing", () => {
  it("opens the most recently run workflow of the launched project", async () => {
    const router = await renderRoute("/")
    expect(router.state.location.pathname).toBe("/flows/support_case/canvas")
  })

  it("redirects an old English URL while preserving its query", async () => {
    const router = await renderRoute("/en/setup?step=providers")
    expect(router.state.location.pathname).toBe("/setup")
    expect(router.state.location.search).toEqual({ step: "providers" })
  })
})

describe("Onboarding", () => {
  it("names the launched project and reports the sign-in of the chat agent", async () => {
    await renderRoute("/setup")
    expect(await screen.findByRole("heading", { name: `Set up ${liveProject.package ?? ""}` })).toBeTruthy()
    expect(await screen.findByText("SIGNED IN")).toBeTruthy()
    expect(screen.getByText(liveChatStatus.account ?? "")).toBeTruthy()
    expect(screen.getByText("subscription")).toBeTruthy()
    expect(screen.queryByRole("radiogroup", { name: "Chat backend" })).toBeNull()
  })

  it("offers a retry when the selected agent cannot be loaded during setup", async () => {
    server.use(http.get(`${API_BASE}/chat/backend`, () => HttpResponse.error()))
    await renderRoute("/setup")
    expect((await screen.findByRole("alert")).textContent).toContain("Could not load the selected agent")
    server.use(http.get(`${API_BASE}/chat/backend`, () => HttpResponse.json({ backend: "claude" })))
    fireEvent.click(screen.getByRole("button", { name: "Try again" }))
    expect(await screen.findByText("SIGNED IN")).toBeTruthy()
  })

  it("lists every model key the engine declares with where it resolves from", async () => {
    await renderRoute("/setup?step=providers")
    expect(await screen.findByText("openrouter")).toBeTruthy()
    expect(screen.getAllByText("NOT SET")).toHaveLength(unresolvedProviders.length)
    expect(screen.getByText("••••0860 · OPENROUTER_API_KEY")).toBeTruthy()
    expect(screen.getByText("not set · OPENAI_API_KEY")).toBeTruthy()
    expect(screen.getByText("declared by this project")).toBeTruthy()
  })

  it("keeps the warning away while the openrouter key of the project resolves", async () => {
    await renderRoute("/setup?step=providers")
    expect(await screen.findByText(".ENV FILE")).toBeTruthy()
    expect(
      screen.queryByText("No model key resolves yet. Export the environment variable, or add it to the .env file of this project."),
    ).toBeNull()
  })

  it("links the workflows of the project into the canvas", async () => {
    await renderRoute("/setup?step=workflow")
    const list = await screen.findByRole("navigation", { name: "Workflows of the project" })
    expect(hrefs(list)).toEqual(liveFlows.map((flow) => `/flows/${flow.flow_id}/canvas`))
    expect(within(list).getByText("8 nodes")).toBeTruthy()
  })
})

describe("Settings", () => {
  it("shows the launched project read-only with the command for another project", async () => {
    await renderRoute("/settings")
    const nav = await screen.findByRole("navigation", { name: "Settings sections" })
    expect(within(nav).getAllByRole("link").map((link) => link.textContent)).toEqual([
      "Project",
      "Chat agent",
      "Model keys",
      "MCP connections",
      "Updates",
    ])
    expect(screen.getByText(liveProject.root)).toBeTruthy()
    expect(screen.getByText("aqven studio")).toBeTruthy()
  })

  it("shows the project's index state and every workflow with a link into its canvas", async () => {
    await renderRoute("/settings")
    expect(await screen.findByText("ready")).toBeTruthy()
    expect(screen.getByText("no problems")).toBeTruthy()
    const list = await screen.findByRole("navigation", { name: "Workflows of the project" })
    expect(within(list).getAllByRole("heading").map((row) => row.textContent)).toEqual(liveFlows.map((flow) => flow.flow_id))
    expect(within(list).getAllByRole("link").map((link) => link.getAttribute("href"))).toEqual(
      liveFlows.map((flow) => `/flows/${flow.flow_id}/canvas`),
    )
    expect(within(list).getByText("30 nodes")).toBeTruthy()
    expect(within(list).getByText("CaseRequest → CaseOutcome")).toBeTruthy()
  })

  it("lists every secret the project declares with the variable, the source and who declares it", async () => {
    await renderRoute("/settings?section=providers")
    expect(await screen.findByText("Project secrets")).toBeTruthy()
    const kbToken = liveSecrets.find((secret) => secret.env_var === "LUMEN_KB_TOKEN")
    expect(kbToken).toBeDefined()
    expect(screen.getAllByText("LUMEN_KB_TOKEN")).toHaveLength(1)
    expect(screen.getByText("kb_token · tool search_kb")).toBeTruthy()
    expect(screen.getByText("tools/search_kb.yaml")).toBeTruthy()
    expect(screen.getByText("Authorization · MCP server helpdesk")).toBeTruthy()
    expect(screen.getAllByText("NOT SET")).toHaveLength(unresolvedProviders.length + liveSecrets.filter((secret) => !secret.set).length)
  })

  it("reports the chat agent sign-in", async () => {
    await renderRoute("/settings?section=agents")
    expect(await screen.findByText("SIGNED IN")).toBeTruthy()
    expect(screen.getByText(liveChatStatus.detail ?? "")).toBeTruthy()
  })

  it("saves the project chat backend and refreshes its sign-in status", async () => {
    const writes: unknown[] = []
    let selected = false
    server.use(
      http.put(`${API_BASE}/chat/backend`, async ({ request }) => {
        writes.push(await request.json())
        selected = true
        return HttpResponse.json({ backend: "codex" })
      }),
      http.get(`${API_BASE}/chat/status`, () => HttpResponse.json(selected
        ? { backend: "codex", state: "logged_out", method: null, account: null, detail: "Sign in with codex login" }
        : liveChatStatus)),
    )
    await renderRoute("/settings?section=agents")
    const codex = within(await screen.findByRole("radiogroup", { name: "Chat backend" })).getByRole("radio", { name: "Codex" })
    await waitFor(() => { expect(codex.hasAttribute("disabled")).toBe(false) })
    fireEvent.click(codex)
    await waitFor(() => { expect(writes).toEqual([{ backend: "codex" }]) })
    expect(await screen.findByText("Sign in with codex login")).toBeTruthy()
  })

  it("connects external agents through aqven mcp and upgrades through the package manager", async () => {
    await renderRoute("/settings?section=mcp")
    expect(await screen.findByText(liveProject.mcp_url ?? "")).toBeTruthy()
    expect(screen.getByText("claude mcp add --scope project aqven -- uv run aqven mcp")).toBeTruthy()
    await renderRoute("/settings?section=updates")
    expect(await screen.findByText("uv lock --upgrade-package aqven && uv sync")).toBeTruthy()
  })
})
