import type { ReactNode } from "react"
import type { RichTagsFunction } from "use-intl"
import type { CheckResult, ReviewDetail, ReviewQueueItem } from "@/domain"
import { checkGlyph, joinSpans, type Inline, type PropertyRow, type Span, type TextTone, type Tone } from "@/components/studio"
import { joinMeta, orNone, score, seconds, usd } from "@/lib/format"
import type { ReviewCopy, TriggerKind, TriggerOf } from "./presenters"

export type NoteLine = { readonly id: string; readonly content: ReactNode; readonly tone: TextTone }
export type EvidenceNote = { readonly variant: "well" | "callout"; readonly tone: Tone; readonly lines: readonly NoteLine[] }
export type ReviewEvidence = {
  readonly id: string
  readonly title: string
  readonly note: EvidenceNote
  readonly rows: readonly PropertyRow[]
}
export type ReviewSectionContext = ReviewCopy & { readonly strong: RichTagsFunction }

type EvidenceBuilder = (detail: ReviewDetail, item: ReviewQueueItem, ctx: ReviewSectionContext) => ReviewEvidence

type WhyReason<K extends TriggerKind> = (trigger: TriggerOf<K>, detail: ReviewDetail, ctx: ReviewSectionContext) => ReactNode

const WHY_REASON: { readonly [K in TriggerKind]: WhyReason<K> } = {
  verdict: (_trigger, detail, { t, strong }) =>
    t.rich("why.judgesReturned", { verdict: detail.escalation.verdict, summary: detail.escalation.summary, b: strong }),
  humanInput: (trigger, detail, { t, strong }) =>
    t.rich("why.waitingFor", { slot: trigger.slot, summary: detail.escalation.summary, b: strong }),
}

const whyReason = <K extends TriggerKind>(trigger: TriggerOf<K>, detail: ReviewDetail, ctx: ReviewSectionContext): ReactNode => {
  const reason: WhyReason<K> = WHY_REASON[trigger.kind]
  return reason(trigger, detail, ctx)
}

const checkResultSpan = (check: CheckResult): Span => ({ glyph: checkGlyph(check.pass), text: check.name })

const checkLine = (checks: readonly CheckResult[], none: string): Inline => {
  if (checks.length === 0) return none
  return joinSpans(checks.map(checkResultSpan))
}

const judgesLine = (judges: ReviewDetail["judges"], none: string): string =>
  orNone(joinMeta(judges.map((entry) => `${entry.judge} ${score(entry.score)}`)), none)

const produced: EvidenceBuilder = ({ produced: output, call }, _item, { t, common }) => ({
  id: "produced",
  title: t("sections.produced"),
  note: {
    variant: "well",
    tone: "neutral",
    lines: [
      { id: "title", content: common("quoted", { text: output.title }), tone: "default" },
      { id: "highlights", content: joinMeta(output.highlights), tone: "neutral" },
    ],
  },
  rows: [
    { key: t("fields.agent"), value: joinMeta([call.nodeId, call.model, t("values.temperature", { value: String(call.temperature) })]) },
    { key: t("fields.prompt"), value: t("values.promptRevision", { prompt: call.prompt.id, revision: call.prompt.revision }) },
    { key: t("fields.cost"), value: joinMeta([usd(call.costUsd), seconds(call.durationS)]) },
    { key: t("fields.postCheck"), value: checkLine(call.postChecks, common("none")) },
  ],
})

const whyRows = ({ judges, loop, expected, dataset }: ReviewDetail, { t, common }: ReviewCopy): readonly PropertyRow[] => [
  { key: t("fields.judges"), value: judgesLine(judges, common("none")) },
  { key: t("fields.loop"), value: t("values.loop", { count: loop.iterations, reason: loop.stopReason }) },
  { key: t("fields.expected"), value: common("quoted", { text: expected.title }) },
  {
    key: t("fields.dataset"),
    value: t("values.datasetRow", { dataset: dataset.id, row: String(dataset.ordinal), total: String(dataset.rowCount) }),
  },
]

const why: EvidenceBuilder = (detail, item, ctx) => ({
  id: "why",
  title: ctx.t("sections.why"),
  note: {
    variant: "callout",
    tone: "warning",
    lines: [{ id: "reason", tone: "inherit", content: whyReason(item.trigger, detail, ctx) }],
  },
  rows: whyRows(detail, ctx),
})

export const REVIEW_SECTIONS: readonly EvidenceBuilder[] = [produced, why]

export const reviewEvidence = (detail: ReviewDetail, item: ReviewQueueItem, ctx: ReviewSectionContext): readonly ReviewEvidence[] =>
  REVIEW_SECTIONS.map((build) => build(detail, item, ctx))
