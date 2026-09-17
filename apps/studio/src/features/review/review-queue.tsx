import { useNow, useTranslations } from "use-intl"
import type { ReviewId, ReviewQueueItem } from "@/domain"
import { Dot, Empty, Heading, Surface, Text } from "@/components/studio"
import { reviewRouteApi } from "@/lib/routes"
import { SLA, queueReason, runTitle, slaDotLabel, slaDuration, slaState, stageNode } from "./presenters"

type QueueCardProps = { readonly item: ReviewQueueItem; readonly selected: boolean }

export type ReviewQueueProps = { readonly queue: readonly ReviewQueueItem[]; readonly itemId: ReviewId | null }

function QueueCard({ item, selected }: QueueCardProps) {
  const t = useTranslations("review")
  const state = slaState(item.sla, useNow())
  const look = SLA[state.kind]
  return (
    <Surface variant="raised" padding="sm" interactive tone="llm" selected={selected} asChild>
      <reviewRouteApi.Link to="." search={{ item: item.id }} resetScroll={false}>
        <Heading
          size="item"
          titleAs="div"
          leading={<Dot tone={look.dot} {...slaDotLabel(state, t)} />}
          title={runTitle(item, t)}
          trailing={
            <Text role="tiny" tone={look.queue}>
              {slaDuration(state, t)}
            </Text>
          }
          below={[
            <Text as="div" role="hint" tone="default" className="mt-1.75">
              {stageNode(item, t)}
            </Text>,
            <Text as="div" role="body" tone="neutral" className="-mt-0.5">
              {queueReason(item, t)}
            </Text>,
          ]}
        />
      </reviewRouteApi.Link>
    </Surface>
  )
}

export function ReviewQueue({ queue, itemId }: ReviewQueueProps) {
  const t = useTranslations("review")
  const common = useTranslations("common")
  if (queue.length === 0) return <Empty title={common("empty.queue")} />
  return (
    <nav aria-label={t("queue.labelAria")} className="flex flex-col gap-1.75">
      {queue.map((item) => (
        <QueueCard key={item.id} item={item} selected={item.id === itemId} />
      ))}
    </nav>
  )
}
