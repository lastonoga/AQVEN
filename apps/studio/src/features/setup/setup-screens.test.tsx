import { fireEvent, screen, waitFor, within } from "@testing-library/react"
import { http, HttpResponse } from "msw"
import { describe, expect, it } from "vitest"
import type { ApiProviderKey } from "@/domain"
import { liveChatStatus } from "@/mocks/data/chat"
import { liveFlows, liveProject, liveProjectSettings, liveProviders, liveResearchBudget } from "@/mocks/data/project"
import { renderRoute } from "@/test/render-route"
import { API_BASE } from "@/api/client"
import { server } from "@/mocks/node"

const NEW_SECRET = "sk-test-0123456789abcd"

const hrefs = (container: HTMLElement): readonly (string | null)[] =>
  within(container)
    .getAllByRole("link")
    .map((link) => link.getAttribute("href"))

const withProvider = (provider: string, change: Partial<ApiProviderKey>): readonly ApiProviderKey[] =>
  liveProviders.map((entry) => (entry.provider === provider ? { ...entry, ...change } : entry))

const keyRow = async (name: string): Promise<HTMLElement> => screen.findByRole("group", { name })

const budgetSection = async (): Promise<HTMLElement> => {
  const section = (await screen.findByRole("heading", { name: "Research budget", level: 2 })).closest("section")
  if (section === null) throw new Error("the research budget heading is outside a section")
  await within(section).findByText("Project spend cap")
  return section
}

const STALE_FILE_BODY = {
  ok: false,
  op: "research_budget_put",
  code: "STALE_FILE",
  message: "aqven.yaml changed after it was read",
  problems: [],
  candidates: [],
  conflict: null,
  retry_after_ms: null,
}

const countReads = () => {
  const reads = { providers: 0, secrets: 0 }
  return {
    reads,
    count: (kind: keyof typeof reads) => {
      reads[kind] += 1
    },
  }
}

const typeSecret = async (row: HTMLElement, variable: string): Promise<void> => {
  fireEvent.click(within(row).getByRole("button", { name: "Add key" }))
  fireEvent.change(await within(row).findByLabelText(`New value for ${variable}`), { target: { value: NEW_SECRET } })
  fireEvent.click(within(row).getByRole("button", { name: "Save" }))
}

describe("Landing", () => {
  it("opens the graph of a flow of the launched project", async () => {
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
    expect(await screen.findByText(`Signed in to Claude Agent as ${liveChatStatus.account ?? ""}.`)).toBeTruthy()
    expect(screen.queryByRole("radiogroup", { name: "Chat backend" })).toBeNull()
  })

  it("offers a retry when the selected agent cannot be loaded during setup", async () => {
    server.use(http.get(`${API_BASE}/chat/backend`, () => HttpResponse.error()))
    await renderRoute("/setup")
    expect((await screen.findByRole("alert")).textContent).toContain("Could not load the selected agent")
    server.use(http.get(`${API_BASE}/chat/backend`, () => HttpResponse.json({ backend: "claude" })))
    fireEvent.click(screen.getByRole("button", { name: "Try again" }))
    expect(await screen.findByText(`Signed in to Claude Agent as ${liveChatStatus.account ?? ""}.`)).toBeTruthy()
  })

  it("lists every model key with the actions its source allows", async () => {
    await renderRoute("/setup?step=providers")
    const openrouter = await keyRow("openrouter")
    expect(within(openrouter).getByText("••••0860 · saved in .env · OPENROUTER_API_KEY")).toBeTruthy()
    expect(within(openrouter).getByText("declared by this project")).toBeTruthy()
    expect(within(openrouter).getAllByRole("button").map((button) => button.textContent)).toEqual(["Replace", "Remove"])
    const openai = await keyRow("openai")
    expect(within(openai).getByText("Not set · OPENAI_API_KEY")).toBeTruthy()
    expect(within(openai).getAllByRole("button").map((button) => button.textContent)).toEqual(["Add key"])
    expect(screen.queryByText("Other secrets")).toBeNull()
  })

  it("adds a key during setup with a masked input", async () => {
    const writes: unknown[] = []
    server.use(
      http.put(`${API_BASE}/settings/project/:key`, async ({ request }) => {
        writes.push(await request.json())
        return HttpResponse.json({ scope: "project", key: "providers.openai.api_key", kind: "secret", masked: "••••abcd", env_var: "OPENAI_API_KEY", updated_at: "2026-09-24T10:00:00Z" })
      }),
    )
    await renderRoute("/setup?step=providers")
    const openai = await keyRow("openai")
    fireEvent.click(within(openai).getByRole("button", { name: "Add key" }))
    const input = await within(openai).findByLabelText("New value for OPENAI_API_KEY")
    expect(input.getAttribute("type")).toBe("password")
    expect(input.getAttribute("autocomplete")).toBe("off")
    fireEvent.change(input, { target: { value: NEW_SECRET } })
    fireEvent.click(within(openai).getByRole("button", { name: "Save" }))
    await waitFor(() => {
      expect(writes).toEqual([{ kind: "secret", secret: NEW_SECRET }])
    })
  })

  it("keeps the warning away while the openrouter key of the project resolves", async () => {
    await renderRoute("/setup?step=providers")
    expect(await keyRow("openrouter")).toBeTruthy()
    expect(screen.queryByText("No model key is set yet. Add one so your workflows can call a model.")).toBeNull()
  })

  it("warns when no model key resolves", async () => {
    server.use(http.get(`${API_BASE}/settings/providers`, () => HttpResponse.json(liveProviders.map((entry) => ({ ...entry, source: null, masked: null })))))
    await renderRoute("/setup?step=providers")
    expect(await screen.findByText("No model key is set yet. Add one so your workflows can call a model.")).toBeTruthy()
  })

  it("links the workflows of the project into the canvas", async () => {
    await renderRoute("/setup?step=workflow")
    const list = await screen.findByRole("navigation", { name: "Workflows of the project" })
    expect(hrefs(list)).toEqual(liveFlows.map((flow) => `/flows/${flow.flow_id}/canvas`))
    expect(within(list).getByText("8 nodes")).toBeTruthy()
  })
})

