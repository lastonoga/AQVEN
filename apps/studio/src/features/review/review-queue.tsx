import { useNow, useTranslations } from "use-intl"
import { Dot, Empty, Heading, Surface, Text } from "@/components/studio"
import { nodeId, runId } from "@/data/ids"
import { reviewRouteApi } from "@/lib/routes"
import { addressLabel, DEADLINE, deadlineDotLabel, deadlineDuration, deadlineState, entryKey, entryReason, entryTitle, type ReviewEntry } from "./presenters"

export type ReviewQueueProps = { readonly queue: readonly ReviewEntry[]; readonly selectedKey: string | null }

function QueueCard({ entry, selected }: { readonly entry: ReviewEntry; readonly selected: boolean }) {
  const t = useTranslations("review")
  const domain = useTranslations("domain")
  const state = deadlineState(entry.wait, useNow())
  const look = DEADLINE[state.kind]
  const branch = entry.wait.address.branch_key
  const search = { run: runId(entry.run.run_id), node: nodeId(entry.wait.address.node_id), ...(branch === null ? {} : { branch }) }
  return (
    <Surface variant="raised" padding="sm" interactive tone="llm" selected={selected} asChild>
      <reviewRouteApi.Link to="." search={search} resetScroll={false}>
        <Heading
          size="item"
          titleAs="div"
          leading={<Dot tone={look.dot} {...deadlineDotLabel(state, t)} />}
          title={entryTitle(entry, t)}
          trailing={
            <Text role="tiny" tone={look.queue}>
              {deadlineDuration(state, t)}
            </Text>
          }
          below={[
            <Text as="div" role="hint" tone="default" className="mt-1.75">
              {addressLabel(entry.wait.address)}
            </Text>,
            <Text as="div" role="body" tone="neutral" className="-mt-0.5">
              {entryReason(entry, { t, domain })}
            </Text>,
          ]}
        />
      </reviewRouteApi.Link>
    </Surface>
  )
}

export function ReviewQueue({ queue, selectedKey }: ReviewQueueProps) {
  const t = useTranslations("review")
  const common = useTranslations("common")
  if (queue.length === 0) return <Empty title={common("empty.queue")} />
  return (
    <nav aria-label={t("queue.labelAria")} className="flex flex-col gap-1.75">
      {queue.map((entry) => (
        <QueueCard key={entryKey(entry)} entry={entry} selected={entryKey(entry) === selectedKey} />
      ))}
    </nav>
  )
}
