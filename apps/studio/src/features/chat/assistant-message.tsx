import { AuiIf, MessagePrimitive, type AssistantState } from "@assistant-ui/react"
import { ActionBar } from "./action-bar"
import { PROSE_PARTS } from "./prose-text"

const isSettled = (state: AssistantState): boolean => state.message.status?.type === "complete"

export function AssistantMessage() {
  return (
    <MessagePrimitive.Root className="flex flex-col gap-2">
      <MessagePrimitive.Parts components={PROSE_PARTS} />
      <AuiIf condition={isSettled}>
        <ActionBar />
      </AuiIf>
    </MessagePrimitive.Root>
  )
}
