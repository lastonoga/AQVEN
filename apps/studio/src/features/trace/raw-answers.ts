import { isRecord } from "./values"

export type RawAnswers = { readonly text: string; readonly repeats: number }

const ANSWER_SEPARATOR = "\n"
const MIN_REPEATS = 2

const sortedKeys = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(sortedKeys)
  if (!isRecord(value)) return value
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortedKeys(value[key])]))
}

const answerKey = (text: string): string | null => {
  try {
    const value: unknown = JSON.parse(text)
    return JSON.stringify(sortedKeys(value))
  } catch {
    return null
  }
}

export const collapseAnswers = (raw: string): RawAnswers => {
  const answers = raw.split(ANSWER_SEPARATOR).filter((answer) => answer.trim().length > 0)
  const first = answers[0]
  if (first === undefined || answers.length < MIN_REPEATS) return { text: raw, repeats: 1 }
  const key = answerKey(first)
  if (key === null || answers.some((answer) => answerKey(answer) !== key)) return { text: raw, repeats: 1 }
  return { text: first, repeats: answers.length }
}
