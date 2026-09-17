import type { DecisionKind, ReviewDetail, ReviewId, ReviewQueueItem, ReviewSla, ReviewTrigger, SlaState } from "@/domain"
import type { Tone } from "@/components/studio"
import { minutesClock, rowRef, runRef } from "@/lib/format"
import type { Translator } from "@/i18n/translator"

export type ReviewCopy = { readonly t: Translator<"review">; readonly common: Translator<"common"> }

export type SlaKind = SlaState["kind"]
export type SlaLook = { readonly dot: Tone; readonly queue: Tone; readonly detail: Tone }
export type TriggerKind = ReviewTrigger["kind"]
export type TriggerOf<K extends TriggerKind> = Extract<ReviewTrigger, { readonly kind: K }>
export type DotLabel = { readonly label?: string }

type SlaOf<K extends SlaKind> = Extract<SlaState, { readonly kind: K }>
type SlaMessageKey = "left" | "overdue"
type BadgeKey = "needsHuman" | "needsInput"
type DecisionLabelKey = "approve" | "requestChanges" | "reject"

const MS_PER_MINUTE = 60_000
const MINUTES_PER_HOUR = 60
const NO_BUDGET = "none"

export const SLA: Readonly<Record<SlaKind, SlaLook>> = {
  onTrack: { dot: "warning", queue: "neutral", detail: "warning" },
  overdue: { dot: "destructive", queue: "destructive", detail: "destructive" },
}

const SLA_MINUTES: { readonly [K in SlaKind]: (state: SlaOf<K>) => number } = {
  onTrack: (state) => state.remainingMinutes,
  overdue: (state) => state.overdueMinutes,
}

const SLA_MESSAGE: Readonly<Record<SlaKind, SlaMessageKey>> = {
  onTrack: "left",
  overdue: "overdue",
}

const SLA_DOT_LABEL: Readonly<Record<SlaKind, (t: Translator<"review">) => DotLabel>> = {
  onTrack: () => ({}),
  overdue: (t) => ({ label: t("status.overdueAria") }),
}

const TRIGGER_BADGE: Readonly<Record<TriggerKind, BadgeKey>> = {
  verdict: "needsHuman",
  humanInput: "needsInput",
}

const DECISION_LABEL: Readonly<Record<DecisionKind, DecisionLabelKey>> = {
  approve: "approve",
  changes: "requestChanges",
  reject: "reject",
}

const TRIGGER_REASON: { readonly [K in TriggerKind]: (trigger: TriggerOf<K>, t: Translator<"review">) => string } = {
  verdict: (trigger, t) => t("trigger.verdict", { verdict: trigger.verdict, required: trigger.required }),
  humanInput: (trigger, t) => t("trigger.humanInput", { slot: trigger.slot }),
}

const triggerReason = <K extends TriggerKind>(trigger: TriggerOf<K>, t: Translator<"review">): string => {
  const reason: (trigger: TriggerOf<K>, t: Translator<"review">) => string = TRIGGER_REASON[trigger.kind]
  return reason(trigger, t)
}

const STATUS_REASON: Readonly<Record<ReviewQueueItem["status"], (item: ReviewQueueItem, t: Translator<"review">) => string>> = {
  pending: (item, t) => triggerReason(item.trigger, t),
  escalated: (_item, t) => t("trigger.escalated"),
}

export const slaState = (sla: ReviewSla, now: Date): SlaState => {
  const remainingMinutes = Math.round((Date.parse(sla.dueAt) - now.getTime()) / MS_PER_MINUTE)
  if (remainingMinutes < 0) return { kind: "overdue", overdueMinutes: -remainingMinutes }
  return { kind: "onTrack", remainingMinutes }
}

const slaMinutes = <K extends SlaKind>(state: SlaOf<K>): number => {
  const read: (state: SlaOf<K>) => number = SLA_MINUTES[state.kind]
  return read(state)
}

const slaClock = (state: SlaState): string => minutesClock(slaMinutes(state))

export const slaDuration = (state: SlaState, t: Translator<"review">): string =>
  t(`sla.${SLA_MESSAGE[state.kind]}`, { duration: slaClock(state) })

export const slaDotLabel = (state: SlaState, t: Translator<"review">): DotLabel => SLA_DOT_LABEL[state.kind](t)

const budgetDuration = (minutes: number | null, common: Translator<"common">): string => {
  if (minutes === null) return NO_BUDGET
  if (minutes % MINUTES_PER_HOUR !== 0) return minutesClock(minutes)
  return common("duration.hours", { hours: String(minutes / MINUTES_PER_HOUR) })
}

export const slaSummary = (sla: ReviewSla, state: SlaState, { t, common }: ReviewCopy): string =>
  t("sla.full", { budget: budgetDuration(sla.budgetMinutes, common), state: state.kind, duration: slaClock(state) })

export const runTitle = (item: ReviewQueueItem, t: Translator<"review">): string => t("queue.run", { run: runRef(item.runId) })

export const stageNode = (item: ReviewQueueItem, t: Translator<"review">): string =>
  t("queue.stageNode", { stage: String(item.stage), node: item.nodeId })

export const queueReason = (item: ReviewQueueItem, t: Translator<"review">): string => STATUS_REASON[item.status](item, t)

export const triggerBadge = (item: ReviewQueueItem, t: Translator<"review">): string => t(`badge.${TRIGGER_BADGE[item.trigger.kind]}`)

export const decisionLabel = (decision: DecisionKind, t: Translator<"review">): string => t(`decision.${DECISION_LABEL[decision]}`)

export const detailMeta = (item: ReviewQueueItem, detail: ReviewDetail, t: Translator<"review">): string =>
  t("detail.meta", { run: runRef(item.runId), stage: String(item.stage), row: rowRef(detail.row), branch: detail.branch })

export const decisionHint = (item: ReviewQueueItem, t: Translator<"review">): string =>
  t("decision.hint", { stage: String(item.stage) })

export const nextItemId = (queue: readonly ReviewQueueItem[], id: ReviewId): ReviewId | null => {
  const index = queue.findIndex((item) => item.id === id)
  if (index < 0) return null
  return queue[index + 1]?.id ?? null
}
