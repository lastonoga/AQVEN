import { describe, expect, it } from "vitest"
import type { ApiProviderKey } from "@/domain"
import { liveProviders } from "@/mocks/data/project"
import { hasProviderKey, keySource, mcpCommands, neighboursOf, UPGRADE_COMMANDS } from "./presenters"

const resolved: ApiProviderKey = {
  provider: "openrouter",
  setting_key: "providers.openrouter.api_key",
  env_var: "OPENROUTER_API_KEY",
  declared: true,
  source: "environment",
  masked: "••••0860",
}

describe("setup presenters", () => {
  it("walks the steps in order", () => {
    expect(neighboursOf("agent")).toEqual({ previous: undefined, next: "providers" })
    expect(neighboursOf("providers")).toEqual({ previous: "agent", next: "workflow" })
    expect(neighboursOf("workflow")).toEqual({ previous: "providers", next: undefined })
  })

  it("reads the source the engine resolved the key from", () => {
    expect(keySource(resolved)).toBe("environment")
    expect(keySource({ ...resolved, source: "dotenv" })).toBe("dotenv")
    expect(keySource({ ...resolved, source: null, masked: null })).toBe("missing")
  })

  it("knows whether any model key resolves", () => {
    expect(hasProviderKey(liveProviders)).toBe(true)
    expect(hasProviderKey(liveProviders.map((key) => ({ ...key, source: null, masked: null })))).toBe(false)
    expect(hasProviderKey([])).toBe(false)
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

  it("upgrades the engine through the package manager of the project", () => {
    expect(UPGRADE_COMMANDS.uv).toBe("uv lock --upgrade-package aqven && uv sync")
    expect(UPGRADE_COMMANDS.pip).toBe("pip install --upgrade aqven")
  })
})
