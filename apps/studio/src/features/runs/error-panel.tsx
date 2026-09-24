import { useTranslations } from "use-intl"
import type { ApiRunError } from "@/domain"
import { Surface, Tag, Text, TextBlock } from "@/components/studio"
import { joinMeta } from "@/lib/format"
import { useErrorTitle, type ErrorScope } from "./error-copy"
import { isLongMessage, oneLine, readableResponse } from "./failed-steps"

export type ErrorPanelProps = {
  readonly error: ApiRunError
  readonly scope: ErrorScope
  readonly where?: string | null
  readonly className?: string
}

type Details = NonNullable<ApiRunError["details"]>

const SCROLL_CLASS = "mt-2 max-h-80 min-w-0 overflow-auto rounded-md bg-background-subtle p-2.5 select-text"
const PANEL_MESSAGE_LIMIT = 480

function Folded({ label, text }: { readonly label: string; readonly text: string }) {
  return (
    <details className="mt-2.5 rounded-md border border-border bg-card px-2.5 py-2">
      <summary className="cursor-pointer text-xs font-medium text-muted-foreground">{label}</summary>
      <div className={SCROLL_CLASS}>
        <TextBlock text={text} variant="code" />
      </div>
    </details>
  )
}

function ErrorMessage({ message }: { readonly message: string }) {
  const t = useTranslations("runs.failure")
  if (!isLongMessage(message, PANEL_MESSAGE_LIMIT)) return <Text as="p" role="body" tone="default" className="mt-2 whitespace-pre-wrap">{message}</Text>
  return (
    <>
      <Text as="p" role="body" tone="default" className="mt-2">{oneLine(message, PANEL_MESSAGE_LIMIT)}</Text>
      <Folded label={t("fullMessage")} text={message} />
    </>
  )
}

function ProviderFacts({ details }: { readonly details: Details | null }) {
  const t = useTranslations("runs.failure")
  if (details === null) return null
  const status = details.status_code ?? null
  const facts = joinMeta([details.model, details.provider, status === null ? null : t("http", { status }), details.provider_code])
  if (facts.length === 0) return null
  return <Text as="p" role="cell" tone="neutral" className="mt-2 break-all">{facts}</Text>
}

function ProviderResponse({ text }: { readonly text: string | null }) {
  const t = useTranslations("runs.failure")
  if (text === null || text.length === 0) return null
  return <Folded label={t("providerResponse")} text={readableResponse(text)} />
}

export function ErrorPanel({ error, scope, where = null, className }: ErrorPanelProps) {
  const t = useTranslations("runs.failure")
  const title = useErrorTitle()(error.code, scope)
  const details = error.details ?? null
  const hint = error.hint ?? null
  return (
    <Surface variant="callout" tone="destructive" padding="md" role="group" aria-label={title} className={className}>
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <Text as="h3" role="block" weight="semibold">{title}</Text>
        <Tag size="sm" tone="destructive" fill="outline">{error.code}</Tag>
      </div>
      {where === null ? null : <Text as="p" role="cell" weight="medium" className="mt-2 break-all">{where}</Text>}
      <ErrorMessage message={error.message} />
      {hint === null ? null : <Text as="p" role="hint" tone="default" className="mt-2 break-words">{t("hint", { hint })}</Text>}
      <ProviderFacts details={details} />
      <ProviderResponse text={details?.provider_response ?? null} />
    </Surface>
  )
}
