import { useTranslations } from "use-intl"
import type { FilePath, Severity, WriteDiagnostic } from "@/domain"
import { Surface, Tag, Text, type Tone } from "@/components/studio"
import { Button } from "@/components/ui/button"
import { diagnosticRows, problemRows, type ReportRow, type WriteFailure } from "./write-outcome"

const SEVERITY_TONE: Readonly<Record<Severity, Tone>> = { error: "destructive", warning: "warning" }

function ReportList({ rows, label }: { readonly rows: readonly ReportRow[]; readonly label: string }) {
  const t = useTranslations("authoring.write.severity")
  return (
    <Surface variant="panel" className="overflow-hidden">
      <ul aria-label={label} className="divide-y divide-border">
        {rows.map((row) => (
          <li key={row.key} className="flex min-w-0 flex-col gap-1 px-3 py-2">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <Tag size="xs" tone={SEVERITY_TONE[row.severity]} fill="tint">
                {t(row.severity)}
              </Tag>
              <Text role="cell" tone="default" weight="semibold">
                {row.code}
              </Text>
              {row.where.length === 0 ? null : (
                <Text role="cell" tone="neutral" className="wrap-anywhere">
                  {row.where}
                </Text>
              )}
            </div>
            <Text role="hint" tone="default" className="wrap-anywhere">
              {row.message}
            </Text>
            {row.hint === null ? null : (
              <Text role="hint" tone="neutral" className="wrap-anywhere">
                {row.hint}
              </Text>
            )}
          </li>
        ))}
      </ul>
    </Surface>
  )
}

export function WrittenReport({ file, diagnostics }: { readonly file: FilePath; readonly diagnostics: readonly WriteDiagnostic[] }) {
  const t = useTranslations("authoring.write")
  if (diagnostics.length === 0) {
    return (
      <Text as="p" role="hint" tone="success" aria-live="polite">
        {t("checked", { file })}
      </Text>
    )
  }
  return <ReportList rows={diagnosticRows(diagnostics)} label={t("diagnosticsAria")} />
}

type FailureReportProps = { readonly failure: WriteFailure; readonly file: string; readonly onReload?: () => void }

function StaleNote({ file, onReload }: { readonly file: string; readonly onReload: (() => void) | undefined }) {
  const t = useTranslations("authoring.write")
  return (
    <div role="alert" className="flex min-w-0 flex-wrap items-center gap-2">
      <Text role="hint" tone="warning">
        {t("stale", { file })}
      </Text>
      {onReload === undefined ? null : (
        <Button type="button" size="xs" variant="outline" onClick={onReload}>
          {t("reload")}
        </Button>
      )}
    </div>
  )
}

export function FailureReport({ failure, file, onReload }: FailureReportProps) {
  const t = useTranslations("authoring.write")
  if (failure.kind === "stale") return <StaleNote file={file} onReload={onReload} />
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <Text as="p" role="hint" tone="destructive" className="wrap-anywhere" aria-live="assertive">
        {t(failure.kind, { reason: failure.message })}
      </Text>
      {failure.problems.length === 0 ? null : <ReportList rows={problemRows(failure.problems)} label={t("problemsAria")} />}
    </div>
  )
}
