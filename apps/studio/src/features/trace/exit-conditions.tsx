import type { ExitSummary } from "@/domain"
import { Dot, Surface, Tag, Text, Toolbar } from "@/components/studio"
import type { Translator } from "@/i18n/translator"
import { exitChips } from "./exit-condition"

export type ExitConditionsProps = { readonly exit: ExitSummary; readonly t: Translator }

export function ExitConditions({ exit, t }: ExitConditionsProps) {
  const note = exit.note === undefined ? null : <Text role="meta" tone="neutral">{exit.note}</Text>
  return (
    <Surface variant="footer" asChild>
      <Toolbar size="sm" wrap end={note}>
        <Text role="caption" weight="medium" tone="neutral">
          {t("domain.exit.title")}
        </Text>
        {exitChips(exit, t).map((chip) => (
          <Tag key={chip.key} size="md" tone={chip.tone} fill={chip.fill} leading={<Dot tone={chip.tone} hollow={!chip.fired} size="xs" />}>
            {chip.label}
          </Tag>
        ))}
      </Toolbar>
    </Surface>
  )
}
