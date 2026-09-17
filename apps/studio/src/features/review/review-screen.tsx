import { useTranslations } from "use-intl"
import { Actions, Heading, Page, Toolbar } from "@/components/studio"
import { reviewRouteApi } from "@/lib/routes"
import { ReviewDetailSlot } from "./review-detail"
import { ReviewQueue } from "./review-queue"
import { useNoteDrafts } from "./use-note-drafts"

const QUEUE_WIDTH = 320

function ReviewHeader() {
  const t = useTranslations("review")
  const actions = (
    <Actions
      actions={[
        { id: "assign", label: t("actions.assignToMe") },
        { id: "rules", label: t("actions.reviewRules") },
      ]}
    />
  )
  return (
    <Toolbar wrap end={actions} className="-mb-1 items-start gap-2.5">
      <Heading size="page" title={t("title")} below={[t("subtitle")]} />
    </Toolbar>
  )
}

export function ReviewScreen() {
  const { queue, itemId, detail } = reviewRouteApi.useLoaderData()
  const drafts = useNoteDrafts()
  return (
    <Page
      width="md"
      header={<ReviewHeader />}
      aside={{ content: <ReviewQueue queue={queue} itemId={itemId} />, width: QUEUE_WIDTH }}
    >
      <ReviewDetailSlot queue={queue} itemId={itemId} detail={detail} drafts={drafts} />
    </Page>
  )
}
