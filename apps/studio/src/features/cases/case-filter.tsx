import { useTranslations } from "use-intl"
import { Tag, Text } from "@/components/studio"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { tagToken, type TagFacet } from "./model"

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

type FacetGroupProps = {
  readonly facet: TagFacet
  readonly tags: readonly string[]
  readonly onToggleTag: (token: string) => void
}

function FacetGroup({ facet, tags, onToggleTag }: FacetGroupProps) {
  const t = useTranslations("cases.filter")
  return (
    <div role="group" aria-label={t("tagsAria", { key: facet.key })} className="flex min-w-0 flex-wrap items-center gap-1">
      <Text role="cell" tone="neutral" className="mr-0.5">{facet.key}</Text>
      {facet.values.map(({ value, count }) => {
        const token = tagToken(facet.key, value)
        const pressed = tags.includes(token)
        return (
          <Tag key={value} asChild interactive size="md" tone={pressed ? "llm" : "neutral"} fill={pressed ? "soft" : "outline"} detail={count}>
            <button
              type="button"
              aria-pressed={pressed}
              aria-label={t("tagChip", { tag: token, count })}
              onClick={() => {
                onToggleTag(token)
              }}
            >
              {value}
            </button>
          </Tag>
        )
      })}
    </div>
  )
}

export function CaseFilterBar({ facets, tags, query, shown, total, onToggleTag, onQueryChange, onClear }: CaseFilterBarProps) {
  const t = useTranslations("cases.filter")
  const active = tags.length > 0 || query.trim().length > 0
  return (
    <section aria-label={t("aria")} className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2.5">
        <Input
          aria-label={t("search")}
          placeholder={t("search")}
          value={query}
          onChange={(event) => {
            onQueryChange(event.target.value)
          }}
          className="h-7 w-64"
        />
        <Text role="meta" tone="neutral">{t("shown", { shown, total })}</Text>
        {active ? <Button type="button" size="xs" variant="ghost" onClick={onClear}>{t("clear")}</Button> : null}
      </div>
      {facets.length === 0 ? null : (
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5">
          {facets.map((facet) => (
            <FacetGroup key={facet.key} facet={facet} tags={tags} onToggleTag={onToggleTag} />
          ))}
        </div>
      )}
    </section>
  )
}
