import { useTranslations } from "use-intl"
import type { ExperimentDetail, ExperimentFactor } from "@/domain"
import { Matrix, Surface, Text, type MatrixField } from "@/components/studio"
import { ExperimentFacts } from "./experiment-facts"
import { HypothesisCard } from "./hypothesis-card"
import { RowRoleTag } from "./role-tag"
import { stepName, variantTable, type AgentModel, type VariantRow, type VariantValue } from "./variant-table"

const NODE_JOIN = ", "

function FactorCaption({ factor }: { readonly factor: ExperimentFactor | null }) {
  const t = useTranslations("research.experiment.what.factor")
  if (factor === null) return null
  return (
    <Text as="p" role="hint" tone="neutral" className="wrap-anywhere">
      {t(factor.what, { nodes: factor.nodes.map(stepName).join(NODE_JOIN) })}
    </Text>
  )
}

function ValueCell({ value }: { readonly value: VariantValue }) {
  const t = useTranslations("research.experiment.what")
  if (value.kind === "written") return <Text role="cell" tone="neutral">{t("asWritten")}</Text>
  if (value.kind === "same") return <Text role="cell" tone="default" className="wrap-anywhere">{value.value}</Text>
  return (
    <ul className="flex min-w-0 flex-col gap-0.5">
      {value.values.map((item) => (
        <li key={item.node}>
          <Text role="cell" tone="default" className="wrap-anywhere">
            {t("nodeValue", { node: stepName(item.node), value: item.value })}
          </Text>
        </li>
      ))}
    </ul>
  )
}

function AgentsCell({ agents }: { readonly agents: readonly AgentModel[] }) {
  const t = useTranslations("research.experiment.what")
  if (agents.length === 0) return <Text role="cell" tone="neutral">{t("noModel")}</Text>
  return (
    <ul className="flex min-w-0 flex-col gap-0.5">
      {agents.map((item) => (
        <li key={item.agent} className="flex min-w-0 flex-wrap items-baseline gap-x-1.5">
          <Text role="cell" tone="default">{item.agent}</Text>
          <Text role="meta" tone="neutral" title={item.model.full} className="wrap-anywhere">{item.model.short}</Text>
        </li>
      ))}
    </ul>
  )
}

function useFields(factor: ExperimentFactor | null): readonly MatrixField<VariantRow>[] {
  const what = useTranslations("research.experiment.what")
  const value: readonly MatrixField<VariantRow>[] =
    factor === null ? [] : [{ id: "value", label: what(`column.value.${factor.what}`), track: "minmax(0,2.2fr)", render: (row) => <ValueCell value={row.value} /> }]
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
    ...value,
    { id: "models", label: what("column.models"), track: "minmax(0,1.4fr)", render: (row) => <AgentsCell agents={row.agents} /> },
  ]
}

function VariantsTable({ experiment }: { readonly experiment: ExperimentDetail }) {
  const t = useTranslations("research.experiment.what")
  const table = variantTable(experiment)
  const fields = useFields(table.factor)
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <FactorCaption factor={table.factor} />
      <Surface variant="panel" className="overflow-hidden">
        <Matrix orientation="rows" rules="rows" label={t("tableAria")} items={table.rows} itemKey={(row) => row.id} fields={fields} />
      </Surface>
    </div>
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
