import type { Dispatch } from "react"
import { useTranslations } from "use-intl"
import type { AuthoringOptions } from "@/domain"
import type { FormAction, NewExperimentForm } from "./form-state"
import { problemsAt, type FormProblem, type ProblemPlace } from "./problems"

export type FormView = {
  readonly form: NewExperimentForm
  readonly options: AuthoringOptions
  readonly problems: readonly FormProblem[]
  readonly shown: boolean
  readonly disabled: boolean
  readonly dispatch: Dispatch<FormAction>
  readonly draft: () => string
}

export function useProblemText(): (problem: FormProblem) => string {
  const t = useTranslations("research.newExperiment.problem")
  return (problem) => t(problem.code)
}

export const visibleAt = (view: FormView, place: ProblemPlace): readonly FormProblem[] => (view.shown ? problemsAt(view.problems, place) : [])
