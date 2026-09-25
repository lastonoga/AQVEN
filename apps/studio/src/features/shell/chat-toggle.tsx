import { PanelLeftClose, PanelLeftOpen } from "lucide-react"
import { useTranslations } from "use-intl"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

export type ChatToggleProps = {
  readonly open: boolean
  readonly controls: string
  readonly onToggle: () => void
}

export function ChatToggle({ open, controls, onToggle }: ChatToggleProps) {
  const t = useTranslations("shell.chatToggle")
  const label = open ? t("hide") : t("show")
  const Icon = open ? PanelLeftClose : PanelLeftOpen
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button type="button" variant="ghost" size="icon-sm" className="shrink-0" aria-label={label} aria-expanded={open} aria-controls={controls} onClick={onToggle}>
          <Icon aria-hidden className="size-4" />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  )
}
