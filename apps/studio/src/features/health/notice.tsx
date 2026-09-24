import { useEffect } from "react"
import { useTranslations } from "use-intl"
import { Dot, Surface, Text, type Tone } from "@/components/studio"
import { useServerHealth } from "./context"
import type { ServerSignal } from "./monitor"

export const NOTICE_MS = 4_000

const NOTICE_TONE: Readonly<Record<ServerSignal, Tone>> = { reconnected: "success", restarted: "primary" }

export function ServerNoticeToast() {
  const t = useTranslations("health.notice")
  const { notice, dismissNotice } = useServerHealth()

  useEffect(() => {
    if (notice === null) return
    const timer = setTimeout(dismissNotice, NOTICE_MS)
    return () => {
      clearTimeout(timer)
    }
  }, [notice, dismissNotice])

  return (
    <div aria-live="polite" aria-atomic="true" className="pointer-events-none fixed right-4 bottom-4 z-50">
      {notice === null ? null : (
        <Surface variant="popover" className="flex items-center gap-2 px-3 py-2">
          <Dot tone={NOTICE_TONE[notice.signal]} size="sm" />
          <Text role="meta" weight="medium" tone="default">
            {t(notice.signal)}
          </Text>
        </Surface>
      )}
    </div>
  )
}
