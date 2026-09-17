import { ActionBarPrimitive, useAuiState } from "@assistant-ui/react"
import { Check, Copy, Ellipsis, RotateCw } from "lucide-react"
import { useTranslations } from "use-intl"
import { Button } from "@/components/ui/button"
import { noop } from "@/lib/noop"
import { Hint } from "./hint"

const ICON = "size-3.75"

export function ActionBar() {
  const t = useTranslations("chat.message")
  const copied = useAuiState((state) => state.message.isCopied)
  const copyLabel = copied ? t("copied") : t("copyAria")
  return (
    <ActionBarPrimitive.Root hideWhenRunning autohide="never" className="-mt-0.5 flex gap-0.5">
      <Hint label={copyLabel}>
        <ActionBarPrimitive.Copy asChild>
          <Button variant="ghost" size="icon-xs" aria-label={copyLabel}>
            {copied ? <Check aria-hidden className={ICON} /> : <Copy aria-hidden className={ICON} />}
          </Button>
        </ActionBarPrimitive.Copy>
      </Hint>
      <Hint label={t("retryAria")}>
        <ActionBarPrimitive.Reload asChild>
          <Button variant="ghost" size="icon-xs" aria-label={t("retryAria")}>
            <RotateCw aria-hidden className={ICON} />
          </Button>
        </ActionBarPrimitive.Reload>
      </Hint>
      <Hint label={t("moreAria")}>
        <Button variant="ghost" size="icon-xs" aria-label={t("moreAria")} onClick={noop}>
          <Ellipsis aria-hidden className={ICON} />
        </Button>
      </Hint>
    </ActionBarPrimitive.Root>
  )
}
