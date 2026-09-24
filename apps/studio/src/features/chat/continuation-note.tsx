import { MessagePrimitive } from "@assistant-ui/react"
import { useTranslations } from "use-intl"
import { Text } from "@/components/studio"

export function ContinuationNote() {
  const t = useTranslations("chat.thread")
  return (
    <MessagePrimitive.Root className="flex justify-center">
      <Text role="hint" tone="neutral" asChild>
        <p data-slot="continuation-note">{t("continued")}</p>
      </Text>
    </MessagePrimitive.Root>
  )
}
