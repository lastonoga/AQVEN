import { X } from "lucide-react"
import { useTranslations } from "use-intl"
import { Tag, Text } from "@/components/studio"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { parseTagToken, type TagFacet } from "./model"
import { TagFilterMenu } from "./tag-filter-menu"

export type CaseFilterBarProps = {
  readonly facets: readonly TagFacet[]
  readonly tags: readonly string[]
  readonly query: string
  readonly shown: number
  readonly total: number
  readonly onToggleTag: (token: string) => void
  readonly onQueryChange: (query: string) => void
  readonly onClear: () => void
}

function FilterChip({ token, onRemove }: { readonly token: string; readonly onRemove: () => void }) {
  const t = useTranslations("cases.filter")
  const pair = parseTagToken(token)
  const text = pair === null ? token : t("chip", { key: pair.key, value: pair.value })
  return (
    <Tag size="md" tone="llm" fill="soft" className="pr-1">
      {text}
      <button
        type="button"
        aria-label={t("remove", { tag: text })}
        onClick={onRemove}
        className="inline-flex size-4 items-center justify-center rounded-xs opacity-70 outline-none hover:opacity-100 focus-visible:ring-2 focus-visible:ring-ring/50"
      >
        <X aria-hidden className="size-3" />
      </button>
    </Tag>
  )
}

export function CaseFilterBar({ facets, tags, query, shown, total, onToggleTag, onQueryChange, onClear }: CaseFilterBarProps) {
  const t = useTranslations("cases.filter")
  const active = tags.length > 0 || query.trim().length > 0
  return (
    <section aria-label={t("aria")} className="flex min-w-0 flex-wrap items-center gap-2">
      <Input
        aria-label={t("search")}
        placeholder={t("search")}
        value={query}
        onChange={(event) => {
          onQueryChange(event.target.value)
        }}
        className="h-7 w-64"
      />
      {facets.length === 0 ? null : <TagFilterMenu facets={facets} tags={tags} onToggleTag={onToggleTag} />}
      {tags.map((token) => (
        <FilterChip
          key={token}
          token={token}
          onRemove={() => {
            onToggleTag(token)
          }}
        />
      ))}
      <Text role="meta" tone="neutral" className="ml-1">
        {t("shown", { shown, total })}
      </Text>
      {active ? (
        <Button type="button" size="xs" variant="ghost" onClick={onClear}>
          {t("clear")}
        </Button>
      ) : null}
    </section>
  )
}
