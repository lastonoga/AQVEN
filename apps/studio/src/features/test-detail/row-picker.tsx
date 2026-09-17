import { useState } from "react"
import { ChevronDown } from "lucide-react"
import { useTranslations } from "use-intl"
import type { DatasetRow, RowId } from "@/domain"
import { Text } from "@/components/studio"
import { Button } from "@/components/ui/button"
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { rowRef } from "@/lib/format"
import { testDetailRouteApi } from "@/lib/routes"
import { rowMatches, selectRowSearch } from "./navigation"
import { VerdictTag } from "./verdict-tag"

export type RowPickerProps = { readonly rows: readonly DatasetRow[]; readonly total: number }

export function RowPicker({ rows, total }: RowPickerProps) {
  const t = useTranslations("testDetail.navigator")
  const navigate = testDetailRouteApi.useNavigate()
  const [open, setOpen] = useState(false)
  const pick = (rowId: RowId): void => {
    setOpen(false)
    void navigate({ search: selectRowSearch(rowId), resetScroll: false })
  }
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm">
          {t("allRows", { count: total })}
          <ChevronDown aria-hidden className="size-3" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <Command filter={rowMatches}>
          <CommandInput placeholder={t("searchRows")} />
          <CommandList>
            <CommandEmpty>{t("noRows")}</CommandEmpty>
            {rows.map((row) => (
              <CommandItem
                key={row.id}
                value={rowRef(row.id)}
                keywords={row.context.slice(0, 1)}
                onSelect={() => {
                  pick(row.id)
                }}
              >
                <Text role="cell" weight="semibold" tone="default">
                  {rowRef(row.id)}
                </Text>
                <Text role="cell" tone="neutral" truncate className="grow">
                  {row.context[0]}
                </Text>
                <VerdictTag verdict={row.verdict} />
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
