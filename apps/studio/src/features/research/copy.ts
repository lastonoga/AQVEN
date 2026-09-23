import { useTranslations } from "use-intl"
import type { BuiltinNames } from "./metrics"
import type { QuestionCopy, ReasonCopy, SubjectCopy } from "./presenters"

export function useBuiltinNames(): BuiltinNames {
  const t = useTranslations("research.vocabulary.builtinMetric")
  return (metric) => t(metric)
}

export function useQuestionCopy(): QuestionCopy {
  const t = useTranslations("research.question")
  const builtin = useBuiltinNames()
  return {
    look: () => t("look"),
    threshold: (values) => t("threshold", values),
    thresholdAll: (values) => t("thresholdAll", values),
    compare: (values) => t("compare", values),
    noninferior: (values) => t("noninferior", values),
    guardrail: (values) => t("guardrail", values),
    builtin,
  }
}

export function useReasonCopy(): ReasonCopy {
  const t = useTranslations("research.experiment.launch.reason")
  return {
    look: (values) => t("look", values),
    wide: (values) => t("wide", values),
    enough: (values) => t("enough", values),
    no_margin: (values) => t("no_margin", values),
    no_history: (values) => t("no_history", values),
    short_of_cases: (values) => t("short_of_cases", values),
  }
}

export function useSubjectCopy(): SubjectCopy {
  const t = useTranslations("research.list.subject")
  return {
    flow: (flow) => t("flow", { flow }),
    range: (flow, range) => t("range", { flow, range }),
    arm: (arm) => t("arm", { arm }),
    armRange: (arm, range) => t("armRange", { arm, range }),
  }
}
