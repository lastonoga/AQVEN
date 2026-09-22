import { Tag, Text } from "@/components/studio"
import type { Translator } from "@/i18n/translator"
import type { AttemptLadder, AttemptRow } from "./model"

export type AttemptsLadderProps = { readonly ladder: AttemptLadder; readonly t: Translator }

function AttemptField({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className="grid min-w-0 gap-x-4 gap-y-0.5 py-1 sm:grid-cols-[112px_minmax(0,1fr)]">
      <dt className="font-mono text-xs text-muted-foreground">{label}</dt>
      <dd className="min-w-0 whitespace-pre-wrap wrap-anywhere text-sm text-foreground">{value}</dd>
    </div>
  )
}

function AttemptEntry({ row, t }: { readonly row: AttemptRow; readonly t: Translator }) {
  return (
    <li className="min-w-0 border-t border-border px-3 py-2.5 first:border-t-0">
      <div className="mb-1.5 flex flex-wrap items-center gap-2">
        <Text role="small" weight="semibold">{t("trace.attempts.attempt")} {row.attempt}</Text>
        <Tag size="xs" tone="destructive">{row.code ?? row.kind}</Tag>
      </div>
      <dl>
        <AttemptField label={t("trace.attempts.cause")} value={row.kind} />
        <AttemptField label={t("trace.attempts.action")} value={row.action} />
        <AttemptField label={t("trace.attempts.message")} value={row.message} />
        {row.hint === null ? null : <AttemptField label={t("trace.attempts.hint")} value={row.hint} />}
        {row.rawExcerpt === null ? null : <AttemptField label={t("trace.attempts.rawExcerpt")} value={row.rawExcerpt} />}
        {row.problems.length === 0 ? null : (
          <AttemptField
            label={t("trace.attempts.problems")}
            value={row.problems.map((problem) => `${problem.path.join(".")}: ${problem.message}`).join("\n")}
          />
        )}
      </dl>
    </li>
  )
}

export function AttemptsLadder({ ladder, t }: AttemptsLadderProps) {
  return (
    <section className="border-t border-border">
      <Text as="h4" role="column" tone="neutral" className="px-3 pt-2.5 pb-1.5">
        {t("trace.attempts.title", { name: ladder.callLabel, count: ladder.attempts.length })}
      </Text>
      <ol aria-label={t("trace.attempts.aria", { name: ladder.callLabel })} className="mx-2 mb-2 rounded-lg border border-border bg-background">
        {ladder.attempts.map((row, index) => (
          <AttemptEntry key={`${ladder.columnId}-${String(row.attempt)}-${String(index)}`} row={row} t={t} />
        ))}
      </ol>
    </section>
  )
}
