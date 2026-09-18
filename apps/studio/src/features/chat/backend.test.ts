import { describe, expect, it, vi } from "vitest"
import { WebSpeechDictationAdapter } from "@assistant-ui/react"
import { browserDictation } from "./backend"

describe("browserDictation", () => {
  it("offers dictation only where the Web Speech API exists", () => {
    expect(browserDictation()).toBeUndefined()
    vi.stubGlobal("webkitSpeechRecognition", vi.fn())
    expect(browserDictation()).toBeInstanceOf(WebSpeechDictationAdapter)
    vi.unstubAllGlobals()
  })
})
