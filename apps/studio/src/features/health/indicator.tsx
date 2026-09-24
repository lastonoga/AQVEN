import { useState } from "react"
import { useLocale, useTranslations } from "use-intl"
import { Dot, PropertyList, Text, type PropertyRow, type Tone } from "@/components/studio"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { relativeTime } from "@/i18n/format"
import { CheckList } from "./check-list"
import { useServerHealth } from "./context"
import { isDown, type HealthSnapshot, type SeenHealth } from "./monitor"
import { RETRY_SECONDS, summaryOf } from "./presenters"

type DetailsProps = { readonly snapshot: HealthSnapshot; readonly onNavigate: () => void }

function Note({ tone, text }: { readonly tone: Tone | "default"; readonly text: string }) {
  return (
    <Text as="p" role="hint" tone={tone}>
      {text}
    </Text>
  )
}

function Identity({ seen }: { readonly seen: SeenHealth | null }) {
  const t = useTranslations("health.details")
  const locale = useLocale()
  if (seen === null) return <Note tone="neutral" text={t("notSeen")} />
  const { health, at } = seen
  const rows: readonly PropertyRow[] = [
    { key: t("version"), value: health.version },
    { key: t("runningSince"), value: relativeTime(health.started_at, at, locale, "long") },
    { key: t("pid"), value: String(health.pid) },
    { key: t("root"), value: health.project_root },
  ]
  return (
    <div className="overflow-hidden rounded-md border border-border">
      <PropertyList rows={rows} />
    </div>
  )
}

function Checks({ snapshot, onNavigate }: DetailsProps) {
  const t = useTranslations("health.details")
  const phase = snapshot.seen?.health.status ?? "ready"
  if (isDown(snapshot)) return <Note tone="destructive" text={t("down", { seconds: RETRY_SECONDS })} />
  if (phase !== "ready") return <Note tone="warning" text={t(`phase.${phase}`)} />
  if (snapshot.status.kind === "pending") return <Note tone="neutral" text={t("pending")} />
  if (snapshot.status.kind === "failed") return <Note tone="warning" text={t("failed")} />
  return <CheckList checks={snapshot.status.status.checks} onNavigate={onNavigate} />
}

export function ServerIndicator() {
  const t = useTranslations("health")
  const { snapshot } = useServerHealth()
  const [open, setOpen] = useState(false)
  const summary = summaryOf(snapshot)
  const label = t(`indicator.${summary.label}`)
  const close = () => {
    setOpen(false)
  }
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="xs" aria-label={t("indicator.aria", { label })} aria-busy={snapshot.checking} data-tone={summary.tone}>
          <Dot tone={summary.tone} size="sm" pulse={summary.label === "checking"} />
          <Text role="hint" weight="medium" tone="default">
            {label}
          </Text>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96 gap-3 p-3">
        <Text as="h2" role="meta" weight="semibold" tone="default">
          {t("details.title")}
        </Text>
        <Identity seen={snapshot.seen} />
        <Checks snapshot={snapshot} onNavigate={close} />
      </PopoverContent>
    </Popover>
  )
}
