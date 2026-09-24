import { useTranslations } from "use-intl"
import type { ExperimentDetail } from "@/domain"
import { Matrix, Surface, Text, type MatrixField } from "@/components/studio"
import type { Translator } from "@/i18n/translator"
import { ExperimentFacts } from "./experiment-facts"
import { HypothesisCard } from "./hypothesis-card"
import { RowRoleTag } from "./role-tag"
import { stepName, variantTable, type ChangeColumn, type Named, type VariantChange, type VariantRow } from "./variant-table"

const STEP_CHAIN = " → "

const changeLabel = (column: ChangeColumn, t: Translator<"research.experiment.what">): string | null => {
  if (column.kind === "none") return null
  if (column.kind === "reference") return t("column.reference", { variant: column.variant })
  return t(`column.${column.kind}`)
}

function NamedLine({ named }: { readonly named: Named }) {
  return (
    <Text role="cell" tone="default" title={named.full} className="wrap-anywhere">
      {named.short}
    </Text>
  )
}

function ChangeCell({ change }: { readonly change: VariantChange }) {
  const t = useTranslations("research.experiment.what")
  if (change.kind === "reference") return <Text role="cell" tone="neutral">{t("reference")}</Text>
  if (change.kind === "steps") return <Text role="cell" tone="default" className="wrap-anywhere">{change.steps.map(stepName).join(STEP_CHAIN)}</Text>
  if (change.swaps.length === 0) return <Text role="cell" tone="neutral">{t("same")}</Text>
  return (
    <ul className="flex min-w-0 flex-col gap-0.5">
      {change.swaps.map((swap) => (
        <li key={swap.node}>
          <Text role="cell" tone="default" title={`${swap.from.full}${STEP_CHAIN}${swap.to.full}`} className="wrap-anywhere">
            {t("swap", { step: stepName(swap.node), from: swap.from.short, to: swap.to.short })}
          </Text>
        </li>
      ))}
    </ul>
  )
}

function ModelsCell({ models }: { readonly models: readonly Named[] }) {
  const t = useTranslations("research.experiment.what")
  if (models.length === 0) return <Text role="cell" tone="neutral">{t("noModel")}</Text>
  return (
    <ul className="flex min-w-0 flex-col gap-0.5">
      {models.map((model) => (
        <li key={model.full}>
          <NamedLine named={model} />
        </li>
      ))}
    </ul>
  )
}

function useFields(column: ChangeColumn): readonly MatrixField<VariantRow>[] {
  const what = useTranslations("research.experiment.what")
  const label = changeLabel(column, what)
  const change: readonly MatrixField<VariantRow>[] =
    label === null ? [] : [{ id: "change", label, track: "minmax(0,2.2fr)", render: (row) => <ChangeCell change={row.change} /> }]
  return [
    {
      id: "variant",
      label: what("column.variant"),
      track: "minmax(0,1fr)",
      render: (row) => (
        <Text role="cell" tone="default" weight="semibold" className="wrap-anywhere">
          {row.id}
        </Text>
      ),
    },
    {
      id: "role",
      label: what("column.role"),
      track: "96px",
      render: (row) => <RowRoleTag role={row.role} size="xs" />,
    },
    ...change,
    { id: "models", label: what("column.models"), track: "minmax(0,1.4fr)", render: (row) => <ModelsCell models={row.models} /> },
  ]
}

function VariantsTable({ experiment }: { readonly experiment: ExperimentDetail }) {
  const t = useTranslations("research.experiment.what")
  const table = variantTable(experiment)
  const fields = useFields(table.column)
  return (
    <Surface variant="panel" className="overflow-hidden">
      <Matrix orientation="rows" rules="rows" label={t("tableAria")} items={table.rows} itemKey={(row) => row.id} fields={fields} />
    </Surface>
  )
}

export function WhatWeTest({ experiment }: { readonly experiment: ExperimentDetail }) {
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <HypothesisCard experiment={experiment} />
      <VariantsTable experiment={experiment} />
      <ExperimentFacts experiment={experiment} />
    </div>
  )
}
