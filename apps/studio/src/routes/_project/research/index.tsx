import { createFileRoute } from "@tanstack/react-router"
import { QUESTION_KINDS, type QuestionKind } from "@/domain"
import { ResearchScreen } from "@/features/research"
import { parseEnum, parseText } from "@/lib/search"
import { optional, searchValidator, type RawSearch } from "@/routes/-search"

type ResearchSearch = { readonly question?: QuestionKind; readonly failureMode?: string }

const parseQuestion = parseEnum(QUESTION_KINDS)

const parseResearchSearch = (raw: RawSearch): ResearchSearch => ({
  ...optional("question", parseQuestion(raw["question"])),
  ...optional("failureMode", parseText(raw["failureMode"])),
})

const validateResearchSearch = searchValidator(parseResearchSearch)

export const Route = createFileRoute("/_project/research/")({
  validateSearch: validateResearchSearch,
  loaderDeps: ({ search }) => parseResearchSearch(search),
  loader: async ({ context: { api }, deps }) => {
    const [experiments, all] = await Promise.all([api.research.experiments(deps), api.research.experiments()])
    return { experiments, all, filter: deps }
  },
  component: ResearchScreen,
})
