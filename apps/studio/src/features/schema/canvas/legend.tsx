import { useTranslations } from "use-intl"
import { Expander, Rich, Surface, Text } from "@/components/studio"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { legendRows } from "./legend-rows"

export type LegendProps = { readonly open: boolean; readonly onToggle: () => void }

const LEGEND_ID = "schema-legend"

export function Legend({ open, onToggle }: LegendProps) {
  const t = useTranslations()
  const rows = legendRows({
    allBranches: t("schema.legend.allBranches"),
    oneBranch: t("schema.legend.oneBranch"),
    loopBackEdge: t("schema.legend.loopBackEdge"),
    map: t("schema.legend.map"),
    provenance: (kind) => t(`domain.provenance.${kind}`),
  })
  return (
    <Collapsible open={open} onOpenChange={onToggle} className="flex flex-col items-end gap-1.75">
      <CollapsibleTrigger asChild>
        <Expander open={open} marker="triangle" label={t("schema.legend.toggle")} controls={LEGEND_ID} />
      </CollapsibleTrigger>
      <CollapsibleContent id={LEGEND_ID}>
        <Surface variant="popover" padding="sm" className="px-3.75">
          <Text as="div" role="hint" weight="medium" tone="neutral" className="mb-1">
            {t("schema.legend.title")}
          </Text>
          <div className="grid grid-cols-[auto_auto] gap-x-6 gap-y-1">
            {rows.map((row, index) => (
              <Text key={index} as="div" role="cell" tone="default">
                <Rich value={row} />
              </Text>
            ))}
          </div>
        </Surface>
      </CollapsibleContent>
    </Collapsible>
  )
}
