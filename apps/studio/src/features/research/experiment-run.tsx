import { Link } from "@tanstack/react-router"
import { ArrowUpRight } from "lucide-react"
import { useTranslations } from "use-intl"
import type { ArmStep, CaseSelection, ExperimentArm, ExperimentDetail, FlowId } from "@/domain"
import { Matrix, NODE_KIND, Tag, Text, TitledPanel, type MatrixField } from "@/components/studio"
import { ROUTE_PATH } from "@/lib/routes"
import { useSubjectDetailCopy } from "./copy"
import { FactList, ResearchSection } from "./layout"
import { assignmentRows, subjectText, tagPairs, type AssignmentRow } from "./presenters"
import { ROLE_TONE } from "./tones"

type NumberedStep = ArmStep & { readonly index: number }

const STEPS_MIN_WIDTH = 720
const VARIANTS_MIN_WIDTH = 720

function Mono({ children, tone = "default" }: { readonly children: string; readonly tone?: "default" | "neutral" }) {
  return (
    <Text as="div" role="cell" tone={tone} truncate title={children}>
      {children}
    </Text>
  )
}

function useStepFields(): readonly MatrixField<NumberedStep>[] {
  const t = useTranslations("research.experiment.run")
  return [
    { id: "step", label: t("column.step"), track: "32px", render: (step) => <Mono tone="neutral">{String(step.index)}</Mono> },
    { id: "node", label: t("column.node"), track: "minmax(120px,0.8fr)", render: (step) => <Mono>{step.node}</Mono> },
    {
      id: "kind",
      label: t("column.kind"),
      track: "72px",
      render: (step) => (
        <Tag size="micro" fill="tint" tone={NODE_KIND[step.kind].tone}>
          {NODE_KIND[step.kind].code}
        </Tag>
      ),
    },
    { id: "agent", label: t("column.agent"), track: "minmax(96px,0.6fr)", render: (step) => <Mono tone={step.agent === null ? "neutral" : "default"}>{step.agent?.id ?? t("noAgent")}</Mono> },
    { id: "model", label: t("column.model"), track: "minmax(160px,1fr)", render: (step) => <Mono tone="neutral">{step.agent?.model ?? "—"}</Mono> },
    {
      id: "description",
      label: t("column.description"),
      track: "minmax(200px,1.6fr)",
      render: (step) => (
        <Text as="div" role="hint" tone="neutral">
          {step.description}
        </Text>
      ),
    },
  ]
}

function ArmSteps({ arm }: { readonly arm: ExperimentArm }) {
  const t = useTranslations("research.experiment.run")
  const fields = useStepFields()
  return (
    <TitledPanel size="block" title={t("steps", { arm: arm.id })} below={[arm.description]} scroll>
      <Matrix
        orientation="rows"
        rules="rows"
        label={t("stepsAria", { arm: arm.id })}
        minWidth={STEPS_MIN_WIDTH}
        items={arm.steps.map((step, index) => ({ ...step, index: index + 1 }))}
        itemKey={(step) => step.node}
        fields={fields}
      />
    </TitledPanel>
  )
}

function useVariantFields(): readonly MatrixField<AssignmentRow>[] {
  const t = useTranslations("research")
  return [
    {
      id: "variant",
      label: t("experiment.run.column.variant"),
      track: "minmax(160px,1fr)",
      render: (row) =>
        row.first ? (
          <div className="flex min-w-0 items-center gap-2">
            <Text role="cell" tone="default" weight="semibold" truncate>
              {row.variant.id}
            </Text>
            <Tag size="micro" fill="tint" tone={ROLE_TONE[row.variant.role]}>
              {t(`vocabulary.role.${row.variant.role}`)}
            </Tag>
          </div>
        ) : null,
    },
    { id: "arm", label: t("experiment.run.column.arm"), track: "minmax(96px,0.6fr)", render: (row) => (row.first ? <Mono tone="neutral">{row.variant.arm ?? "—"}</Mono> : null) },
    { id: "node", label: t("experiment.run.column.node"), track: "minmax(140px,0.9fr)", render: (row) => <Mono>{row.assignment.node}</Mono> },
    {
      id: "agent",
      label: t("experiment.run.column.agent"),
      track: "minmax(140px,0.8fr)",
      render: (row) => (
        <div className="flex min-w-0 items-center gap-2">
          <Text role="cell" tone="default" weight="semibold" truncate>
            {row.assignment.agent.id}
          </Text>
          {row.assignment.overridden ? (
            <Tag size="micro" fill="tint" tone="llm">
              {t("experiment.run.overridden")}
            </Tag>
          ) : null}
        </div>
      ),
    },
    { id: "model", label: t("experiment.run.column.model"), track: "minmax(200px,1.4fr)", render: (row) => <Mono tone="neutral">{row.assignment.agent.model}</Mono> },
  ]
}

function VariantsTable({ experiment }: { readonly experiment: ExperimentDetail }) {
  const t = useTranslations("research.experiment.run")
  const fields = useVariantFields()
  return (
    <TitledPanel size="block" title={t("variants")} scroll>
      <Matrix
        orientation="rows"
        rules="rows"
        label={t("variantsAria")}
        minWidth={VARIANTS_MIN_WIDTH}
        items={assignmentRows(experiment.variants)}
        itemKey={(row) => row.key}
        fields={fields}
      />
    </TitledPanel>
  )
}

const casesFlow = (experiment: ExperimentDetail): FlowId | null => experiment.cases.flow ?? experiment.flow

function CasesLink({ flowId, cases }: { readonly flowId: FlowId | null; readonly cases: CaseSelection }) {
  const t = useTranslations("research.experiment.run")
  if (flowId === null) return null
  const pairs = tagPairs(cases.tags)
  return (
    <Text role="link" tone="neutral" asChild>
      <Link to={ROUTE_PATH.cases} params={{ flowId }} search={{ dataset: cases.dataset, ...(pairs.length === 0 ? {} : { tag: pairs }) }} className="inline-flex items-center gap-1">
        {t("openCases")}
        <ArrowUpRight aria-hidden className="size-3" />
      </Link>
    </Text>
  )
}

function CaseFacts({ experiment }: { readonly experiment: ExperimentDetail }) {
  const t = useTranslations("research.experiment.run")
  const { cases } = experiment
  const pairs = tagPairs(cases.tags)
  return (
    <>
      <Text role="cell" tone="default">
        {t("casesText", { dataset: cases.dataset, selected: cases.selected, total: cases.total })}
      </Text>
      {pairs.length === 0 ? (
        <Tag size="xs" tone="neutral" fill="outline">
          {t("allCases")}
        </Tag>
      ) : (
        pairs.map((pair) => (
          <Tag key={pair} size="xs" tone="neutral">
            {pair}
          </Tag>
        ))
      )}
      <CasesLink flowId={casesFlow(experiment)} cases={cases} />
    </>
  )
}

export function ExperimentRun({ experiment }: { readonly experiment: ExperimentDetail }) {
  const t = useTranslations("research")
  const subject = useSubjectDetailCopy()
  return (
    <ResearchSection title={t("experiment.run.title")}>
      <FactList
        facts={[
          {
            id: "subject",
            label: t("experiment.run.subject"),
            value: (
              <Text role="cell" tone="default">
                {subjectText(experiment.subject, subject)}
              </Text>
            ),
          },
          { id: "cases", label: t("experiment.run.cases"), value: <CaseFacts experiment={experiment} /> },
        ]}
      />
      {experiment.arms.map((arm) => (
        <ArmSteps key={arm.id} arm={arm} />
      ))}
      <VariantsTable experiment={experiment} />
    </ResearchSection>
  )
}
