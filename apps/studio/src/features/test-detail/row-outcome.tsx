import type { ReactNode } from "react"
import { useTranslations } from "use-intl"
import type { RowId, RowOutcome, Verdict } from "@/domain"
import { Actions, Surface, Text, Toolbar } from "@/components/studio"
import { useRichTags, type RichTags } from "@/i18n/format"
import { rowRef, SEPARATOR, usd } from "@/lib/format"
import type { Translator } from "@/i18n/translator"

export type RowOutcomeCardProps = { readonly rowId: RowId; readonly outcome: RowOutcome }

type VerdictLine = (outcome: RowOutcome, t: Translator<"testDetail">, tags: RichTags) => ReactNode

const VERDICT_LINE: Readonly<Record<Verdict, VerdictLine>> = {
  fail: (outcome, t, tags) =>
    t.rich("outcome.assertionFailed", { assertion: outcome.failedAssertion, branch: outcome.branch, code: tags.code }),
  pass: (_outcome, t) => t("outcome.allPassed"),
}

function OutcomeActions() {
  const t = useTranslations("testDetail.outcome")
  return (
    <Actions
      actions={[
        { id: "sandbox", label: t("openInSandbox") },
        { id: "rerun", label: t("rerunRow"), variant: "default" },
      ]}
    />
  )
}

export function RowOutcomeCard({ rowId, outcome }: RowOutcomeCardProps) {
  const t = useTranslations("testDetail")
  const verdict = useTranslations("domain.verdict")
  const tags = useRichTags()
  return (
    <Surface variant="panel" asChild>
      <Toolbar size="card" wrap end={<OutcomeActions />}>
        <Text role="prose" weight="semibold" tone="default">
          {t("outcome.title", { row: rowRef(rowId), verdict: verdict(outcome.verdict) })}
        </Text>
        <Text role="meta" tone="neutral">
          {VERDICT_LINE[outcome.verdict](outcome, t, tags)}
          {SEPARATOR}
          {t("outcome.rowTotal", { cost: usd(outcome.totalCostUsd), calls: outcome.calls })}
        </Text>
      </Toolbar>
    </Surface>
  )
}