describe("Settings", () => {
  it("shows one page of four sections under the project and engine version", async () => {
    await renderRoute("/settings")
    expect(await screen.findByRole("heading", { name: "Settings", level: 1 })).toBeTruthy()
    expect(screen.getByText(`${liveProject.package ?? ""} · AQVEN ${liveProject.engine_version}`)).toBeTruthy()
    expect(await screen.findByRole("heading", { name: "Model keys", level: 2 })).toBeTruthy()
    expect(screen.getAllByRole("heading", { level: 2 }).map((heading) => heading.textContent)).toEqual([
      "Model keys",
      "Other secrets",
      "Your coding agent",
      "Studio chat",
      "Research budget",
      "About",
    ])
    expect(screen.queryByRole("navigation", { name: "Settings sections" })).toBeNull()
  })

  it("keeps project internals off the page", async () => {
    await renderRoute("/settings")
    expect(await screen.findByText(liveProject.root)).toBeTruthy()
    expect(screen.queryByText("Tree hash")).toBeNull()
    expect(screen.queryByText("Index and checks")).toBeNull()
    expect(screen.queryByRole("navigation", { name: "Workflows of the project" })).toBeNull()
    expect(screen.queryByText("aqven studio")).toBeNull()
    expect(screen.queryByText("pip install --upgrade aqven")).toBeNull()
    expect(screen.queryByText(liveProject.mcp_url ?? "")).toBeNull()
  })

  it("adds a key with PUT and reads the keys again", async () => {
    const writes: { readonly key: string; readonly body: unknown }[] = []
    const { reads, count } = countReads()
    server.use(
      http.put(`${API_BASE}/settings/project/:key`, async ({ params, request }) => {
        writes.push({ key: String(params["key"]), body: await request.json() })
        return HttpResponse.json({ scope: "project", key: "providers.openai.api_key", kind: "secret", masked: "••••abcd", env_var: "OPENAI_API_KEY", updated_at: "2026-09-24T10:00:00Z" })
      }),
      http.get(`${API_BASE}/settings/providers`, () => {
        count("providers")
        return HttpResponse.json(writes.length === 0 ? liveProviders : withProvider("openai", { source: "dotenv", masked: "••••abcd" }))
      }),
      http.get(`${API_BASE}/settings/secrets`, () => {
        count("secrets")
        return HttpResponse.json([])
      }),
    )
    await renderRoute("/settings")
    const openai = await keyRow("openai")
    expect(reads).toEqual({ providers: 1, secrets: 1 })
    await typeSecret(openai, "OPENAI_API_KEY")
    expect(await within(openai).findByText("••••abcd · saved in .env · OPENAI_API_KEY")).toBeTruthy()
    expect(writes).toEqual([{ key: "providers.openai.api_key", body: { kind: "secret", secret: NEW_SECRET } }])
    expect(reads).toEqual({ providers: 2, secrets: 2 })
    expect(within(openai).queryByLabelText("New value for OPENAI_API_KEY")).toBeNull()
    expect(screen.queryByText(NEW_SECRET)).toBeNull()
  })

  it("replaces a key saved in .env", async () => {
    const writes: string[] = []
    server.use(
      http.put(`${API_BASE}/settings/project/:key`, ({ params }) => {
        writes.push(String(params["key"]))
        return HttpResponse.json({ scope: "project", key: "providers.openrouter.api_key", kind: "secret", masked: "••••abcd", env_var: "OPENROUTER_API_KEY", updated_at: "2026-09-24T10:00:00Z" })
      }),
    )
    await renderRoute("/settings")
    const openrouter = await keyRow("openrouter")
    fireEvent.click(within(openrouter).getByRole("button", { name: "Replace" }))
    fireEvent.change(await within(openrouter).findByLabelText("New value for OPENROUTER_API_KEY"), { target: { value: NEW_SECRET } })
    fireEvent.click(within(openrouter).getByRole("button", { name: "Save" }))
    await waitFor(() => {
      expect(writes).toEqual(["providers.openrouter.api_key"])
    })
  })

  it("cancels an edit without writing", async () => {
    await renderRoute("/settings")
    const openai = await keyRow("openai")
    fireEvent.click(within(openai).getByRole("button", { name: "Add key" }))
    expect(await within(openai).findByLabelText("New value for OPENAI_API_KEY")).toBeTruthy()
    expect((within(openai).getByRole("button", { name: "Save" })).hasAttribute("disabled")).toBe(true)
    fireEvent.click(within(openai).getByRole("button", { name: "Cancel" }))
    expect(within(openai).queryByLabelText("New value for OPENAI_API_KEY")).toBeNull()
    expect(within(openai).getByRole("button", { name: "Add key" })).toBeTruthy()
  })

  it("removes a key with DELETE and reads the keys again", async () => {
    const deletes: string[] = []
    const { reads, count } = countReads()
    server.use(
      http.delete(`${API_BASE}/settings/project/:key`, ({ params }) => {
        deletes.push(String(params["key"]))
        return HttpResponse.json({ scope: "project", key: String(params["key"]), deleted: true })
      }),
      http.get(`${API_BASE}/settings/providers`, () => {
        count("providers")
        return HttpResponse.json(deletes.length === 0 ? liveProviders : withProvider("openrouter", { source: null, masked: null }))
      }),
      http.get(`${API_BASE}/settings/secrets`, () => {
        count("secrets")
        return HttpResponse.json([])
      }),
    )
    await renderRoute("/settings")
    const openrouter = await keyRow("openrouter")
    fireEvent.click(within(openrouter).getByRole("button", { name: "Remove" }))
    expect(await within(openrouter).findByText("Not set · OPENROUTER_API_KEY")).toBeTruthy()
    expect(deletes).toEqual(["providers.openrouter.api_key"])
    expect(reads).toEqual({ providers: 2, secrets: 2 })
  })

  it("shows the engine rejection of a key inline and keeps the input", async () => {
    server.use(
      http.put(`${API_BASE}/settings/project/:key`, () =>
        HttpResponse.json(
          {
            ok: false,
            op: "setting_put",
            code: "REQUEST_INVALID",
            message: "secret for providers.openai.api_key contains a line break or NUL character; fix: remove line breaks and NUL characters from the secret",
            problems: [{ path: ["providers.openai.api_key"], code: "SECRET_VALUE_INVALID", message: "remove line breaks and NUL characters from the secret" }],
            candidates: [],
            conflict: null,
            retry_after_ms: null,
          },
          { status: 400 },
        )),
    )
    await renderRoute("/settings")
    const openai = await keyRow("openai")
    await typeSecret(openai, "OPENAI_API_KEY")
    expect((await within(openai).findByRole("alert")).textContent).toBe("The key has a line break in it. Paste it again as one line.")
    expect(within(openai).getByLabelText("New value for OPENAI_API_KEY")).toBeTruthy()
    expect(screen.queryByText(NEW_SECRET)).toBeNull()
  })

  it("reads a key from the shell without edit actions and says when it shadows .env", async () => {
    server.use(http.get(`${API_BASE}/settings/providers`, () => HttpResponse.json(withProvider("openrouter", { source: "environment", masked: "••••9999" }))))
    await renderRoute("/settings")
    const openrouter = await keyRow("openrouter")
    expect(within(openrouter).getByText("••••9999 · from your shell · OPENROUTER_API_KEY")).toBeTruthy()
    expect(within(openrouter).getByText("OPENROUTER_API_KEY is set in the shell that started Studio. Change it there.")).toBeTruthy()
    expect(within(openrouter).getByText("The value saved in .env is not used while the shell sets OPENROUTER_API_KEY.")).toBeTruthy()
    expect(within(openrouter).queryAllByRole("button")).toEqual([])
  })

  it("does not mention .env for a shell key that has no .env value", async () => {
    server.use(
      http.get(`${API_BASE}/settings/providers`, () => HttpResponse.json(withProvider("openrouter", { source: "environment", masked: "••••9999" }))),
      http.get(`${API_BASE}/settings/project`, () => HttpResponse.json(liveProjectSettings.filter((setting) => setting.key !== "providers.openrouter.api_key"))),
    )
    await renderRoute("/settings")
    const openrouter = await keyRow("openrouter")
    expect(within(openrouter).getByText("OPENROUTER_API_KEY is set in the shell that started Studio. Change it there.")).toBeTruthy()
    expect(within(openrouter).queryByText("The value saved in .env is not used while the shell sets OPENROUTER_API_KEY.")).toBeNull()
  })

  it("lists the secrets of tools and MCP servers once each with who uses them", async () => {
    await renderRoute("/settings")
    expect(await screen.findByRole("heading", { name: "Other secrets" })).toBeTruthy()
    const orders = await keyRow("LUMEN_ORDERS_TOKEN")
    expect(within(orders).getByText("Used by tool issue_store_credit, tool lookup_order")).toBeTruthy()
    expect(within(orders).getByText("Not set")).toBeTruthy()
    expect(within(orders).getByRole("button", { name: "Add key" })).toBeTruthy()
    expect(within(await keyRow("LUMEN_HELPDESK_TOKEN")).getByText("Used by MCP server helpdesk")).toBeTruthy()
    expect(screen.queryByRole("group", { name: "TOGETHER_API_KEY" })).toBeNull()
  })

  it("hides other secrets when the project declares none", async () => {
    server.use(http.get(`${API_BASE}/settings/secrets`, () => HttpResponse.json([])))
    await renderRoute("/settings")
    expect(await keyRow("openrouter")).toBeTruthy()
    expect(screen.queryByRole("heading", { name: "Other secrets" })).toBeNull()
  })

  it("connects Claude Code with one command and keeps other clients folded", async () => {
    await renderRoute("/settings")
    expect(await screen.findByText(`claude mcp add aqven -- uv run --directory ${liveProject.root} aqven mcp`)).toBeTruthy()
    expect(screen.queryByText(/"mcpServers"/)).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "Cursor, Claude Desktop and other clients" }))
    expect(await screen.findByText(/"mcpServers"/)).toBeTruthy()
  })

  it("reports the chat sign-in without the technical detail", async () => {
    await renderRoute("/settings")
    expect(await screen.findByText(`Signed in to Claude Agent as ${liveChatStatus.account ?? ""}.`)).toBeTruthy()
    expect(screen.queryByText(liveChatStatus.detail ?? "")).toBeNull()
  })

  it("gives the login command of the chat backend that is not signed in", async () => {
    server.use(
      http.get(`${API_BASE}/chat/status`, () =>
        HttpResponse.json({ backend: "claude", state: "logged_out", method: null, account: null, detail: "Sign in inside Claude Code: run `claude` in a terminal and use /login." })),
    )
    await renderRoute("/settings")
    expect(await screen.findByText("Not signed in to Claude Agent. Run this in a terminal, then check again:")).toBeTruthy()
    expect(screen.getByText("claude auth login")).toBeTruthy()
  })

  it("shows the technical detail when the sign-in is unknown", async () => {
    server.use(
      http.get(`${API_BASE}/chat/status`, () =>
        HttpResponse.json({ backend: "claude", state: "unknown", method: null, account: null, detail: "Claude Code CLI at /usr/local/bin/claude cannot be started" })),
    )
    await renderRoute("/settings")
    expect(await screen.findByText("Could not tell whether Claude Agent is signed in.")).toBeTruthy()
    expect(screen.getByText("Claude Code CLI at /usr/local/bin/claude cannot be started")).toBeTruthy()
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
        ? { backend: "codex", state: "logged_out", method: null, account: null, detail: "Run codex login in a terminal to sign in." }
        : liveChatStatus)),
    )
    await renderRoute("/settings")
    const codex = within(await screen.findByRole("radiogroup", { name: "Chat backend" })).getByRole("radio", { name: "Codex" })
    await waitFor(() => { expect(codex.hasAttribute("disabled")).toBe(false) })
    fireEvent.click(codex)
    await waitFor(() => { expect(writes).toEqual([{ backend: "codex" }]) })
    expect(await screen.findByText("Not signed in to Codex. Run this in a terminal, then check again:")).toBeTruthy()
    expect(screen.getByText("codex login")).toBeTruthy()
  })

  it("shows the research cap from aqven.yaml and saves a new one into it", async () => {
    const writes: unknown[] = []
    server.use(
      http.put(`${API_BASE}/project/research`, async ({ request }) => {
        writes.push(await request.json())
        return HttpResponse.json({ ...liveResearchBudget, spend_cap_usd: "2.50", project_usd: "2.50" })
      }),
    )
    await renderRoute("/settings")
    const section = await budgetSection()
    expect(within(section).getByText("$1.00")).toBeTruthy()
    expect(within(section).getByText("aqven.yaml")).toBeTruthy()
    expect(within(section).queryByRole("button", { name: "Remove override" })).toBeNull()
    fireEvent.change(within(section).getByLabelText("Project spend cap in dollars"), { target: { value: "2.50" } })
    fireEvent.click(within(section).getByRole("button", { name: "Save" }))
    expect(await within(section).findByText("$2.50")).toBeTruthy()
    expect(writes).toEqual([{ research: { spend_cap_usd: "2.50" }, file_hash: liveResearchBudget.project_file?.file_hash }])
  })

  it("keeps Save off for a cap that is not a dollar amount", async () => {
    await renderRoute("/settings")
    const section = await budgetSection()
    fireEvent.change(within(section).getByLabelText("Project spend cap in dollars"), { target: { value: "" } })
    expect(within(section).getByRole("button", { name: "Save" }).hasAttribute("disabled")).toBe(true)
  })

  it("names a local override and removes it with DELETE", async () => {
    const deletes: string[] = []
    const overridden = { ...liveResearchBudget, spend_cap_usd: "5", source: "override" }
    server.use(
      http.get(`${API_BASE}/project/research`, () => HttpResponse.json(deletes.length === 0 ? overridden : liveResearchBudget)),
      http.delete(`${API_BASE}/settings/project/:key`, ({ params }) => {
        deletes.push(String(params["key"]))
        return HttpResponse.json({ scope: "project", key: String(params["key"]), deleted: true })
      }),
    )
    await renderRoute("/settings")
    const section = await budgetSection()
    expect(within(section).getByText("$5.00")).toBeTruthy()
    expect(within(section).getByText("a local override on this computer")).toBeTruthy()
    expect(within(section).getByText("A local override on this computer replaces the aqven.yaml cap ($1.00).")).toBeTruthy()
    fireEvent.click(within(section).getByRole("button", { name: "Remove override" }))
    expect(await within(section).findByText("aqven.yaml")).toBeTruthy()
    expect(deletes).toEqual(["research.spend_cap_usd"])
    expect(within(section).queryByRole("button", { name: "Remove override" })).toBeNull()
  })

  it("reports a broken local override instead of a cap", async () => {
    const problem = "project setting research.spend_cap_usd must be a decimal number of dollars of at least 0, got 'lots'"
    server.use(
      http.get(`${API_BASE}/project/research`, () =>
        HttpResponse.json({ ...liveResearchBudget, spend_cap_usd: null, source: "override", override_problem: problem })),
    )
    await renderRoute("/settings")
    const section = await budgetSection()
    expect(within(section).getByText("The local override is not a dollar amount")).toBeTruthy()
    expect(within(section).getByText(problem)).toBeTruthy()
    expect(within(section).getByRole("button", { name: "Remove override" })).toBeTruthy()
  })

  it("shows a refused save inline and keeps the typed cap", async () => {
    server.use(http.put(`${API_BASE}/project/research`, () => HttpResponse.json(STALE_FILE_BODY, { status: 412 })))
    await renderRoute("/settings")
    const section = await budgetSection()
    const input = within(section).getByLabelText("Project spend cap in dollars")
    fireEvent.change(input, { target: { value: "3" } })
    fireEvent.click(within(section).getByRole("button", { name: "Save" }))
    expect((await within(section).findByRole("alert")).textContent).toBe("The change was not saved. aqven.yaml changed after it was read")
    expect(within(section).getByLabelText<HTMLInputElement>("Project spend cap in dollars").value).toBe("3")
  })

  it("names the folder, the engine version and the uv update", async () => {
    await renderRoute("/settings")
    expect(await screen.findByText(liveProject.root)).toBeTruthy()
    expect(screen.getByText("AQVEN version")).toBeTruthy()
    expect(screen.getByText("uv lock --upgrade-package aqven && uv sync")).toBeTruthy()
    expect(screen.getByText("Run this in the project folder, then restart Studio.")).toBeTruthy()
  })
})
