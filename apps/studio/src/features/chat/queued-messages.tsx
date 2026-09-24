import { useTranslations } from "use-intl"
import { Surface, Text } from "@/components/studio"
import type { QueuedMessage } from "./chat-events"
import { UserLines } from "./prose-text"

function QueuedBubble({ message }: { readonly message: QueuedMessage }) {
  const t = useTranslations("chat.queued")
  return (
    <li className="flex flex-col items-end gap-1" data-delivery={message.delivery}>
      <Surface variant="bubble" className="max-w-[calc(84%+1.5rem)] px-3 py-2 opacity-70">
        <UserLines text={message.text} />
      </Surface>
      <Text role="hint" tone="neutral" as="p">
        {t(message.delivery)}
      </Text>
    </li>
  )
}

export function QueuedMessages({ queued }: { readonly queued: readonly QueuedMessage[] }) {
  const t = useTranslations("chat.queued")
  if (queued.length === 0) return null
  return (
    <ul aria-label={t("aria")} className="flex flex-col gap-4">
      {queued.map((message) => (
        <QueuedBubble key={message.id} message={message} />
      ))}
    </ul>
  )
}
