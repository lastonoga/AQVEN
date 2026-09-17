import { useTranslations } from "use-intl"
import type { CanvasStage } from "@/domain"
import { ChoiceGroup, Surface, Text, Toolbar, type ChoiceItem } from "@/components/studio"
import { parsePositiveInt } from "@/lib/search"

export type StageRailProps = {
  readonly stages: readonly CanvasStage[]
  readonly value: number | null
  readonly onValueChange: (stage: number | null) => void
}

const stageItems = (stages: readonly CanvasStage[]): readonly ChoiceItem<string>[] =>
  stages.map((stage) => ({ value: String(stage.number), label: stage.chip }))

export function StageRail({ stages, value, onValueChange }: StageRailProps) {
  const t = useTranslations("schema.stages")
  return (
    <Surface variant="bar" asChild>
      <Toolbar size="md" scroll className="flex-none gap-1.75">
        <Text role="hint" tone="neutral" className="mr-1 shrink-0">
          {t("label")}
        </Text>
        <ChoiceGroup
          appearance="chip"
          tone="llm"
          deselectable
          label={t("label")}
          items={stageItems(stages)}
          value={value === null ? null : String(value)}
          onValueChange={(raw) => {
            onValueChange(parsePositiveInt(raw) ?? null)
          }}
        />
      </Toolbar>
    </Surface>
  )
}
