import { AuiIf, MessagePrimitive, type AssistantState } from "@assistant-ui/react"
import { ActionBar } from "./action-bar"
import { ProseText } from "./prose-text"
import { ThinkingBlock } from "./thinking-block"
import { ToolCard } from "./tool-card"

const isSettled = (state: AssistantState): boolean => state.message.status?.type === "complete"

const ASSISTANT_PARTS = { Text: ProseText, Reasoning: ThinkingBlock, tools: { Fallback: ToolCard } } as const

export function AssistantMessage() {
  return (
    <MessagePrimitive.Root className="flex flex-col gap-2">
      <MessagePrimitive.Parts components={ASSISTANT_PARTS} />
      <AuiIf condition={isSettled}>
        <ActionBar />
      </AuiIf>
    </MessagePrimitive.Root>
  )
}
