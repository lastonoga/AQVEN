import { createFileRoute } from "@tanstack/react-router"
import { QUESTION_KINDS, type FlowId, type QuestionKind } from "@/domain"
import * as ids from "@/data/ids"
import { ResearchScreen } from "@/features/research"
import { parseEnum, parseId, parseText } from "@/lib/search"
import { optional, searchValidator, type RawSearch } from "@/routes/-search"

type ResearchSearch = { readonly flow?: FlowId; readonly question?: QuestionKind; readonly failureMode?: string }

const parseFlow = parseId(ids.flowId)
const parseQuestion = parseEnum(QUESTION_KINDS)

const parseResearchSearch = (raw: RawSearch): ResearchSearch => ({
  ...optional("flow", parseFlow(raw["flow"])),
  ...optional("question", parseQuestion(raw["question"])),
  ...optional("failureMode", parseText(raw["failureMode"])),
})

const validateResearchSearch = searchValidator(parseResearchSearch)

export const Route = createFileRoute("/_project/research/")({
  validateSearch: validateResearchSearch,
  loaderDeps: ({ search }) => search,
  loader: async ({ context: { api }, deps }) => {
    const [experiments, all] = await Promise.all([api.research.experiments(deps), api.research.experiments()])
    return { experiments, all, filter: deps }
  },
  component: ResearchScreen,
})
