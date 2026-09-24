import { Play } from "lucide-react"
import { useTranslations } from "use-intl"
import { Surface, Text, type TextTone } from "@/components/studio"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import type { Translator } from "@/i18n/translator"
import { blockerNames, blockersOf, blockerText } from "./range-preview"
import { StageSpanPicker } from "./stage-span-picker"
import type { LookRange } from "./use-look-range"

export type LaunchState = { readonly kind: "idle" } | { readonly kind: "starting" } | { readonly kind: "failed"; readonly message: string }

export type SelectionBarProps = {
  readonly count: number
  readonly flowScoped: boolean
  readonly look: LookRange
  readonly launch: LaunchState
  readonly onRun: () => void
  readonly onClear: () => void
}

type LookStatus = { readonly tone: TextTone; readonly text: string }

const lookStatus = (look: LookRange, t: Translator<"cases.look">): LookStatus => {
  if (look.stages === null) return { tone: "neutral", text: t("whole") }
  if (look.result === null) return { tone: "neutral", text: t("checking") }
  if (look.result.error !== null) return { tone: "destructive", text: t("failed", { reason: look.result.error }) }
  if (look.current?.available === true) return { tone: "neutral", text: t("only") }
  return { tone: "warning", text: t("unavailable") }
}

function BarStages({ flowScoped, look }: Pick<SelectionBarProps, "flowScoped" | "look">) {
  const selection = useTranslations("cases.selection")
  const statusCopy = useTranslations("cases.look")
  const stageRange = useTranslations("common.stageRange")
  if (!flowScoped) return <Text role="hint" tone="neutral">{selection("flowOnly")}</Text>
  if (look.order.length === 0) return <Text role="hint" tone="neutral">{stageRange("noStages")}</Text>
  const status = lookStatus(look, statusCopy)
  return (
    <>
      <StageSpanPicker order={look.order} span={look.span} onChange={look.setSpan} />
      <Text role="hint" tone={status.tone}>
        {status.text}
      </Text>
    </>
  )
}

function BlockedLine({ look }: { readonly look: LookRange }) {
  const t = useTranslations("cases.look")
  if (look.stages === null || look.current === null || look.current.available) return null
  const blockers = blockersOf(look.current.missing)
  if (blockers.length === 0) return null
  return (
    <Text as="p" role="hint" tone="warning" title={blockerText(blockers)}>
      {t("blocked", { count: blockers.length, cases: blockerNames(blockers) })}
    </Text>
  )
}

function LaunchFailure({ launch }: { readonly launch: LaunchState }) {
  const t = useTranslations("cases.selection")
  if (launch.kind !== "failed") return null
  return (
    <Text role="hint" tone="destructive" asChild>
      <p role="alert">{t("failed", { reason: launch.message })}</p>
    </Text>
  )
}

export function SelectionBar({ count, flowScoped, look, launch, onRun, onClear }: SelectionBarProps) {
  const t = useTranslations("cases.selection")
  const starting = launch.kind === "starting"
  return (
    <div role="region" aria-label={t("aria")} className="sticky bottom-3 z-20 mt-3">
      <Surface variant="popover" padding="sm" className="flex min-w-0 flex-col gap-1.5">
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
          <Text role="meta" tone="default" weight="semibold">
            {t("count", { count })}
          </Text>
          <Button type="button" size="xs" variant="ghost" onClick={onClear}>
            {t("clear")}
          </Button>
          <BarStages flowScoped={flowScoped} look={look} />
          <Button type="button" size="sm" className="ml-auto" disabled={!look.ready || starting} aria-busy={starting} onClick={onRun}>
            {starting ? <Spinner aria-hidden="true" /> : <Play aria-hidden />}
            {t("run", { count })}
          </Button>
        </div>
        <BlockedLine look={look} />
        <LaunchFailure launch={launch} />
      </Surface>
    </div>
  )
}
