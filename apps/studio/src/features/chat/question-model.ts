export const QUESTION_TOOL = "AskUserQuestion"

export const ANSWER_SEPARATOR = ", "

export type QuestionOption = { readonly label: string; readonly description: string }

export type Question = {
  readonly question: string
  readonly header: string
  readonly multiSelect: boolean
  readonly options: readonly QuestionOption[]
}

export type QuestionDraft = {
  readonly picks: Readonly<Record<string, readonly string[]>>
  readonly notes: Readonly<Record<string, string>>
}

export const EMPTY_DRAFT: QuestionDraft = { picks: {}, notes: {} }

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const isList = (value: unknown): value is readonly unknown[] => Array.isArray(value)

const filled = (value: unknown): string | null => (typeof value === "string" && value.trim().length > 0 ? value : null)

const readJson = (text: string): unknown => {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

const readOption = (value: unknown): QuestionOption | null => {
  if (!isRecord(value)) return null
  const label = filled(value["label"])
  if (label === null) return null
  return { label, description: typeof value["description"] === "string" ? value["description"] : "" }
}

const kept = <T>(values: readonly (T | null)[]): readonly T[] => values.filter((value): value is T => value !== null)

const readQuestion = (value: unknown): Question | null => {
  if (!isRecord(value)) return null
  const asked = filled(value["question"])
  const raw = value["options"]
  if (asked === null || !isList(raw)) return null
  const options = kept(raw.map(readOption))
  if (options.length === 0) return null
  return { question: asked, header: filled(value["header"]) ?? asked, multiSelect: value["multiSelect"] === true, options }
}

export const parseQuestions = (argsText: string): readonly Question[] | null => {
  const parsed = readJson(argsText)
  if (!isRecord(parsed)) return null
  const raw = parsed["questions"]
  if (!isList(raw)) return null
  const questions = kept(raw.map(readQuestion))
  return questions.length === 0 ? null : questions
}

export const pickedLabels = (draft: QuestionDraft, question: string): readonly string[] => draft.picks[question] ?? []

export const writtenNote = (draft: QuestionDraft, question: string): string | null => draft.notes[question] ?? null

const without = (notes: QuestionDraft["notes"], question: string): QuestionDraft["notes"] =>
  Object.fromEntries(Object.entries(notes).filter(([key]) => key !== question))

const nextLabels = (current: readonly string[], label: string, multiSelect: boolean): readonly string[] => {
  if (current.includes(label)) return current.filter((kept) => kept !== label)
  return multiSelect ? [...current, label] : [label]
}

export const toggleOption = (draft: QuestionDraft, question: Question, label: string): QuestionDraft => ({
  picks: { ...draft.picks, [question.question]: nextLabels(pickedLabels(draft, question.question), label, question.multiSelect) },
  notes: without(draft.notes, question.question),
})

export const openNote = (draft: QuestionDraft, question: string): QuestionDraft => ({
  picks: { ...draft.picks, [question]: [] },
  notes: { ...draft.notes, [question]: draft.notes[question] ?? "" },
})

export const writeNote = (draft: QuestionDraft, question: string, note: string): QuestionDraft => ({
  picks: draft.picks,
  notes: { ...draft.notes, [question]: note },
})

export const closeNote = (draft: QuestionDraft, question: string): QuestionDraft => ({
  picks: draft.picks,
  notes: without(draft.notes, question),
})

const answerOf = (draft: QuestionDraft, question: Question): string | null => {
  const note = (draft.notes[question.question] ?? "").trim()
  if (note.length > 0) return note
  const picks = pickedLabels(draft, question.question)
  return picks.length === 0 ? null : picks.join(ANSWER_SEPARATOR)
}

export const composeAnswers = (questions: readonly Question[], draft: QuestionDraft): Readonly<Record<string, string>> =>
  Object.fromEntries(
    questions.flatMap((question) => {
      const answer = answerOf(draft, question)
      return answer === null ? [] : [[question.question, answer] as const]
    }),
  )

export const answeredCount = (questions: readonly Question[], draft: QuestionDraft): number =>
  Object.keys(composeAnswers(questions, draft)).length
