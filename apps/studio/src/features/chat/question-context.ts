import { createContext, useContext } from "react"

export type QuestionAnswerSubmit = (approvalId: string, answers: Readonly<Record<string, string>>) => Promise<void>

export const QuestionAnswerContext = createContext<QuestionAnswerSubmit | null>(null)

export function useQuestionAnswer(): QuestionAnswerSubmit | null {
  return useContext(QuestionAnswerContext)
}
