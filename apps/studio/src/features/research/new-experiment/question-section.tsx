import { useId, type ReactNode } from "react"
import { useTranslations } from "use-intl"
import { isBuiltinMetric, QUESTION_KINDS, THRESHOLD_BOUNDS, type QuestionKind } from "@/domain"
import { ChoiceGroup, Text, type ChoiceItem } from "@/components/studio"
import { Input } from "@/components/ui/input"
import { ResearchSection } from "../layout"
import { Field, Panel, Problems } from "./form-field"
import type { QuestionDraft } from "./form-state"
import { visibleAt, type FormView } from "./view"

const EACH_VARIANT = ""

type PartProps = { readonly view: FormView }

const edit = (view: FormView, patch: Partial<QuestionDraft>): void => {
  view.dispatch({ type: "editQuestion", patch })
}

function useMetricItems(view: FormView): readonly ChoiceItem<string>[] {
  const names = useTranslations("research.vocabulary.builtinMetric")
  const checks = view.form.checks.map((check) => check.id)
  return [...checks, ...view.options.metrics].map((metric) => ({
    value: metric,
    disabled: view.disabled,
    label: <span title={isBuiltinMetric(metric) ? names(metric) : undefined}>{metric}</span>,
  }))
}

const variantItems = (view: FormView): readonly ChoiceItem<string>[] =>
  view.form.variants.map((variant) => ({ value: variant.id, label: variant.id, disabled: view.disabled }))

function MetricField({ view, value, onPick }: PartProps & { readonly value: string; readonly onPick: (metric: string) => void }) {
  const t = useTranslations("research.newExperiment.question")
  return (
    <Field label={t("metric")} hint={t("metricHint")}>
      <ChoiceGroup appearance="chip" size="sm" label={t("metric")} items={useMetricItems(view)} value={value} onValueChange={onPick} className="flex-wrap overflow-visible" />
    </Field>
  )
}

function NumberField({ view, label, hint, value, onType }: PartProps & { readonly label: string; readonly hint: string; readonly value: string; readonly onType: (text: string) => void }) {
  const id = useId()
  return (
    <Field id={id} label={label} hint={hint}>
      <Input
        id={id}
        inputMode="decimal"
        value={value}
        disabled={view.disabled}
        className="w-32 font-mono"
        onChange={(event) => {
          onType(event.target.value)
        }}
      />
    </Field>
  )
}

function VariantPick({ view, label, value, onPick }: PartProps & { readonly label: string; readonly value: string; readonly onPick: (variant: string) => void }) {
  return (
    <Field label={label}>
      <ChoiceGroup appearance="chip" size="sm" label={label} items={variantItems(view)} value={value} onValueChange={onPick} className="flex-wrap overflow-visible" />
    </Field>
  )
}

function PairParts({ view }: PartProps) {
  const t = useTranslations("research.newExperiment.question")
  const { question } = view.form
  return (
    <>
      <VariantPick view={view} label={t("baseline")} value={question.baseline} onPick={(baseline) => { edit(view, { baseline }) }} />
      <VariantPick view={view} label={t("candidate")} value={question.candidate} onPick={(candidate) => { edit(view, { candidate }) }} />
      <MetricField view={view} value={question.primary} onPick={(primary) => { edit(view, { primary }) }} />
      <NumberField view={view} label={t("margin")} hint={t(`marginHint.${question.kind}`)} value={question.margin} onType={(margin) => { edit(view, { margin }) }} />
    </>
  )
}

function ThresholdParts({ view }: PartProps) {
  const t = useTranslations("research.newExperiment.question")
  const { question } = view.form
  return (
    <>
      <MetricField view={view} value={question.metric} onPick={(metric) => { edit(view, { metric }) }} />
      <Field label={t("bound")}>
        <ChoiceGroup
          appearance="segmented"
          size="sm"
          label={t("bound")}
          items={THRESHOLD_BOUNDS.map((bound) => ({ value: bound, label: t(`bounds.${bound}`), disabled: view.disabled }))}
          value={question.bound}
          onValueChange={(bound) => { edit(view, { bound }) }}
          className="self-start"
        />
      </Field>
      <NumberField view={view} label={t("value")} hint={t("valueHint")} value={question.value} onType={(value) => { edit(view, { value }) }} />
      <NumberField view={view} label={t("margin")} hint={t("marginHint.threshold")} value={question.margin} onType={(margin) => { edit(view, { margin }) }} />
      <Field label={t("which")}>
        <ChoiceGroup
          appearance="chip"
          size="sm"
          label={t("which")}
          items={[{ value: EACH_VARIANT, label: t("eachVariant"), disabled: view.disabled }, ...variantItems(view)]}
          value={question.variant}
          onValueChange={(variant) => { edit(view, { variant }) }}
          className="flex-wrap overflow-visible"
        />
      </Field>
    </>
  )
}

const offeredKinds = (view: FormView): readonly QuestionKind[] => (view.options.questionKinds.length === 0 ? QUESTION_KINDS : view.options.questionKinds)

const PARTS: Readonly<Record<QuestionKind, (props: PartProps) => ReactNode>> = {
  look: () => null,
  threshold: ThresholdParts,
  compare: PairParts,
  noninferior: PairParts,
}

function useSentence(question: QuestionDraft): string {
  const t = useTranslations("research.question")
  const blank = "…"
  const or = (text: string): string => (text.length === 0 ? blank : text)
  const sentences: Readonly<Record<QuestionKind, () => string>> = {
    look: () => t("look"),
    threshold: () => {
      const values = { metric: or(question.metric), bound: question.bound, value: or(question.value), margin: or(question.margin) }
      return question.variant.length === 0 ? t("thresholdAll", values) : t("threshold", { ...values, variant: question.variant })
    },
    compare: () => t("compare", { candidate: or(question.candidate), baseline: or(question.baseline), metric: or(question.primary), margin: or(question.margin) }),
    noninferior: () => t("noninferior", { candidate: or(question.candidate), baseline: or(question.baseline), metric: or(question.primary), margin: or(question.margin) }),
  }
  return sentences[question.kind]()
}

export function QuestionSection({ view }: { readonly view: FormView }) {
  const t = useTranslations("research.newExperiment.question")
  const kinds = useTranslations("research.vocabulary.question")
  const { question } = view.form
  const Parts = PARTS[question.kind]
  const sentence = useSentence(question)
  return (
    <ResearchSection title={t("title")} description={t("description")}>
      <Panel>
        <Field label={t("kind")} hint={t(`kindHint.${question.kind}`)}>
          <ChoiceGroup
            appearance="segmented"
            label={t("kind")}
            items={offeredKinds(view).map((kind) => ({ value: kind, label: kinds(kind), disabled: view.disabled }))}
            value={question.kind}
            onValueChange={(kind) => { edit(view, { kind }) }}
            className="self-start"
          />
        </Field>
        <Parts view={view} />
        <Text as="p" role="prose" tone="default" aria-live="polite" className="wrap-anywhere">
          {sentence}
        </Text>
        <Problems problems={visibleAt(view, "question")} />
      </Panel>
    </ResearchSection>
  )
}
