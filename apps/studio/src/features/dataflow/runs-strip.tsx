import { useTranslations } from "use-intl"
import type { RunId, RunSummary } from "@/domain"
import { ChoiceLink, ChoiceList, Dot, MetaLine, Tag, Text } from "@/components/studio"
import { useRelativeTime } from "@/i18n/format"
import { ROUTE_ID } from "@/lib/routes"
import { runChips, type RunChip } from "./run-chips"

export type RunsStripProps = { readonly runs: readonly RunSummary[]; readonly runId: RunId | null }

function LatestMark() {
  const t = useTranslations("dataflow.runs")
  return (
    <Tag size="micro" fill="outline" tone="llm">
      {t("latest")}
    </Tag>
  )
}

function StartedAt({ chip }: { readonly chip: RunChip }) {
  const relative = useRelativeTime("narrow")
  return (
    <Text role="caption" tone="neutral">
      {relative(chip.startedAt)}
    </Text>
  )
}

function ChipTrail({ chip }: { readonly chip: RunChip }) {
  if (chip.latest) return <LatestMark />
  return <StartedAt chip={chip} />
}

function RunChipLink({ chip }: { readonly chip: RunChip }) {
  const outcome = useTranslations("domain.outcome")
  return (
    <ChoiceLink from={ROUTE_ID.dataflow} to="." search={{ run: chip.id }} resetScroll={false} appearance="card" selected={chip.selected}>
      <Dot tone={chip.tone} />
      <Text role="cell" tone="default" weight="semibold">
        {chip.ref}
      </Text>
      <Text role="tiny" tone="neutral">
        <MetaLine parts={[outcome(chip.status), chip.ratio, chip.cost]} />
      </Text>
      <ChipTrail chip={chip} />
    </ChoiceLink>
  )
}

export function RunsStrip({ runs, runId }: RunsStripProps) {
  const t = useTranslations("dataflow.runs")
  if (runs.length === 0) return null
  return (
    <div className="mb-3 flex min-w-0 items-center gap-2">
      <Text role="hint" tone="neutral" weight="medium" className="shrink-0">
        {t("label")}
      </Text>
      <ChoiceList appearance="card" label={t("label")} className="min-w-0">
        {runChips(runs, runId).map((chip) => (
          <RunChipLink key={chip.id} chip={chip} />
        ))}
      </ChoiceList>
    </div>
  )
}
