import type { ExitCondition, ExitKind, ExitSummary } from "@/domain"
import type { TagFill, Tone } from "@/components/studio"
import { joinMeta, score, usd } from "@/lib/format"
import type { Translator } from "@/i18n/translator"

type ConditionOf<K extends ExitKind> = Extract<ExitCondition, { kind: K }>

type ExitSpec<K extends ExitKind> = {
  readonly firedTone: Tone
  readonly label: (condition: ConditionOf<K>, t: Translator) => string
}

type ExitSpecs = { readonly [K in ExitKind]: ExitSpec<K> }

export type ExitChip = {
  readonly key: ExitKind
  readonly label: string
  readonly tone: Tone
  readonly fill: TagFill
  readonly fired: boolean
}

const SPENT_DIGITS = 3
const LIMIT_DIGITS = 2

export const EXIT_CONDITION: ExitSpecs = {
  iterations: {
    firedTone: "warning",
    label: (condition, t) => t("domain.exit.iterations", { used: condition.used, max: condition.max }),
  },
  budget: {
    firedTone: "warning",
    label: (condition, t) => t("domain.exit.budget", { spent: usd(condition.spentUsd, SPENT_DIGITS), limit: usd(condition.limitUsd, LIMIT_DIGITS) }),
  },
  stagnation: {
    firedTone: "loop",
    label: (condition, t) => t("domain.exit.stagnation", { delta: score(condition.delta), epsilon: score(condition.epsilon) }),
  },
  threshold: {
    firedTone: "success",
    label: (condition, t) =>
      condition.afterFix
        ? t("domain.exit.thresholdAfterFix", { score: score(condition.score), target: score(condition.target) })
        : t("domain.exit.threshold", { score: score(condition.score), target: score(condition.target) }),
  },
  repeatedCandidate: {
    firedTone: "warning",
    label: (_condition, t) => t("domain.exit.repeatedCandidate"),
  },
}

const specOf = <K extends ExitKind>(condition: ConditionOf<K>): ExitSpec<K> => EXIT_CONDITION[condition.kind]

const chipOf = <K extends ExitKind>(condition: ConditionOf<K>, t: Translator): ExitChip => {
  const spec = specOf(condition)
  const label = spec.label(condition, t)
  return {
    key: condition.kind,
    label: condition.fired ? joinMeta([label, t("domain.exit.fired")]) : label,
    tone: condition.fired ? spec.firedTone : "neutral",
    fill: condition.fired ? "soft" : "outline",
    fired: condition.fired,
  }
}

export const exitChips = (exit: ExitSummary, t: Translator): readonly ExitChip[] => exit.conditions.map((condition) => chipOf(condition, t))
