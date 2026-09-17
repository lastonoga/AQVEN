import { MessagePrimitive } from "@assistant-ui/react"
import { Surface } from "@/components/studio"
import { USER_PARTS } from "./prose-text"

export function UserMessage() {
  return (
    <MessagePrimitive.Root className="flex justify-end">
      <Surface variant="bubble" className="max-w-[calc(84%+1.5rem)] px-3 py-2">
        <MessagePrimitive.Parts components={USER_PARTS} />
      </Surface>
    </MessagePrimitive.Root>
  )
}
