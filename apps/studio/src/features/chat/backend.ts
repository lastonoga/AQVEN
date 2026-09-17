import { WebSpeechDictationAdapter, type ChatModelAdapter, type ChatModelRunResult, type DictationAdapter } from "@assistant-ui/react"

export type ChatBackendCopy = { readonly fixtureReply: string }

export type ChatBackend = {
  readonly model: (copy: ChatBackendCopy) => ChatModelAdapter
  readonly dictation: () => DictationAdapter | undefined
}

const fixtureResult = (reply: string): ChatModelRunResult => ({
  content: [{ type: "text", text: reply }],
  status: { type: "complete", reason: "stop" },
})

export const browserDictation = (): DictationAdapter | undefined =>
  WebSpeechDictationAdapter.isSupported() ? new WebSpeechDictationAdapter({ continuous: true, interimResults: true }) : undefined

export const fixtureChatBackend: ChatBackend = {
  model: ({ fixtureReply }) => ({ run: () => Promise.resolve(fixtureResult(fixtureReply)) }),
  dictation: browserDictation,
}

export const chatBackend: ChatBackend = fixtureChatBackend
