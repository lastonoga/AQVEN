import { useTranslations } from "use-intl"
import type { ApiExecutionAddress, RunStatus } from "@/domain"
import { Heading, Surface, Tag, Text, type Tone } from "@/components/studio"
import { Button } from "@/components/ui/button"
import { useErrorTitle, useStepLabel } from "./error-copy"
import { oneLine, type FailedStep } from "./failed-steps"

export type FailedStepsBannerProps = {
  readonly steps: readonly FailedStep[]
  readonly status: RunStatus
  readonly onOpen: (address: ApiExecutionAddress) => void
}

type BannerNote = "completed" | "failed" | "live"

type BannerLook = { readonly tone: Tone; readonly note: BannerNote | null }

const BANNER_LOOK: Readonly<Record<RunStatus, BannerLook>> = {
  queued: { tone: "warning", note: "live" },
  running: { tone: "warning", note: "live" },
  suspended: { tone: "warning", note: "live" },
  completed: { tone: "warning", note: "completed" },
  failed: { tone: "destructive", note: "failed" },
  cancelled: { tone: "warning", note: null },
}

type FailedStepRowProps = { readonly step: FailedStep; readonly onOpen: (address: ApiExecutionAddress) => void }

function FailedStepRow({ step, onOpen }: FailedStepRowProps) {
  const t = useTranslations("runs.failedSteps")
  const failure = useTranslations("runs.failure")
  const title = useErrorTitle()
  const label = useStepLabel()(step.address)
  const error = step.error
  const code = error?.code ?? null
  const hint = error?.hint ?? null
  return (
    <li>
      <Surface variant="raised" padding="sm" className="flex min-w-0 items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <Text as="h3" role="block" weight="semibold">{title(code, "step")}</Text>
            {code === null ? null : <Tag size="micro" tone="destructive" fill="tint">{code}</Tag>}
          </div>
          <Text as="p" role="cell" weight="medium" className="mt-1.5 break-all">{label}</Text>
          {error === null ? null : <Text as="p" role="hint" tone="default" className="mt-1 break-words">{oneLine(error.message)}</Text>}
          {hint === null ? null : <Text as="p" role="hint" tone="neutral" className="mt-1 break-words">{failure("hint", { hint })}</Text>}
        </div>
        <Button type="button" variant="outline" size="xs" aria-label={t("openAria", { step: label })} onClick={() => { onOpen(step.address) }}>
          {t("open")}
        </Button>
      </Surface>
    </li>
  )
}

export function FailedStepsBanner({ steps, status, onOpen }: FailedStepsBannerProps) {
  const t = useTranslations("runs.failedSteps")
  if (steps.length === 0) return null
  const look = BANNER_LOOK[status]
  return (
    <section aria-label={t("aria")} className="mb-3.5">
      <Surface variant="callout" tone={look.tone} padding="md">
        <Heading
          size="section"
          title={t("title")}
          description={t("count", { count: steps.length })}
          below={look.note === null ? [] : [t(`note.${look.note}`)]}
        />
        <ul className="mt-2.5 flex flex-col gap-2">
          {steps.map((step) => <FailedStepRow key={step.key} step={step} onOpen={onOpen} />)}
        </ul>
      </Surface>
    </section>
  )
}
