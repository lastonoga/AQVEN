import { useState } from "react"
import { GitCompareArrows } from "lucide-react"
import { useNow, useTranslations } from "use-intl"
import type { ApiRun, RunId } from "@/domain"
import { PickerCommand, PickerCount } from "@/components/studio"
import { Button } from "@/components/ui/button"
import { CommandEmpty, CommandInput, CommandList } from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { runRef } from "@/lib/format"
import { runRows } from "./presenters"
import { RunOption } from "./runs-strip"

export type ComparePickerProps = {
  readonly runs: readonly ApiRun[]
  readonly current: RunId
  readonly compare: RunId | null
  readonly onChoose: (runId: RunId) => void
}

export function ComparePicker({ runs, current, compare, onChoose }: ComparePickerProps) {
  const t = useTranslations("runs.compare")
  const now = useNow()
  const [open, setOpen] = useState(false)
  const others = runs.filter((run) => run.run_id !== current)
  const rows = runRows(others, compare, now)
  const label = compare === null ? t("open") : t("change", { ref: runRef(compare) })
  const choose = (runId: RunId): void => {
    setOpen(false)
    onChoose(runId)
  }
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" size="sm" role="combobox" aria-label={label} aria-expanded={open} disabled={others.length === 0}>
          <GitCompareArrows aria-hidden />
          {label}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="dark w-[28rem] max-w-[calc(100vw-2rem)] gap-0 p-1">
        <PickerCommand label={t("search")} filter={(value, search) => (value.toLowerCase().includes(search.toLowerCase()) ? 1 : 0)}>
          <CommandInput placeholder={t("search")} />
          <PickerCount>{t("count", { count: others.length })}</PickerCount>
          <CommandList label={t("listAria")} className="max-h-[min(60vh,32rem)]">
            <CommandEmpty>{t("noMatches")}</CommandEmpty>
            {rows.map((row) => <RunOption key={row.id} row={row} onSelect={choose} />)}
          </CommandList>
        </PickerCommand>
      </PopoverContent>
    </Popover>
  )
}
