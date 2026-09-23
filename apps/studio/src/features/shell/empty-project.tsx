import { useTranslations } from "use-intl"
import { Empty } from "@/components/studio"
import { HandoffButton } from "@/features/chat-handoff"

const WRITE_FLOW_PROMPT = [
  "Help me write a new flow for this project.",
  "First ask me what the flow should take in, what it should return and which steps it needs.",
  "Then create flows/<flow_id>/flow.yaml with its nodes, prompts and types, run aqven check and report the result in this chat.",
].join("\n")

const writeFlowPrompt = (): string => WRITE_FLOW_PROMPT

export function EmptyProject() {
  const t = useTranslations("shell.empty")
  return (
    <div className="grid h-full min-h-0 place-items-center bg-background p-6">
      <div className="flex w-full max-w-xl flex-col items-start gap-3">
        <Empty title={t("title")} hint={t("hint")} />
        <HandoffButton label={t("ask")} prompt={writeFlowPrompt} variant="default" />
      </div>
    </div>
  )
}
