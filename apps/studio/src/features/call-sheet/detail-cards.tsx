import type { ReactNode } from "react"
import { useTranslations } from "use-intl"
import type { ApiExecutionDetail } from "@/domain"
import { Surface, Tag } from "@/components/studio"
import { schemaFields } from "@/features/nodes"
import { schemaEnums } from "./schema-enums"

export function SchemaCard({ schema, raw, source, showAllowedValues = false, fieldTypes = {}, fieldDescriptions = {}, fieldDetails = {} }: { readonly schema: unknown; readonly raw: boolean; readonly source?: ApiExecutionDetail["schema_source"]; readonly showAllowedValues?: boolean; readonly fieldTypes?: Readonly<Record<string, string>>; readonly fieldDescriptions?: Readonly<Record<string, string>>; readonly fieldDetails?: Readonly<Record<string, ReactNode>> }) {
  const t = useTranslations("callSheet")
  const notice = source === "current" ? <p className="mb-2 text-[11px] text-muted-foreground">{t("schema.currentNotice")}</p> : null
  if (schema === null || schema === undefined) {
    return <Surface variant="well" padding="sm" className="text-xs text-muted-foreground">{t("schema.unavailable")}</Surface>
  }
  if (raw) {
    return <div>{notice}<Surface variant="well" padding="sm"><pre className="whitespace-pre-wrap break-all font-mono text-[11px] leading-relaxed">{JSON.stringify(schema, null, 2)}</pre></Surface></div>
  }
  const fields = schemaFields(schema)
  const enums = showAllowedValues ? schemaEnums(schema) : []
  if (fields.length === 0) {
    return <div>{notice}<Surface variant="well" padding="sm" className="font-mono text-xs">{t("schema.type", { type: typeof schema === "object" && "type" in schema ? String(schema.type) : "any" })}</Surface></div>
  }
  const fieldRow = (field: (typeof fields)[number]) => (
          <li key={field.name} className="px-3 py-2.5">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="font-mono text-xs font-semibold text-foreground">{field.name}</span>
              <span className="font-mono text-[11px] text-muted-foreground">{fieldTypes[field.name] ?? field.typeLabel}</span>
              {field.required ? <Tag size="micro" tone="primary">{t("schema.required")}</Tag> : null}
            </div>
            {fieldDescriptions[field.name] ?? field.description ? <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{fieldDescriptions[field.name] ?? field.description}</p> : null}
            {fieldDetails[field.name]}
            {enums.filter((item) => item.path === field.name || item.path.startsWith(`${field.name}.`) || item.path.startsWith(`${field.name}[]`)).map((item) => (
              <div key={item.path} className="mt-2 space-y-1.5">
                <p className="font-mono text-[11px] font-medium text-muted-foreground">{item.path === field.name ? t("schema.allowedValues") : item.path}</p>
                <div className="flex flex-wrap gap-1">{item.values.map((value) => <Tag key={value} size="micro" tone="neutral">{value}</Tag>)}</div>
              </div>
            ))}
          </li>
  )
  return (
    <div>{notice}<Surface variant="panel" className="overflow-hidden">
      <ul className="divide-y divide-border" aria-label={t("schema.fields")}>
        {fields.map(fieldRow)}
      </ul>
    </Surface></div>
  )
}

type PromptTrace = NonNullable<ApiExecutionDetail["prompt"]>

export function PromptMessages({ prompt, raw }: { readonly prompt: PromptTrace | null; readonly raw: boolean }) {
  const t = useTranslations("callSheet")
  if (prompt === null) return <Surface variant="well" padding="sm" className="text-xs text-muted-foreground">{t("prompt.notCaptured")}</Surface>
  if (raw) return <Surface variant="well" padding="sm"><pre className="whitespace-pre-wrap break-all font-mono text-[11px] leading-relaxed">{JSON.stringify(prompt, null, 2)}</pre></Surface>
  return (
    <div className="space-y-2">
      <ol aria-label={t("prompt.timeline")}>
        {prompt.messages.map((message, index) => (
          <li key={index} className="grid grid-cols-[1.75rem_minmax(0,1fr)] gap-3">
            <div className="flex flex-col items-center">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full border border-border bg-card font-mono text-[10px] font-semibold text-foreground">{String(index + 1).padStart(2, "0")}</span>
              {index + 1 < prompt.messages.length ? <span aria-hidden="true" className="my-1 min-h-3 w-px flex-1 bg-border" /> : null}
            </div>
            <Surface variant="panel" padding="sm" className="mb-3 min-w-0">
              <div className="mb-2 border-b border-border pb-2">
                <Tag size="sm" tone={message.role === "assistant" ? "primary" : "neutral"}>{message.role}</Tag>
              </div>
              <div className="space-y-2">
                {message.parts.map((part, partIndex) => part.kind === "text" ? (
                  <p key={partIndex} className="whitespace-pre-wrap wrap-anywhere text-xs leading-[1.55] text-foreground">{part.text}</p>
                ) : (
                  <div key={partIndex} className="rounded-md bg-background-subtle px-2.5 py-2 text-xs text-muted-foreground">
                    {part.media?.name ?? part.kind} · {part.media?.$media ?? part.kind}
                  </div>
                ))}
              </div>
            </Surface>
          </li>
        ))}
      </ol>
      {Object.keys(prompt.variants).length > 0 ? (
        <p className="text-[11px] text-muted-foreground">{t("prompt.variants")}: {Object.entries(prompt.variants).map(([name, value]) => `${name}: ${value}`).join(" · ")}</p>
      ) : null}
    </div>
  )
}

export function CheckCards({ checks }: { readonly checks: ApiExecutionDetail["checks"] }) {
  const t = useTranslations("callSheet")
  if (checks.length === 0) return <Surface variant="well" padding="sm" className="text-xs text-muted-foreground">{t("checks.noneRecorded")}</Surface>
  return (
    <div className="space-y-2">
      {checks.map((check, index) => (
        <Surface key={`${check.check}-${String(check.attempt)}-${String(index)}`} variant="panel" padding="sm" tone={check.passed ? "success" : "destructive"} accent="left-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="min-w-0 break-all font-mono text-xs font-semibold">{check.check}</span>
            <Tag tone={check.passed ? "success" : "destructive"} size="sm" fill="tint">{t(check.passed ? "checks.true" : "checks.false")}</Tag>
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">{t("checks.attempt", { attempt: check.attempt })} · {t("checks.onFail", { policy: check.on_fail })}</p>
          {check.feedback ? <p className="mt-2 whitespace-pre-wrap text-xs leading-relaxed">{check.feedback}</p> : null}
        </Surface>
      ))}
    </div>
  )
}
