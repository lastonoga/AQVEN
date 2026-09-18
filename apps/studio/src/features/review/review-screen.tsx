import { useTranslations } from "use-intl"
import { ChoiceLink, ChoiceList, Heading, Page, Toolbar } from "@/components/studio"
import { ROUTE_PATH, reviewRouteApi } from "@/lib/routes"
import { entryKey } from "./presenters"
import { ReviewDetailSlot } from "./review-detail"
import { ReviewQueue } from "./review-queue"

const QUEUE_WIDTH = 320

const QUEUE_FILTERS = ["all", "overdue"] as const

type QueueFilter = (typeof QUEUE_FILTERS)[number]

const FILTER_SEARCH: Readonly<Record<QueueFilter, { readonly overdue?: true }>> = { all: {}, overdue: { overdue: true } }

function QueueFilters() {
  const t = useTranslations("review")
  const { overdue } = reviewRouteApi.useSearch()
  const current: QueueFilter = overdue === true ? "overdue" : "all"
  return (
    <ChoiceList appearance="segmented" label={t("filter.labelAria")}>
      {QUEUE_FILTERS.map((filter) => (
        <ChoiceLink
          key={filter}
          appearance="segmented"
          size="sm"
          from={ROUTE_PATH.review}
          to="."
          search={FILTER_SEARCH[filter]}
          selected={filter === current}
        >
          {t(`filter.${filter}`)}
        </ChoiceLink>
      ))}
    </ChoiceList>
  )
}

function ReviewHeader() {
  const t = useTranslations("review")
  return (
    <Toolbar wrap className="-mb-1 items-start gap-2.5" end={<QueueFilters />}>
      <Heading size="page" title={t("title")} below={[t("subtitle")]} />
    </Toolbar>
  )
}

export function ReviewScreen() {
  const { queue, selected, detail, schema, blobText } = reviewRouteApi.useLoaderData()
  return (
    <Page
      width="md"
      header={<ReviewHeader />}
      aside={{ content: <ReviewQueue queue={queue} selectedKey={selected === null ? null : entryKey(selected)} />, width: QUEUE_WIDTH }}
    >
      <ReviewDetailSlot entry={selected} detail={detail} schema={schema} blobText={blobText} />
    </Page>
  )
}
