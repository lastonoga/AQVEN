import { useState, useTransition } from "react"
import { useRouter } from "@tanstack/react-router"
import type { DecisionCommand, ReviewId } from "@/domain"
import { reviewRouteApi } from "@/lib/routes"

export type DecisionRequest = {
  readonly command: DecisionCommand
  readonly next: ReviewId | null
  readonly onDecided: () => void
}

export type ReviewDecision = {
  readonly pending: boolean
  readonly failedId: ReviewId | null
  readonly decide: (request: DecisionRequest) => void
}

export function useReviewDecision(): ReviewDecision {
  const { sources } = reviewRouteApi.useRouteContext()
  const scope = reviewRouteApi.useParams()
  const navigate = reviewRouteApi.useNavigate()
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [failedId, setFailedId] = useState<ReviewId | null>(null)

  const refresh = (next: ReviewId | null): Promise<void> => {
    if (next === null) return router.invalidate()
    return navigate({ to: ".", search: { item: next }, resetScroll: false }).then(() => router.invalidate())
  }

  const settle = async ({ command, next, onDecided }: DecisionRequest): Promise<void> => {
    const saved = await sources.review.decide(scope, command).then(
      () => true,
      () => false,
    )
    if (!saved) {
      setFailedId(command.reviewId)
      return
    }
    startTransition(() => {
      onDecided()
      void refresh(next)
    })
  }

  const decide = (request: DecisionRequest): void => {
    setFailedId(null)
    startTransition(() => settle(request))
  }

  return { pending, failedId, decide }
}
