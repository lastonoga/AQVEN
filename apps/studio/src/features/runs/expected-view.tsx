import { useTranslations } from "use-intl"
import { Heading, Text, type Tone } from "@/components/studio"
import type { Translator } from "@/i18n/translator"
import { compareExpected, type ExpectedCase, type ExpectedComparison, type ExpectedRow, type ExpectedState } from "./expected"
import { FieldTable, FieldText, type FieldTableRow } from "./field-table"

type ExpectedLook = { readonly tone: Tone; readonly actualTone?: Tone }

const EXPECTED_LOOK: Readonly<Record<ExpectedState, ExpectedLook>> = {
  match: { tone: "success" },
  mismatch: { tone: "destructive", actualTone: "destructive" },
  missing: { tone: "warning", actualTone: "warning" },
  extra: { tone: "neutral" },
}

type ExpectedTranslate = Translator<"runs.expected">

const tableRow = (row: ExpectedRow, t: ExpectedTranslate): FieldTableRow => {
  const look = EXPECTED_LOOK[row.state]
  return {
    id: row.path,
    label: row.path.length === 0 ? t("root") : row.path,
    left: <FieldText value={row.expected} absent={t("absent")} />,
    right: <FieldText value={row.actual} absent={t("absent")} />,
    ...(look.actualTone === undefined ? {} : { rightTone: look.actualTone }),
    state: { label: t(`state.${row.state}`), tone: look.tone },
  }
}

const summaryOf = (comparison: ExpectedComparison, t: ExpectedTranslate): string =>
  comparison.matched === comparison.checked ? t("allMatch", { count: comparison.checked }) : t("summary", { matched: comparison.matched, checked: comparison.checked })

function Comparison({ expected, actual, source }: { readonly expected: unknown; readonly actual: unknown; readonly source: string }) {
  const t = useTranslations("runs.expected")
  const comparison = compareExpected(expected, actual)
  const allMatch = comparison.matched === comparison.checked
  return (
    <section aria-label={t("title")} className="border-t border-border p-2.5">
      <Heading
        size="cell"
        title={t("title")}
        tags={[{ children: summaryOf(comparison, t), tone: allMatch ? "success" : "destructive" }]}
        description={source}
      />
      <div className="mt-2 overflow-hidden rounded-lg border border-border">
        <FieldTable
          label={t("tableAria")}
          heads={{ label: t("field"), left: t("expected"), right: t("actual"), state: t("stateHead") }}
          rows={comparison.rows.map((row) => tableRow(row, t))}
        />
      </div>
      {comparison.extra === 0 ? null : <Text as="p" role="hint" tone="neutral" className="mt-1.5">{t("extra", { count: comparison.extra })}</Text>}
    </section>
  )
}

export function ExpectedVsActual({ expected, actual }: { readonly expected: ExpectedCase; readonly actual: unknown }) {
  const t = useTranslations("runs.expected")
  if (expected.kind === "none") return null
  if (expected.kind === "unavailable") {
    return <Text as="p" role="hint" tone="warning" className="border-t border-border p-2.5">{t("unavailable", { case: expected.item.caseName })}</Text>
  }
  return <Comparison expected={expected.expected} actual={actual} source={t("source", { case: expected.item.caseName, dataset: expected.item.datasetId })} />
}
