import { Play } from "lucide-react"
import { useTranslations } from "use-intl"
import type { TestDetail } from "@/domain"
import { Actions, Heading, Stat, Surface, Text, Toolbar } from "@/components/studio"
import { promptSourceNote, scopeLine, summaryMetrics, targetTag } from "./summary"

function SummaryActions({ rows }: { readonly rows: number }) {
  const t = useTranslations("testDetail.summary")
  const common = useTranslations("common.actions")
  return (
    <Actions
      actions={[
        { id: "upload", label: common("uploadSpreadsheet") },
        { id: "extend", label: t("extendWithAgent") },
        { id: "run", label: t("runRows", { count: rows }), variant: "default", icon: Play, filledIcon: true },
      ]}
    />
  )
}

export function SummaryPanel({ detail }: { readonly detail: TestDetail }) {
  const t = useTranslations("testDetail")
  const note = (
    <Text role="caption" tone="warning" className="max-w-[430px]">
      {promptSourceNote(detail.promptSource, t)}
    </Text>
  )
  return (
    <Surface variant="panel" padding="md" className="mb-3.5">
      <Heading
        size="block"
        wrap
        titleAs="h1"
        title={t("summary.title")}
        tags={[targetTag(detail.target)]}
        description={
          <Text role="prose" tone="neutral">
            {scopeLine(detail, t)}
          </Text>
        }
        trailing={<SummaryActions rows={detail.summary.rows} />}
      />
      <Toolbar wrap end={note} className="mt-2.75 gap-5.5">
        {summaryMetrics(detail.summary, t).map((metric) => (
          <Stat key={metric.id} variant="stacked" label={metric.label} value={metric.value} />
        ))}
      </Toolbar>
    </Surface>
  )
}
