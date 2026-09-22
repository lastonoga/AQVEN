import { Link } from "@tanstack/react-router"
import { useNow, useTranslations } from "use-intl"
import type { ApiExecutionAddress, ApiHumanWait, ApiRunError, ApiRunSnapshot, ApiValueRef } from "@/domain"
import { Heading, RUN_STATUS_TONE, Stat, StructuredValue, Surface, Tag, Text, TitledPanel, type TagSpec } from "@/components/studio"
import * as ids from "@/data/ids"
import { useRelativeTime } from "@/i18n/format"
import { joinMeta, runRef } from "@/lib/format"
import { ROUTE_PATH, runsRouteApi } from "@/lib/routes"
import { isBinaryMedia, StageTimeline, valueCell, type RowKey, type TraceRun } from "@/features/trace"
import type { BlobText } from "@/features/call-sheet"
import {
  costText,
  doneCount,
  elapsedMs,
  latencyText,
  shortHash,
  tokensText,
  totalCount,
} from "./presenters"

export type RunDetailProps = {
  readonly snapshot: ApiRunSnapshot
  readonly blobs: readonly BlobText[]
  readonly trace: TraceRun
  readonly selectedKey: string | null
  readonly onOpenCall: (address: ApiExecutionAddress, row: RowKey) => void
}

type MetricCard = {
  readonly id: string
  readonly label: string
  readonly value: string
  readonly note: string
  readonly badge: TagSpec | null
}

export function RunHeader({ snapshot }: { readonly snapshot: ApiRunSnapshot }) {
  const t = useTranslations("runs.run")
  const status = useTranslations("domain.runStatus")
  const mode = useTranslations("domain.runMode")
  const origin = useTranslations("domain.specOrigin")
  const relative = useRelativeTime("long")
  const params = runsRouteApi.useParams()
  const lineage = snapshot.lineage
  return (
    <Heading
      size="page"
      title={t("title", { ref: runRef(snapshot.run_id) })}
      tags={[
        { children: status(snapshot.status), tone: RUN_STATUS_TONE[snapshot.status] },
        { children: mode(snapshot.mode), tone: "neutral", fill: "outline" },
      ]}
      below={[
        joinMeta([
          t("startedAt", { when: relative(ids.isoDateTime(snapshot.started_at)) }),
          t("spec", { origin: origin(snapshot.spec_version.origin), hash: shortHash(snapshot.content_hash) }),
        ]),
        lineage === null ? null : (
          <Link key="lineage" to={ROUTE_PATH.runs} params={params} search={{ run: ids.runId(lineage.parent_run_id) }}>
            {t("fork", { parent: runRef(lineage.parent_run_id) })}
          </Link>
        ),
      ].filter((line) => line !== null)}
      trailing={snapshot.definition_changed ? <Tag size="sm" tone="warning">{t("changed")}</Tag> : null}
    />
  )
}

function RunMetrics({ snapshot }: { readonly snapshot: ApiRunSnapshot }) {
  const t = useTranslations("runs.metric")
  const mode = useTranslations("domain.runMode")
  const none = useTranslations("common")("none")
  const now = useNow()
  const counts = snapshot.node_counts
  const done = doneCount(counts)
  const total = totalCount(counts)
  const duration = latencyText(elapsedMs(snapshot.started_at, snapshot.finished_at, now))
  const cards: readonly MetricCard[] = [
    { id: "cost", label: t("cost"), value: costText(snapshot.cost_usd), note: mode(snapshot.mode), badge: null },
    {
      id: "duration",
      label: t("duration"),
      value: duration ?? none,
      note: snapshot.finished_at === null ? t("running") : "",
      badge: null,
    },
    {
      id: "tokens",
      label: t("tokens"),
      value: tokensText(snapshot.tokens_in, snapshot.tokens_out),
      note: t("tokensNote"),
      badge: null,
    },
    {
      id: "nodes",
      label: t("nodes"),
      value: t("nodesValue", { done, total }),
      note: counts.failed === 0 ? t("nodesNote", { done, total }) : t("failedNodes", { count: counts.failed }),
      badge: counts.failed === 0 ? null : { children: String(counts.failed), tone: "destructive" },
    },
  ]
  return (
    <div className="mb-3.5 grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-2.5">
      {cards.map((card) => (
        <Surface key={card.id} variant="raised" padding="md">
          <Stat
            variant="metric"
            label={card.label}
            value={card.value}
            note={card.note}
            {...(card.badge === null ? {} : { badge: card.badge })}
          />
        </Surface>
      ))}
    </div>
  )
}

function WaitsPanel({ waits }: { readonly waits: readonly ApiHumanWait[] }) {
  const t = useTranslations("runs.waits")
  const kind = useTranslations("domain.waitKind")
  const relative = useRelativeTime("long")
  if (waits.length === 0) return null
  return (
    <TitledPanel size="block" title={t("title")} className="mb-3.5">
      <div className="flex flex-col divide-y divide-border">
        {waits.map((wait) => (
          <div key={`${wait.address.node_id}-${String(wait.attempt)}`} className="px-2.75 py-2">
            <Text role="cell" tone="default">
              {t("row", { node: wait.address.node_id, kind: kind(wait.wait_kind), assignee: wait.assignee })}
            </Text>
            <Text as="div" role="hint" tone="neutral">
              {joinMeta([t("deadline", { when: relative(ids.isoDateTime(wait.deadline_at)) }), t("attempt", { attempt: wait.attempt })])}
            </Text>
          </div>
        ))}
      </div>
    </TitledPanel>
  )
}

function RunError({ error }: { readonly error: ApiRunError }) {
  const t = useTranslations("runs.outcome")
  return (
    <Surface variant="well" padding="md" className="mb-3.5">
      <Heading
        size="block"
        title={t("error")}
        tags={[{ children: error.code, tone: "destructive" }]}
        below={[
          error.message,
          error.address === null ? null : t("errorAt", { node: error.address.node_id }),
          typeof error.hint === "string" ? t("hintLine", { hint: error.hint }) : null,
        ].filter((line) => line !== null)}
      />
    </Surface>
  )
}

function RunOutput({ output, blobs }: { readonly output: ApiValueRef | null; readonly blobs: readonly BlobText[] }) {
  const t = useTranslations("runs.outcome")
  const common = useTranslations("common")
  const cell = valueCell(output, output?.kind === "blob" ? blobs.find((blob) => blob.blobId === output.blob_id)?.text : undefined)
  return (
    <TitledPanel size="block" title={t("output")} empty={output === null ? t("noOutput") : undefined}>
      <div className="min-w-0 p-2.5">
        {cell?.incomplete === true ? <Text as="p" role="hint" tone="warning">{common("previewOnly")}</Text> : null}
        {cell === null ? null : <StructuredValue value={isBinaryMedia(cell.ref) ? cell.ref : cell.value} media={cell.media} mediaOnly={isBinaryMedia(cell.ref)} />}
      </div>
    </TitledPanel>
  )
}

export function RunOverview({ snapshot }: { readonly snapshot: ApiRunSnapshot }) {
  return (
    <div className="min-w-0">
      <RunMetrics snapshot={snapshot} />
      <WaitsPanel waits={snapshot.waits} />
      {snapshot.error === null ? null : <RunError error={snapshot.error} />}
    </div>
  )
}

export function RunDetail({ snapshot, blobs, trace, selectedKey, onOpenCall }: RunDetailProps) {
  return (
    <div className="min-w-0">
      <StageTimeline trace={trace} selected={selectedKey} onOpenCall={onOpenCall} />
      <RunOutput output={snapshot.output_ref} blobs={blobs} />
    </div>
  )
}
