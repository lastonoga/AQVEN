import { WebSpeechDictationAdapter, type DictationAdapter } from "@assistant-ui/react"

export const browserDictation = (): DictationAdapter | undefined =>
  WebSpeechDictationAdapter.isSupported() ? new WebSpeechDictationAdapter({ continuous: true, interimResults: true }) : undefined
