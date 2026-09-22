import { useTranslations } from "use-intl"
import { SectionStack, Text, TitledPanel, type SectionSpec, type TextLine } from "@/components/studio"
import type { Translator } from "@/i18n/translator"
import type { EvalSummary } from "./model"

export type EvalPanelProps = {
  readonly item: EvalSummary
  readonly className: string
}

type PanelCopy = { readonly t: Translator<"tests"> }

const scorerLines = (item: EvalSummary): readonly TextLine[] =>
  item.scorers.map((scorer): TextLine => [{ text: scorer, mark: "code" }])

const scorerBody = (item: EvalSummary, copy: PanelCopy): SectionSpec["body"] => {
  if (item.scorers.length === 0) return { kind: "text", lines: [[copy.t("scorers.empty")]], variant: "plain" }
  return { kind: "text", lines: scorerLines(item), variant: "plain" }
}

const declaredText = (declared: boolean, { t }: PanelCopy): string => (declared ? t("policy.declared") : t("policy.absent"))

const sections = (item: EvalSummary, copy: PanelCopy): readonly SectionSpec[] => [
  {
    id: "target",
    title: copy.t("target.title"),
    body: {
      kind: "properties",
      variant: "grid",
      rows: [
        { key: copy.t("target.inference"), value: item.inference },
        { key: copy.t("target.agent"), value: item.agent },
        { key: copy.t("target.dataset"), value: item.dataset },
      ],
    },
  },
  {
    id: "scorers",
    title: copy.t("scorers.title"),
    hint: copy.t("scorers.count", { count: item.scorers.length }),
    body: scorerBody(item, copy),
  },
  {
    id: "policy",
    title: copy.t("policy.title"),
    body: {
      kind: "properties",
      variant: "grid",
      rows: [
        { key: copy.t("policy.gate"), value: declaredText(item.has_gate, copy) },
        { key: copy.t("policy.optimization"), value: declaredText(item.has_optimization, copy) },
        { key: copy.t("policy.file"), value: { text: item.path, mono: true } },
      ],
    },
  },
]

export function EvalPanel({ item, className }: EvalPanelProps) {
  const t = useTranslations("tests")
  const copy: PanelCopy = { t }
  return (
    <TitledPanel
      size="section"
      className={className}
      title={item.eval_id}
      description={item.description}
      below={[
        <Text key="note" role="caption" tone="neutral">
          {t("scorers.note", { path: item.path })}
        </Text>,
      ]}
      surface="raised"
    >
      <div className="p-3.5">
        <SectionStack sections={sections(item, copy)} gap="lg" />
      </div>
    </TitledPanel>
  )
}
