import type { Attempt, AttemptLadder } from "@/domain"
import { OUTCOME_TONE, type Inline, type Tone } from "@/components/studio"
import { count, PAIR_SEPARATOR, SEPARATOR, usd } from "@/lib/format"
import type { Translator } from "@/i18n/translator"

export type LadderHead = {
  readonly id: string
  readonly status: string
  readonly tone: Tone
  readonly title: string
  readonly toggle: (open: boolean) => string
}

export const attemptsAnchor = (ladder: AttemptLadder): string => `attempts-${ladder.columnId}`

export const ladderHead = (ladder: AttemptLadder, t: Translator): LadderHead => {
  const result = ladder.attempts.at(-1)?.result ?? "degraded"
  const total = ladder.attempts.length
  return {
    id: attemptsAnchor(ladder),
    status: t(`domain.outcome.${result}`),
    tone: OUTCOME_TONE[result],
    title: t("trace.attempts.title", { call: ladder.callLabel, count: total }),
    toggle: (open) => (open ? t("trace.attempts.collapse") : t("trace.attempts.expand", { count: total })),
  }
}

export const attemptLines = (attempt: Attempt, t: Translator): readonly Inline[] => [
  attempt.outcome,
  t("trace.attempts.link", { action: attempt.link }),
  [{ text: `${count(attempt.tokens.input)}${PAIR_SEPARATOR}${count(attempt.tokens.output)}${SEPARATOR}` }, { text: usd(attempt.costUsd), strong: true }],
]

export const reopenOnArrival =
  (anchor: string, hash: string) =>
  (open: boolean): boolean =>
    open || hash === anchor
