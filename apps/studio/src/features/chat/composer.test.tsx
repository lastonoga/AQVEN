import {
  AssistantRuntimeProvider,
  useExternalStoreRuntime,
  useLocalRuntime,
  type AppendMessage,
  type ChatModelAdapter,
  type DictationAdapter,
  type ExternalThreadQueueAdapter,
  type ThreadMessageLike,
} from "@assistant-ui/react"
import { act, fireEvent, render, screen } from "@testing-library/react"
import { IntlProvider } from "use-intl"
import { describe, expect, it } from "vitest"
import { TooltipProvider } from "@/components/ui/tooltip"
import { messages } from "@/i18n/messages"
import { noop } from "@/lib/noop"
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

type RunningCalls = { readonly steered: string[]; readonly enqueued: string[]; readonly cancels: string[] }

const textOf = (message: AppendMessage): string => message.content.flatMap((part) => (part.type === "text" ? [part.text] : [])).join("")

const keep = (message: ThreadMessageLike): ThreadMessageLike => message

function RunningComposerHarness({ calls }: { readonly calls: RunningCalls }) {
  const queue: ExternalThreadQueueAdapter = {
    items: [],
    steerItems: [],
    enqueue: (message) => calls.enqueued.push(textOf(message)),
    steer: (message) => calls.steered.push(textOf(message)),
    move: noop,
    edit: noop,
    remove: noop,
  }
  const runtime = useExternalStoreRuntime<ThreadMessageLike>({
    messages: [],
    isRunning: true,
    convertMessage: keep,
    queue,
    onNew: () => Promise.resolve(),
    onCancel: () => {
      calls.cancels.push("stop")
      return Promise.resolve()
    },
  })
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

const button = (name: string): HTMLButtonElement => screen.getByRole<HTMLButtonElement>("button", { name })

describe("Composer while the agent runs", () => {
  it("keeps the text box and Send usable with Stop beside it", () => {
    const calls: RunningCalls = { steered: [], enqueued: [], cancels: [] }
    render(<RunningComposerHarness calls={calls} />)
    expect(button("Stop").disabled).toBe(false)
    expect(button("Send").disabled).toBe(true)
    expect(input().disabled).toBe(false)

    fireEvent.change(input(), { target: { value: "also run the tests" } })
    expect(button("Send").disabled).toBe(false)
  })

  it("sends what Enter submits into the running turn", async () => {
    const calls: RunningCalls = { steered: [], enqueued: [], cancels: [] }
    render(<RunningComposerHarness calls={calls} />)
    fireEvent.change(input(), { target: { value: "also run the tests" } })
    await act(async () => {
      fireEvent.keyDown(input(), { key: "Enter" })
      await Promise.resolve()
    })
    expect(calls.steered).toEqual(["also run the tests"])
    expect(calls.enqueued).toEqual([])
    expect(input().value).toBe("")
  })

  it("stops the turn from the button next to Send", async () => {
    const calls: RunningCalls = { steered: [], enqueued: [], cancels: [] }
    render(<RunningComposerHarness calls={calls} />)
    await act(async () => {
      fireEvent.click(button("Stop"))
      await Promise.resolve()
    })
    expect(calls.cancels).toEqual(["stop"])
  })
})
