import { useTranslations } from "use-intl"
import type { ExperimentDetail } from "@/domain"
import { Surface, Tag, Text, type Tone } from "@/components/studio"
import type { Translator } from "@/i18n/translator"
import { useQuestionCopy } from "./copy"
import { decisionRules, hypothesisText, type DecisionRule } from "./presenters"

const RULE_TONE: Readonly<Record<DecisionRule["kind"], Tone>> = {
  look: "neutral",
  primary: "primary",
  threshold: "primary",
  guardrail: "neutral",
}

const ruleText = (rule: DecisionRule, t: Translator<"research.experiment.what.rule">): string => {
  if (rule.kind === "look") return t("look")
  if (rule.kind === "threshold") return t("threshold", { metric: rule.metric, op: rule.op, value: rule.value, margin: rule.margin })
  return t(rule.kind, { metric: rule.metric, op: rule.op, bound: rule.bound })
}

export function HypothesisCard({ experiment }: { readonly experiment: ExperimentDetail }) {
  const t = useTranslations("research.experiment.what")
  const rule = useTranslations("research.experiment.what.rule")
  const question = useQuestionCopy()
  const label = experiment.question.kind === "look" ? t("goal") : t("hypothesis")
  const statement = hypothesisText(experiment, question)
  const rules = decisionRules(experiment.question, experiment.metrics, question.builtin).map((item) => ({ tone: RULE_TONE[item.kind], text: ruleText(item, rule) }))
  return (
    <Surface variant="panel" padding="lg" role="region" aria-label={label} className="flex min-w-0 flex-col gap-3">
      <Text role="label" tone="neutral">
        {label}
      </Text>
      <Text as="p" role="page" tone="default" weight="medium" title={statement} className="line-clamp-2">
        {statement}
      </Text>
      <ul aria-label={t("rule.aria")} className="flex min-w-0 flex-wrap gap-1.5">
        {rules.map((item) => (
          <li key={item.text} className="min-w-0">
            <Tag size="md" tone={item.tone}>
              {item.text}
            </Tag>
          </li>
        ))}
      </ul>
    </Surface>
  )
}
