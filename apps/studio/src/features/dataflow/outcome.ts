import type { RunOutcome } from "@/domain"
import { fixed, usd } from "@/lib/format"
import type { Translator } from "@/i18n/translator"

export type OutcomeView = {
  readonly title: string
  readonly note: string
  readonly billed: string
  readonly traceGap: string | null
}

const GAP_DIGITS = 1

const traceGapLine = ({ traceGap }: RunOutcome, t: Translator<"dataflow">): string | null => {
  if (traceGap === undefined) return null
  return t("outcome.traceGap", { seconds: fixed(traceGap.seconds, GAP_DIGITS), from: traceGap.fromStage, to: traceGap.toStage })
}

export const outcomeView = (outcome: RunOutcome, t: Translator<"dataflow">): OutcomeView => ({
  title: t("outcome.title", { status: outcome.status }),
  note: t("outcome.note"),
  billed: usd(outcome.billedUsd),
  traceGap: traceGapLine(outcome, t),
})
