import { useTranslations } from "use-intl"
import type { BuiltinNames } from "./metrics"
import type { FlowId, LaunchEstimate } from "@/domain"
import { spendEstimate, type QuestionCopy, type ReasonCopy, type SubjectCopy } from "./presenters"
import type { CheckHintCopy } from "./series-presenters"

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

export function useSpendText(): (estimate: Pick<LaunchEstimate, "usd" | "usdSource">) => string {
  const t = useTranslations("research.experiment.launch.estimate")
  return (estimate) => {
    const spend = spendEstimate(estimate)
    return t(spend.source, { usd: spend.usd })
  }
}

export function useFlowTitle(): (flow: FlowId | null) => string {
  const t = useTranslations("research.flowSection")
  return (flow) => flow ?? t("arms")
}

export function useCheckHintCopy(): CheckHintCopy {
  const t = useTranslations("research.series.cases.checkHint")
  return {
    builtin: (use) => t("builtin", { use }),
    fields: (fields) => t("fields", { fields }),
    code: (ref) => t("code", { ref }),
    judge: (inference) => t("judge", { inference }),
    agent: (agent) => t("agent", { agent }),
    validatedBy: (experiment) => t("validatedBy", { experiment }),
    notValidated: t("notValidated"),
  }
}
