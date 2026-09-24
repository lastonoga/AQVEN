import { useEffect, useState } from "react"
import { Check, Copy, Unplug } from "lucide-react"
import { useTranslations } from "use-intl"
import { Surface, Text } from "@/components/studio"
import { Button } from "@/components/ui/button"
import { noop } from "@/lib/noop"
import { useServerHealth } from "./context"
import { isDown } from "./monitor"
import { RETRY_SECONDS, startCommand } from "./presenters"

export type ServerDownBannerProps = { readonly fallbackRoot: string }

const COPIED_MS = 2_000

function CopyCommand({ command }: { readonly command: string }) {
  const t = useTranslations("health.banner")
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => {
      setCopied(false)
    }, COPIED_MS)
    return () => {
      clearTimeout(timer)
    }
  }, [copied])

  const copy = () => {
    void navigator.clipboard
      .writeText(command)
      .then(() => {
        setCopied(true)
      })
      .catch(noop)
  }
  return (
    <Button variant="ghost" size="icon-xs" aria-label={copied ? t("copied") : t("copyAria")} title={t("copyAria")} onClick={copy}>
      {copied ? <Check /> : <Copy />}
    </Button>
  )
}

export function ServerDownBanner({ fallbackRoot }: ServerDownBannerProps) {
  const t = useTranslations("health.banner")
  const { snapshot, checkNow } = useServerHealth()
  if (!isDown(snapshot)) return null
  const command = startCommand(snapshot.seen?.health.project_root ?? fallbackRoot)
  const check = () => {
    void checkNow()
  }
  return (
    <div className="shrink-0 px-2 pt-2">
      <Surface variant="callout" tone="destructive" role="alert" className="flex flex-wrap items-center gap-x-4 gap-y-2 px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <Unplug aria-hidden className="size-4 shrink-0" />
          <Text role="meta" weight="semibold" tone="inherit">
            {t("title")}
          </Text>
        </div>
        <div className="flex min-w-0 items-center gap-2">
          <Text role="hint" tone="inherit" className="shrink-0">
            {t("hint")}
          </Text>
          <Surface variant="well" className="flex min-w-0 items-center gap-1 py-0.5 pr-0.5 pl-2 text-foreground">
            <Text asChild role="command" tone="default" truncate>
              <code>{command}</code>
            </Text>
            <CopyCommand command={command} />
          </Surface>
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-2">
          <Text role="hint" tone="inherit">
            {t("retrying", { seconds: RETRY_SECONDS })}
          </Text>
          <Button variant="outline" size="xs" disabled={snapshot.checking} onClick={check}>
            {t("checkNow")}
          </Button>
        </div>
      </Surface>
    </div>
  )
}
