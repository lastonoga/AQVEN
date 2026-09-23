import { useId, useState } from "react"
import { useTranslations } from "use-intl"
import type { ExperimentDetail } from "@/domain"
import { Expander, Heading, Surface, Text, type TagSpec } from "@/components/studio"
import { joinMeta } from "@/lib/format"
import { useQuestionCopy } from "./copy"
import { guardrailSentences, questionSentence } from "./presenters"

const LIST_JOIN = "; "

const failureTags = (mode: string | null, label: (mode: string) => string): readonly TagSpec[] =>
  mode === null ? [] : [{ children: label(mode), tone: "warning" }]

function NotesToggle({ open, controls, onToggle }: { readonly open: boolean; readonly controls: string; readonly onToggle: () => void }) {
  const t = useTranslations("research.experiment")
  return <Expander open={open} controls={controls} label={open ? t("notesHide") : t("notesShow")} size="sm" onClick={onToggle} />
}

export function ExperimentHeader({ experiment }: { readonly experiment: ExperimentDetail }) {
  const t = useTranslations("research")
  const question = useQuestionCopy()
  const notesId = useId()
  const [notesOpen, setNotesOpen] = useState(false)
  const guards = guardrailSentences(experiment.question, experiment.metrics, question)
  const tags: readonly TagSpec[] = [
    { children: t(`vocabulary.question.${experiment.question.kind}`), tone: "neutral", fill: "outline" },
    ...failureTags(experiment.failureMode, (mode) => t("experiment.failureMode", { mode })),
  ]
  const notes = experiment.notes
  return (
    <div className="flex flex-col gap-3">
      <Heading
        size="page"
        title={experiment.id}
        tags={tags}
        wrap
        below={[
          <Text key="question" role="lead" tone="default" weight="medium">
            {questionSentence(experiment.question, experiment.metrics, question)}
          </Text>,
          guards.length === 0 ? null : <span key="guards">{t("experiment.guardrails", { list: guards.join(LIST_JOIN) })}</span>,
          <span key="description">{experiment.description}</span>,
          <Text key="files" role="data" tone="neutral">
            {joinMeta([t("experiment.files", { spec: experiment.files.spec }), experiment.files.notes])}
          </Text>,
        ].filter((line) => line !== null)}
        trailing={notes === null ? null : <NotesToggle open={notesOpen} controls={notesId} onToggle={() => { setNotesOpen((open) => !open) }} />}
      />
      {notes !== null && notesOpen ? (
        <Surface id={notesId} variant="well" padding="md" role="region" aria-label={t("experiment.notesAria")}>
          <Text as="div" role="note" tone="default" className="whitespace-pre-wrap">
            {notes}
          </Text>
        </Surface>
      ) : null}
    </div>
  )
}
