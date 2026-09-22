import { useState } from "react"
import { Check } from "lucide-react"
import { cn } from "cn"
import { useTranslations } from "use-intl"
import { Surface, Tag, Text, Toolbar } from "@/components/studio"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  ANSWER_SEPARATOR,
  EMPTY_DRAFT,
  answeredCount,
  closeNote,
  composeAnswers,
  openNote,
  pickedLabels,
  toggleOption,
  writeNote,
  writtenNote,
  type Question,
  type QuestionDraft,
  type QuestionOption,
} from "./question-model"
import { useQuestionAnswer } from "./question-context"

export type QuestionCardProps = {
  readonly questions: readonly Question[]
  readonly approvalId: string
  readonly decided: boolean
}

type RowProps = {
  readonly label: string
  readonly description: string
  readonly selected: boolean
  readonly multiSelect: boolean
  readonly disabled: boolean
  readonly onPick: () => void
}

const ROW_CLASS =
  "flex w-full min-w-0 items-start gap-2 rounded-md border border-border bg-card px-2.5 py-1.75 text-left transition-colors hover:border-ring disabled:pointer-events-none disabled:opacity-60"

const SELECTED_CLASS = "border-tone-border bg-tone-bg"

function OptionRow({ label, description, selected, multiSelect, disabled, onPick }: RowProps) {
  return (
    <button
      type="button"
      role={multiSelect ? "checkbox" : "radio"}
      aria-checked={selected}
      disabled={disabled}
      onClick={onPick}
      data-tone="llm"
      className={cn(ROW_CLASS, selected ? SELECTED_CLASS : null)}
    >
      <span className="mt-0.25 flex size-3.5 shrink-0 items-center justify-center text-tone-fg">
        {selected ? <Check className="size-3.5" /> : null}
      </span>
      <span className="flex min-w-0 flex-col gap-0.5">
        <Text role="meta" weight="medium" tone="default">
          {label}
        </Text>
        {description.length === 0 ? null : (
          <Text role="hint" tone="neutral">
            {description}
          </Text>
        )}
      </span>
    </button>
  )
}

type BlockProps = {
  readonly question: Question
  readonly draft: QuestionDraft
  readonly disabled: boolean
  readonly onChange: (draft: QuestionDraft) => void
}

const isPicked = (draft: QuestionDraft, question: Question, option: QuestionOption): boolean =>
  pickedLabels(draft, question.question).includes(option.label)

function QuestionBlock({ question, draft, disabled, onChange }: BlockProps) {
  const t = useTranslations("chat.question")
  const note = writtenNote(draft, question.question)
  const toggleNote = () => {
    onChange(note === null ? openNote(draft, question.question) : closeNote(draft, question.question))
  }
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex min-w-0 items-center gap-1.75">
        <Tag tone="llm" fill="tint" size="xs">
          {question.header}
        </Tag>
        {question.multiSelect ? (
          <Text role="micro" tone="neutral">
            {t("multiHint")}
          </Text>
        ) : null}
      </div>
      <Text role="meta" tone="default">
        {question.question}
      </Text>
      <div role={question.multiSelect ? "group" : "radiogroup"} aria-label={question.question} className="flex flex-col gap-1">
        {question.options.map((option) => (
          <OptionRow
            key={option.label}
            label={option.label}
            description={option.description}
            selected={isPicked(draft, question, option)}
            multiSelect={question.multiSelect}
            disabled={disabled}
            onPick={() => {
              onChange(toggleOption(draft, question, option.label))
            }}
          />
        ))}
        <OptionRow
          label={t("other")}
          description=""
          selected={note !== null}
          multiSelect={question.multiSelect}
          disabled={disabled}
          onPick={toggleNote}
        />
      </div>
      {note === null ? null : (
        <Input
          autoFocus
          value={note}
          disabled={disabled}
          aria-label={t("otherAria", { header: question.header })}
          placeholder={t("otherPlaceholder")}
          onChange={(event) => {
            onChange(writeNote(draft, question.question, event.target.value))
          }}
        />
      )}
    </div>
  )
}

const answerLines = (questions: readonly Question[], draft: QuestionDraft): readonly string[] => {
  const answers = composeAnswers(questions, draft)
  return questions.flatMap((question) => {
    const answer = answers[question.question]
    return answer === undefined ? [] : [`${question.header}${ANSWER_SEPARATOR}${answer}`]
  })
}

export function QuestionCard({ questions, approvalId, decided }: QuestionCardProps) {
  const t = useTranslations("chat.question")
  const submit = useQuestionAnswer()
  const [draft, setDraft] = useState<QuestionDraft>(EMPTY_DRAFT)
  const [sending, setSending] = useState(false)
  const [refused, setRefused] = useState(false)
  const answered = answeredCount(questions, draft)
  const locked = decided || sending || submit === null
  const send = (answers: Readonly<Record<string, string>>) => () => {
    if (submit === null) return
    setSending(true)
    setRefused(false)
    submit(approvalId, answers).catch(() => {
      setSending(false)
      setRefused(true)
    })
  }
  return (
    <Surface variant="well" className="flex flex-col gap-3 overflow-hidden px-2.5 py-2.25">
      {questions.map((question) => (
        <QuestionBlock key={question.question} question={question} draft={draft} disabled={locked} onChange={setDraft} />
      ))}
      {decided ? (
        <Text role="hint" tone="neutral" as="div" className="whitespace-pre-wrap">
          {answerLines(questions, draft).join("\n")}
        </Text>
      ) : (
        <Surface variant="footer" asChild>
          <Toolbar size="sm" wrap>
            <Button size="xs" disabled={locked || answered < questions.length} onClick={send(composeAnswers(questions, draft))}>
              {t("submit")}
            </Button>
            <Button variant="ghost" size="xs" disabled={locked} onClick={send({})}>
              {t("skip")}
            </Button>
            <Text role="hint" tone={refused ? "destructive" : "neutral"}>
              {refused ? t("refused") : t("progress", { answered: String(answered), total: String(questions.length) })}
            </Text>
          </Toolbar>
        </Surface>
      )}
    </Surface>
  )
}
