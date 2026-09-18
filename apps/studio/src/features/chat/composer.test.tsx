import { AssistantRuntimeProvider, useLocalRuntime, type ChatModelAdapter, type DictationAdapter } from "@assistant-ui/react"
import { act, fireEvent, render, screen } from "@testing-library/react"
import { IntlProvider } from "use-intl"
import { describe, expect, it } from "vitest"
import { TooltipProvider } from "@/components/ui/tooltip"
import { messages } from "@/i18n/messages"
import { Composer } from "./composer"

type SpeechListener = (result: DictationAdapter.Result) => void

const fakeDictation = () => {
  const calls: string[] = []
  const listeners = new Set<SpeechListener>()
  const session: DictationAdapter.Session = {
    status: { type: "running" },
    stop: () => {
      calls.push("stop")
      return Promise.resolve()
    },
    cancel: () => {
      calls.push("cancel")
    },
    onSpeechStart: () => () => undefined,
    onSpeechEnd: () => () => undefined,
    onSpeech: (listener) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
  const adapter: DictationAdapter = {
    listen: () => {
      calls.push("listen")
      return session
    },
  }
  const say = (transcript: string, isFinal: boolean) => {
    act(() => {
      listeners.forEach((listener) => {
        listener({ transcript, isFinal })
      })
    })
  }
  return { adapter, calls, say }
}

const stubModel: ChatModelAdapter = {
  run: () => Promise.resolve({ content: [{ type: "text", text: "ok" }], status: { type: "complete", reason: "stop" } }),
}

function ComposerHarness({ dictation }: { readonly dictation: DictationAdapter | undefined }) {
  const runtime = useLocalRuntime(stubModel, { adapters: { dictation } })
  return (
    <IntlProvider locale="en" messages={messages.en} timeZone="UTC">
      <TooltipProvider>
        <AssistantRuntimeProvider runtime={runtime}>
          <Composer />
        </AssistantRuntimeProvider>
      </TooltipProvider>
    </IntlProvider>
  )
}

const input = (): HTMLTextAreaElement => screen.getByPlaceholderText<HTMLTextAreaElement>(messages.en.chat.composer.placeholder)

describe("Composer dictation", () => {
  it("hides the microphone when the browser has no speech recognition", () => {
    render(<ComposerHarness dictation={undefined} />)
    expect(screen.queryByRole("button", { name: "Dictate" })).toBeNull()
    expect(screen.getByRole("button", { name: "Add context" })).toBeTruthy()
  })

  it("records speech into the input and swaps the microphone for a stop button", async () => {
    const { adapter, calls, say } = fakeDictation()
    render(<ComposerHarness dictation={adapter} />)

    fireEvent.click(screen.getByRole("button", { name: "Dictate" }))
    expect(calls).toEqual(["listen"])
    expect(screen.queryByRole("button", { name: "Dictate" })).toBeNull()

    say("raise the output", false)
    expect(input().value).toBe("raise the output")

    say("raise the output limit", true)
    expect(input().value).toBe("raise the output limit")

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Stop dictation" }))
      await Promise.resolve()
    })
    expect(calls).toEqual(["listen", "stop"])
    expect(screen.getByRole("button", { name: "Dictate" })).toBeTruthy()
    expect(input().value).toBe("raise the output limit")
  })
})
