import { describe, expect, it } from "vitest"
import { importThread } from "./history"
import { designedThread } from "./test-support"

describe("importThread", () => {
  const thread = designedThread()
  const imported = importThread(thread)

  it("keeps every message, role and content of the served thread", () => {
    expect(imported.map((message) => message.role)).toEqual(thread.map((message) => message.role))
    expect(imported.map((message) => message.content)).toEqual(thread.map((message) => message.content))
  })

  it("imports a remote running message as paused on its tool calls so the local composer stays usable", () => {
    expect(imported.map((message) => message.status?.type)).toEqual([
      undefined,
      "complete",
      undefined,
      "complete",
      "complete",
      undefined,
      "requires-action",
    ])
  })
})
