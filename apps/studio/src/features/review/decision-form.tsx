import { useId } from "react"
import { useTranslations } from "use-intl"
import type { DecisionKind, ReviewId, ReviewQueueItem } from "@/domain"
import { Text } from "@/components/studio"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { Textarea } from "@/components/ui/textarea"
import { useReviewDecision } from "@/routes/-review-decision"
import { DecisionActions } from "./decision-actions"
import { decisionHint } from "./presenters"
import type { NoteDrafts } from "./use-note-drafts"

export type DecisionFormProps = {
  readonly item: ReviewQueueItem
  readonly next: ReviewId | null
  readonly drafts: NoteDrafts
}

function DecisionFailure({ failed }: { readonly failed: boolean }) {
  const t = useTranslations("review")
  if (!failed) return null
  return (
    <Text role="hint" tone="destructive" asChild>
      <p role="alert" className="mt-2.5">
        {t("decision.failed")}
      </p>
    </Text>
  )
}

export function DecisionForm({ item, next, drafts }: DecisionFormProps) {
  const t = useTranslations("review")
  const noteId = useId()
  const { pending, failedId, decide } = useReviewDecision()
  const note = drafts.read(item.id)
  const writeNote = (text: string) => {
    drafts.write(item.id, text)
  }
  const submit = (decision: DecisionKind) => {
    decide({ command: { reviewId: item.id, decision, note }, next, onDecided: () => { writeNote("") } })
  }
  return (
    <div>
      <Separator className="mt-3.5 mb-3.25" />
      <Text role="label" tone="neutral" asChild>
        <Label htmlFor={noteId}>{t("sections.decision")}</Label>
      </Text>
      <Textarea
        id={noteId}
        className="mt-2 min-h-19 px-3 py-2.75"
        value={note}
        placeholder={t("decision.placeholder")}
        disabled={pending}
        onChange={(event) => {
          writeNote(event.target.value)
        }}
      />
      <DecisionActions pending={pending} onDecide={submit} />
      <DecisionFailure failed={failedId === item.id} />
      <Text as="p" role="hint" tone="neutral" className="mt-2.5">
        {decisionHint(item, t)}
      </Text>
    </div>
  )
}
