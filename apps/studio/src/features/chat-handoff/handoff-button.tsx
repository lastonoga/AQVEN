import type { ComponentProps } from "react"
import { Sparkles } from "lucide-react"
import { useTranslations } from "use-intl"
import { Text } from "@/components/studio"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { useChatHandoff, type HandoffState } from "./use-chat-handoff"

type ButtonProps = ComponentProps<typeof Button>

export type HandoffButtonProps = {
  readonly label: string
  readonly prompt: () => string
  readonly variant?: ButtonProps["variant"]
  readonly size?: ButtonProps["size"]
  readonly disabled?: boolean
}

function HandoffStatus({ state }: { readonly state: HandoffState }) {
  const t = useTranslations("chat.handoff")
  if (state.kind === "sent") {
    return (
      <Text role="hint" tone="neutral" asChild>
        <span role="status">{t("sent")}</span>
      </Text>
    )
  }
  if (state.kind !== "failed") return null
  return (
    <Text role="hint" tone="destructive" asChild>
      <span role="alert">{t("failed", { reason: state.message })}</span>
    </Text>
  )
}

export function HandoffButton({ label, prompt, variant = "outline", size = "sm", disabled = false }: HandoffButtonProps) {
  const { state, available, send } = useChatHandoff()
  const sending = state.kind === "sending"
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <Button
        type="button"
        variant={variant}
        size={size}
        disabled={disabled || !available || sending}
        aria-busy={sending}
        onClick={() => {
          send(prompt())
        }}
      >
        {sending ? <Spinner aria-hidden="true" /> : <Sparkles aria-hidden />}
        {label}
      </Button>
      <HandoffStatus state={state} />
    </div>
  )
}
