import { ArrowRight } from "lucide-react"
import { useTranslations } from "use-intl"
import type { RunHistory } from "@/domain"
import { Actions, Surface, Tag, Text, Toolbar } from "@/components/studio"
import { runChips, type RunChip } from "./summary"

function RunChipTag({ chip }: { readonly chip: RunChip }) {
  return (
    <Tag size="md" tone={chip.tone} fill={chip.fill}>
      {chip.label}
    </Tag>
  )
}

function RunActions({ revision }: { readonly revision: string }) {
  const t = useTranslations("testDetail.runs")
  return (
    <Actions
      actions={[
        { id: "compare", label: t("compare") },
        { id: "apply", label: t("apply", { revision }), variant: "default" },
      ]}
    />
  )
}

export function RunHistoryCard({ history }: { readonly history: RunHistory }) {
  const t = useTranslations("testDetail")
  const chips = runChips(history, t)
  return (
    <Surface variant="panel" asChild>
      <Toolbar size="card-sm" wrap end={<RunActions revision={history.current.revision} />} className="mt-4">
        <Text role="hint" weight="medium" tone="neutral">
          {t("runs.label")}
        </Text>
        <RunChipTag chip={chips.previous} />
        <Text role="hint" tone="neutral" className="inline-flex">
          <ArrowRight aria-hidden className="size-3.5" />
        </Text>
        <RunChipTag chip={chips.current} />
        <Text role="meta" tone="neutral">
          {history.changeSummary}
        </Text>
      </Toolbar>
    </Surface>
  )
}
