import { describe, expect, it } from "vitest"
import type { ApiProviderKey, ApiSecret, ApiSetting } from "@/domain"
import { apiError } from "@/api/client"
import { liveProjectSettings, liveProviders, liveResearchBudget, liveSecrets } from "@/mocks/data/project"
import {
  capDraftOf,
  capText,
  dotenvKeys,
  hasProviderKey,
  isCapDraft,
  isShadowed,
  keyOrigin,
  LOGIN_COMMANDS,
  mcpCommands,
  neighboursOf,
  otherSecrets,
  saveFailureOf,
  UPGRADE_COMMAND,
} from "./presenters"

const resolved: ApiProviderKey = {
  provider: "openrouter",
  setting_key: "providers.openrouter.api_key",
  env_var: "OPENROUTER_API_KEY",
  declared: true,
  source: "environment",
  masked: "••••0860",
}

const rejection = (code: string) =>
  apiError(400, {
    ok: false,
    op: "setting_put",
    code: "REQUEST_INVALID",
    message: "secret for providers.openai.api_key contains a line break or NUL character",
    problems: [{ path: ["providers.openai.api_key"], code, message: "remove line breaks and NUL characters from the secret" }],
  })

describe("setup presenters", () => {
  it("walks the steps in order", () => {
    expect(neighboursOf("agent")).toEqual({ previous: undefined, next: "providers" })
    expect(neighboursOf("providers")).toEqual({ previous: "agent", next: "workflow" })
    expect(neighboursOf("workflow")).toEqual({ previous: "providers", next: undefined })
  })

  it("reads where the engine resolved the key from", () => {
    expect(keyOrigin(resolved)).toBe("environment")
    expect(keyOrigin({ ...resolved, source: "dotenv" })).toBe("dotenv")
    expect(keyOrigin({ ...resolved, source: null, masked: null })).toBe("missing")
  })

  it("knows whether any model key resolves", () => {
    expect(hasProviderKey(liveProviders)).toBe(true)
    expect(hasProviderKey(liveProviders.map((key) => ({ ...key, source: null, masked: null })))).toBe(false)
    expect(hasProviderKey([])).toBe(false)
  })

  it("flags a .env value the shell shadows", () => {
    const dotenv = dotenvKeys(liveProjectSettings)
    expect([...dotenv]).toEqual(["providers.openrouter.api_key"])
    expect(isShadowed(resolved, dotenv)).toBe(true)
    expect(isShadowed({ ...resolved, source: "dotenv" }, dotenv)).toBe(false)
    expect(isShadowed({ ...resolved, setting_key: "providers.openai.api_key" }, dotenv)).toBe(false)
  })

  it("keeps plain values out of the .env keys", () => {
    const value: ApiSetting = { scope: "project", key: "research.spend_cap_usd", kind: "value", value: 5, updated_at: "2026-09-18T06:08:51Z" }
    expect(dotenvKeys([value]).size).toBe(0)
  })

  it("groups the secrets of tools and MCP servers that are not model keys", () => {
    const rows = otherSecrets(liveSecrets, liveProviders)
    expect(rows.map((row) => row.env_var)).toEqual(["LUMEN_ORDERS_TOKEN", "LUMEN_KB_TOKEN", "LUMEN_HELPDESK_TOKEN"])
    expect(rows[0]?.users).toEqual([
      { scope: "tool", name: "issue_store_credit" },
      { scope: "tool", name: "lookup_order" },
    ])
    expect(rows[2]?.users).toEqual([{ scope: "mcp_server", name: "helpdesk" }])
  })

  it("has no other secrets when only providers declare them", () => {
    const providerSecrets: readonly ApiSecret[] = liveSecrets.filter((secret) => secret.scope === "provider")
    expect(otherSecrets(providerSecrets, liveProviders)).toEqual([])
    expect(otherSecrets([], liveProviders)).toEqual([])
  })

  it("names the engine rejection of a secret and passes other failures through", () => {
    expect(saveFailureOf(rejection("SECRET_VALUE_INVALID"))).toEqual({ kind: "rejected", code: "SECRET_VALUE_INVALID" })
    expect(saveFailureOf(rejection("missing"))).toEqual({
      kind: "failed",
      message: "secret for providers.openai.api_key contains a line break or NUL character",
    })
    expect(saveFailureOf(new TypeError("Failed to fetch"))).toEqual({ kind: "failed", message: "Failed to fetch" })
  })

  it("signs each chat backend in with its own command", () => {
    expect(LOGIN_COMMANDS).toEqual({ claude: "claude auth login", codex: "codex login" })
  })

  it("connects external agents through aqven mcp in the project environment", () => {
    const commands = mcpCommands("/Users/you/Projects/lumen")
    expect(commands.claudeCode).toBe("claude mcp add aqven -- uv run --directory /Users/you/Projects/lumen aqven mcp")
    expect(JSON.parse(commands.stdio)).toEqual({
      mcpServers: { aqven: { command: "uv", args: ["run", "--directory", "/Users/you/Projects/lumen", "aqven", "mcp"] } },
    })
  })

  it("quotes a project path the shell would otherwise split", () => {
    expect(mcpCommands("/Users/you/My Projects/lumen").claudeCode).toBe(
      "claude mcp add aqven -- uv run --directory '/Users/you/My Projects/lumen' aqven mcp",
    )
    expect(mcpCommands("/Users/you/it's/lumen").claudeCode).toBe(
      "claude mcp add aqven -- uv run --directory '/Users/you/it'\\''s/lumen' aqven mcp",
    )
  })

  it("upgrades the engine through uv in the project", () => {
    expect(UPGRADE_COMMAND).toBe("uv lock --upgrade-package aqven && uv sync")
  })

  it("accepts a cap only as plain dollars and cents", () => {
    expect(["0", "1", "2.50", " 0.005 "].map(isCapDraft)).toEqual([true, true, true, true])
    expect(["", "-1", "1e3", "lots", "1."].map(isCapDraft)).toEqual([false, false, false, false, false])
  })

  it("starts the cap editor at the aqven.yaml value, else at the default", () => {
    expect(capDraftOf(liveResearchBudget)).toBe("1.00")
    expect(capDraftOf({ ...liveResearchBudget, project_usd: null, source: "default" })).toBe("1.00")
    expect(capText("2.5")).toBe("$2.50")
  })
})
