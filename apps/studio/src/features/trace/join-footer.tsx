import type { JoinResult } from "@/domain"
import { Actions, Surface, Text, Toolbar } from "@/components/studio"
import { useRichTags } from "@/i18n/format"
import { score } from "@/lib/format"
import type { Translator } from "@/i18n/translator"
import { droppedText } from "./join"

export type JoinFooterProps = { readonly join: JoinResult; readonly outputs: number; readonly t: Translator }

export function JoinFooter({ join, outputs, t }: JoinFooterProps) {
  const tags = useRichTags()
  const compare = <Actions actions={[{ id: "compare", label: t("trace.join.compareOutputs", { count: outputs }) }]} />
  return (
    <Surface variant="footer" asChild>
      <Toolbar size="sm" wrap end={compare}>
        <Text role="caption" weight="medium" tone="neutral">
          {t("trace.join.label")}
        </Text>
        <Text role="meta" tone="default">
          {t.rich("trace.join.selected", { branch: join.selected, score: score(join.score), code: tags.code })}
          {droppedText(join, t)}
        </Text>
      </Toolbar>
    </Surface>
  )
}
