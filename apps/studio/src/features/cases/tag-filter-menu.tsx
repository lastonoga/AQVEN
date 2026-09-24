import { useState } from "react"
import { Check, ChevronLeft, Plus } from "lucide-react"
import { useTranslations } from "use-intl"
import { PickerCommand, PickerOption, Text } from "@/components/studio"
import { Button } from "@/components/ui/button"
import { CommandList } from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { tagToken, type TagFacet } from "./model"

export type TagFilterMenuProps = {
  readonly facets: readonly TagFacet[]
  readonly tags: readonly string[]
  readonly onToggleTag: (token: string) => void
}

type DimensionListProps = {
  readonly facets: readonly TagFacet[]
  readonly onPick: (key: string) => void
}

type ValueListProps = {
  readonly facet: TagFacet
  readonly tags: readonly string[]
  readonly onBack: () => void
  readonly onPick: (token: string) => void
}

function DimensionList({ facets, onPick }: DimensionListProps) {
  const t = useTranslations("cases.filter")
  return (
    <PickerCommand label={t("dimensionsAria")}>
      <CommandList label={t("dimensionsAria")}>
        {facets.map((facet) => (
          <PickerOption
            key={facet.key}
            value={facet.key}
            onSelect={() => {
              onPick(facet.key)
            }}
            className="justify-between gap-3 py-1.5"
          >
            <span className="truncate font-mono">{facet.key}</span>
            <span className="shrink-0 text-xs text-muted-foreground">{t("values", { count: facet.values.length })}</span>
          </PickerOption>
        ))}
      </CommandList>
    </PickerCommand>
  )
}

function ValueList({ facet, tags, onBack, onPick }: ValueListProps) {
  const t = useTranslations("cases.filter")
  return (
    <div className="flex min-w-0 flex-col">
      <Button type="button" size="xs" variant="ghost" className="self-start" onClick={onBack}>
        <ChevronLeft aria-hidden />
        {t("back")}
      </Button>
      <PickerCommand label={t("valuesAria", { key: facet.key })}>
        <CommandList label={t("valuesAria", { key: facet.key })}>
          {facet.values.map(({ value, count }) => {
            const token = tagToken(facet.key, value)
            const chosen = tags.includes(token)
            return (
              <PickerOption
                key={value}
                value={token}
                data-checked={chosen}
                onSelect={() => {
                  onPick(token)
                }}
                className="justify-between gap-3 py-1.5"
              >
                <span className="flex min-w-0 items-center gap-1.5">
                  <Check aria-hidden className={chosen ? "size-3.5 shrink-0" : "size-3.5 shrink-0 opacity-0"} />
                  <span className="truncate font-mono">{value}</span>
                </span>
                <Text role="caption" tone="neutral" className="shrink-0">
                  {t("cases", { count })}
                </Text>
              </PickerOption>
            )
          })}
        </CommandList>
      </PickerCommand>
    </div>
  )
}

export function TagFilterMenu({ facets, tags, onToggleTag }: TagFilterMenuProps) {
  const t = useTranslations("cases.filter")
  const [open, setOpen] = useState(false)
  const [dimension, setDimension] = useState<string | null>(null)
  const facet = facets.find((item) => item.key === dimension) ?? null

  const toggle = (next: boolean): void => {
    setOpen(next)
    setDimension(null)
  }

  return (
    <Popover open={open} onOpenChange={toggle}>
      <PopoverTrigger asChild>
        <Button type="button" size="xs" variant="outline" aria-expanded={open}>
          <Plus aria-hidden />
          {t("add")}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 max-w-[calc(100vw-2rem)] gap-0 p-1">
        {facet === null ? (
          <DimensionList facets={facets} onPick={setDimension} />
        ) : (
          <ValueList
            facet={facet}
            tags={tags}
            onBack={() => {
              setDimension(null)
            }}
            onPick={(token) => {
              onToggleTag(token)
              toggle(false)
            }}
          />
        )}
      </PopoverContent>
    </Popover>
  )
}
