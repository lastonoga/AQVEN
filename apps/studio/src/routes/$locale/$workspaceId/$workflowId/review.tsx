import { createFileRoute } from "@tanstack/react-router"
import type { ReviewId } from "@/domain"
import * as ids from "@/data/ids"
import { ReviewScreen } from "@/features/review"
import { parseId } from "@/lib/search"
import { loadWhen } from "@/routes/-load"
import { optional, searchValidator, type RawSearch } from "@/routes/-search"

type ReviewSearch = { readonly item?: ReviewId }

const parseItem = parseId(ids.reviewId)

const parseReviewSearch = (raw: RawSearch): ReviewSearch => optional("item", parseItem(raw["item"]))

const validateReviewSearch = searchValidator(parseReviewSearch)

export const Route = createFileRoute("/$locale/$workspaceId/$workflowId/review")({
  validateSearch: validateReviewSearch,
  loaderDeps: ({ search: { item } }) => ({ item }),
  loader: async ({ context: { sources }, params, deps }) => {
    const queue = await sources.review.queue(params)
    const itemId = deps.item ?? queue[0]?.id ?? null
    const detail = await loadWhen(itemId, (id) => sources.review.detail(params, id))
    return { queue, itemId, detail }
  },
  component: ReviewScreen,
})
