import { describe, expect, it } from "vitest"
import { firstRunOverview, setupOverview } from "@/mocks/data/setup"
import { agentFix, chosenAgent, effortFor, hasProviderKey, mcpCommands, neighboursOf, parseLimit, updateAvailable } from "./presenters"

const readyProbe = setupOverview.agents[0]?.probe
const signedOutProbe = firstRunOverview.agents[0]?.probe
const claudeModels = setupOverview.agents[0]?.profile.models ?? []

describe("setup presenters", () => {
  it("offers the command that unblocks an agent", () => {
    expect(readyProbe && agentFix(readyProbe)).toBeNull()
    expect(signedOutProbe && agentFix(signedOutProbe)).toEqual({ kind: "signIn", command: "claude" })
  })

  it("keeps a ready preferred agent and falls back to the first agent", () => {
    expect(chosenAgent("claude", setupOverview.agents)).toBe("claude")
    expect(chosenAgent("codex", setupOverview.agents)).toBe("claude")
    expect(chosenAgent("claude", firstRunOverview.agents)).toBe("claude")
    expect(chosenAgent(null, [])).toBeNull()
  })

  it("walks the steps in order", () => {
    expect(neighboursOf("agent")).toEqual({ previous: undefined, next: "providers" })
    expect(neighboursOf("workflow")).toEqual({ previous: "providers", next: undefined })
  })

  it("knows whether any model key resolves", () => {
    expect(hasProviderKey(setupOverview.providers)).toBe(true)
    expect(hasProviderKey(firstRunOverview.providers)).toBe(false)
  })

  it("connects external agents through aqven mcp in the project environment", () => {
    const commands = mcpCommands("/Users/you/Projects/hotel-pitch")
    expect(commands.claudeCode).toBe("claude mcp add --scope project aqven -- uv run aqven mcp")
    expect(JSON.parse(commands.cursor)).toEqual({
      mcpServers: { aqven: { command: "uv", args: ["run", "--directory", "/Users/you/Projects/hotel-pitch", "aqven", "mcp"] } },
    })
  })

  it("reports an update only when PyPI has a newer version", () => {
    expect(updateAvailable(setupOverview.release)).toBe(true)
    expect(updateAvailable({ ...setupOverview.release, latest: setupOverview.release.installed })).toBe(false)
  })

  it("keeps a supported effort and falls back to the model default", () => {
    const [sonnet, , haiku] = claudeModels
    expect(effortFor(sonnet, "max")).toBe("max")
    expect(effortFor(sonnet, "ultra")).toBe("medium")
    expect(effortFor(haiku, "high")).toBeNull()
    expect(effortFor(undefined, "high")).toBeNull()
  })

  it("reads an empty limit as no limit", () => {
    expect(parseLimit("")).toBeNull()
    expect(parseLimit("2.5")).toBe(2.5)
  })
})
