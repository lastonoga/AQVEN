import { describe, expect, it, vi } from "vitest"
import { WebSpeechDictationAdapter, type ChatModelRunOptions } from "@assistant-ui/react"
import { messages } from "@/i18n/messages"
import { chatBackend, fixtureChatBackend } from "./backend"

const runOptions: ChatModelRunOptions = {
  messages: [],
  runConfig: {},
  abortSignal: new AbortController().signal,
  context: {},
  unstable_getMessage: () => {
    throw new Error("the fixture model never reads the message")
  },
}

describe("chat backend seam", () => {
  it("answers with the translated fixture reply until a real agent backend replaces it", async () => {
    const fixtureReply = messages.en.chat.fixtureReply
    expect(chatBackend).toBe(fixtureChatBackend)
    await expect(chatBackend.model({ fixtureReply }).run(runOptions)).resolves.toEqual({
      content: [{ type: "text", text: fixtureReply }],
      status: { type: "complete", reason: "stop" },
    })
  })

  it("offers browser dictation only where the Web Speech API exists", () => {
    expect(chatBackend.dictation()).toBeUndefined()
    vi.stubGlobal("webkitSpeechRecognition", vi.fn())
    expect(chatBackend.dictation()).toBeInstanceOf(WebSpeechDictationAdapter)
    vi.unstubAllGlobals()
  })
})
