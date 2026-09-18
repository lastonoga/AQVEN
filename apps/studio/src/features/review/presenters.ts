import type { ApiExecutionAddress, ApiHumanWait, ApiRun } from "@/domain"
import type { Tone } from "@/components/studio"
import { joinMeta, minutesClock, runRef } from "@/lib/format"
import type { Translator } from "@/i18n/translator"

export type ReviewEntry = { readonly run: ApiRun; readonly wait: ApiHumanWait }

export type ReviewCopy = { readonly t: Translator<"review">; readonly domain: Translator<"domain"> }

export type DeadlineState = { readonly kind: "onTrack" | "overdue"; readonly minutes: number }
export type DeadlineKind = DeadlineState["kind"]
export type DeadlineLook = { readonly dot: Tone; readonly queue: Tone; readonly detail: Tone }
export type DotLabel = { readonly label?: string }

const MS_PER_MINUTE = 60_000

export const DEADLINE: Readonly<Record<DeadlineKind, DeadlineLook>> = {
  onTrack: { dot: "warning", queue: "neutral", detail: "warning" },
  overdue: { dot: "destructive", queue: "destructive", detail: "destructive" },
}

const DEADLINE_MESSAGE: Readonly<Record<DeadlineKind, "left" | "overdue">> = { onTrack: "left", overdue: "overdue" }

const DEADLINE_DOT: Readonly<Record<DeadlineKind, (t: Translator<"review">) => DotLabel>> = {
  onTrack: () => ({}),
  overdue: (t) => ({ label: t("deadline.overdueAria") }),
}

export const deadlineState = (wait: ApiHumanWait, now: Date): DeadlineState => {
  const minutes = Math.round((Date.parse(wait.deadline_at) - now.getTime()) / MS_PER_MINUTE)
  if (minutes < 0) return { kind: "overdue", minutes: -minutes }
  return { kind: "onTrack", minutes }
}

export const deadlineDuration = (state: DeadlineState, t: Translator<"review">): string =>
  t(`deadline.${DEADLINE_MESSAGE[state.kind]}`, { duration: minutesClock(state.minutes) })

export const deadlineDotLabel = (state: DeadlineState, t: Translator<"review">): DotLabel => DEADLINE_DOT[state.kind](t)

export const timeoutSummary = (wait: ApiHumanWait, state: DeadlineState, { t, domain }: ReviewCopy): string =>
  joinMeta([deadlineDuration(state, t), t("deadline.onTimeout", { action: domain(`onTimeout.${wait.on_timeout}`) })])

const addressParts = (address: ApiExecutionAddress): readonly (string | null)[] => [
  address.node_id,
  address.branch_key,
  address.iteration === null ? null : `#${String(address.iteration)}`,
  address.item_index === null ? null : `[${String(address.item_index)}]`,
]

export const addressLabel = (address: ApiExecutionAddress): string => joinMeta(addressParts(address))

export const entryKey = (entry: ReviewEntry): string => `${entry.run.run_id}|${addressLabel(entry.wait.address)}`

export const entryTitle = (entry: ReviewEntry, t: Translator<"review">): string => t("queue.run", { run: runRef(entry.run.run_id) })

export const entryReason = (entry: ReviewEntry, { t, domain }: ReviewCopy): string =>
  joinMeta([domain(`waitKind.${entry.wait.wait_kind}`), t("queue.assignee", { assignee: entry.wait.assignee })])

export const waitBadge = (wait: ApiHumanWait, domain: Translator<"domain">): string => domain(`waitKind.${wait.wait_kind}`)

export const detailMeta = (entry: ReviewEntry, t: Translator<"review">): string =>
  joinMeta([t("queue.run", { run: runRef(entry.run.run_id) }), t("queue.attempt", { attempt: String(entry.wait.attempt) }), entry.wait.form_type_id])

export const nextEntry = (queue: readonly ReviewEntry[], key: string): ReviewEntry | null => {
  const index = queue.findIndex((entry) => entryKey(entry) === key)
  if (index < 0) return null
  return queue[index + 1] ?? null
}
