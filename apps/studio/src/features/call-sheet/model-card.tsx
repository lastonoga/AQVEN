import { useTranslations } from "use-intl"
import type { ApiExecutionDetail } from "@/domain"
import { EXECUTION_STATUS_TONE, Surface, Tag } from "@/components/studio"
import { ErrorPanel } from "@/features/runs"
import { tokensPair, usd } from "@/lib/format"

const decimal = (value: string): number => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function Metric({ label, value, note }: { readonly label: string; readonly value: string; readonly note?: string }) {
  return (
    <Surface variant="well" padding="sm" className="min-w-0">
      <p className="text-[10px] font-semibold uppercase tracking-[.1em] text-muted-foreground">{label}</p>
      <p className="mt-1 break-all font-mono text-lg leading-tight text-foreground">{value}</p>
      {note ? <p className="mt-1 text-[11px] text-muted-foreground">{note}</p> : null}
    </Surface>
  )
}

export function ModelCard({ execution }: { readonly execution: ApiExecutionDetail }) {
  const t = useTranslations("callSheet")
  const status = useTranslations("domain.executionStatus")
  const model = execution.model
  const colon = model?.indexOf(":") ?? -1
  const provider = colon > 0 ? model?.slice(0, colon) : null
  const name = colon > 0 ? model?.slice(colon + 1) : model
  const detail = [
    [t("field.node"), execution.address.node_id],
    [t("field.branch"), execution.address.branch_key],
    [t("field.iteration"), execution.address.iteration],
    [t("field.item"), execution.address.item_index],
    [t("field.startedAt"), execution.started_at],
    [t("field.finishedAt"), execution.finished_at],
    [t("field.traceId"), execution.trace_id],
    [t("field.spanId"), execution.span_id],
  ].filter((entry) => entry[1] !== null)

  return (
    <div className="space-y-3" aria-label={t("model.section")}>
      {execution.error === null ? null : <ErrorPanel error={execution.error} scope="step" />}
      <Surface variant="panel" padding="md" className="min-w-0">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[.12em] text-muted-foreground">{provider ?? t("model.section")}</p>
            <h3 className="mt-1 break-all font-mono text-[15px] font-semibold leading-snug text-foreground">{name ?? t("model.noModel")}</h3>
            {execution.agent || execution.inference ? (
              <p className="mt-2 text-xs text-muted-foreground">
                {[execution.agent, execution.inference].filter(Boolean).join(" · ")}
              </p>
            ) : null}
          </div>
          <Tag size="sm" tone={EXECUTION_STATUS_TONE[execution.status]} fill="tint">{status(execution.status)}</Tag>
        </div>
        {execution.summary ? <p className="mt-3 border-t border-border pt-3 text-xs leading-relaxed">{execution.summary}</p> : null}
      </Surface>
      <div className="grid grid-cols-2 gap-2">
        <Metric label={t("field.cost")} value={usd(decimal(execution.cost_usd))} />
        <Metric label={t("field.latency")} value={execution.latency_ms === null ? "—" : `${String(execution.latency_ms)} ms`} />
        <Metric label={t("field.tokens")} value={tokensPair(execution.tokens_in, execution.tokens_out)} />
        <Metric label={t("field.attempts")} value={String(execution.attempts_count)} />
      </div>
      {execution.cache_hit || execution.degraded || execution.profile ? (
        <div className="flex flex-wrap gap-2">
          {execution.cache_hit ? <Tag tone="primary" size="sm">{t("field.cacheHit")}</Tag> : null}
          {execution.degraded ? <Tag tone="warning" size="sm">{t("field.degraded")}</Tag> : null}
          {execution.profile ? <Tag tone="neutral" size="sm">{execution.profile}</Tag> : null}
        </div>
      ) : null}
      <details className="rounded-lg border border-border bg-card px-3 py-2 text-xs">
        <summary className="cursor-pointer font-medium text-muted-foreground">{t("model.technical")}</summary>
        <dl className="mt-3 space-y-2 border-t border-border pt-3">
          {detail.map(([label, value]) => (
            <div key={String(label)} className="grid grid-cols-[100px_minmax(0,1fr)] gap-2">
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="min-w-0 break-all font-mono">{String(value)}</dd>
            </div>
          ))}
        </dl>
      </details>
    </div>
  )
}
