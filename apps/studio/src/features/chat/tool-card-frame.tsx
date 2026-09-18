import type { ReactNode } from "react"
import { useTranslations } from "use-intl"
import { DisclosureChevron, StructuredValue, Surface, Tag, Text, parseValueText } from "@/components/studio"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import type { ToolCardModel } from "./tool-card-model"

const TILE_GLYPH = "◆"

export type ToolCardFrameProps = ToolCardModel & { readonly footer?: ReactNode }

const structuredLine = (line: string): { readonly value: unknown } | null => {
  const trimmed = line.trim()
  if (!(trimmed.startsWith("{") && trimmed.endsWith("}")) && !(trimmed.startsWith("[") && trimmed.endsWith("]"))) return null
  const parsed = parseValueText(trimmed)
  return typeof parsed === "string" ? null : { value: parsed }
}

export function ToolCardFrame({ tone, title, lines, truncated, footer }: ToolCardFrameProps) {
  const t = useTranslations("chat.tool")
  const common = useTranslations("common")
  return (
    <Collapsible asChild>
      <Surface variant="well" className="overflow-hidden">
        <CollapsibleTrigger aria-label={t("toggleAria")} className="flex w-full min-w-0 items-center gap-1.75 px-2.5 py-1.75">
          <Tag tone={tone} fill="tint" shape="square" size="micro">
            {TILE_GLYPH}
          </Tag>
          <Text role="command" weight="medium" tone="default" truncate>
            {title}
          </Text>
          <span className="ml-auto flex">
            <DisclosureChevron />
          </span>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="px-2.5 pb-2.25">
            {lines.map((line, index) => {
              const value = structuredLine(line)
              return value === null ? (
                <Text key={index} as="div" role="data" tone="neutral" className="whitespace-pre-wrap">{line}</Text>
              ) : <StructuredValue key={index} value={value.value} compact />
            })}
            {truncated ? <Text as="div" role="hint" tone="warning">{common("previewOnly")}</Text> : null}
          </div>
        </CollapsibleContent>
        {footer}
      </Surface>
    </Collapsible>
  )
}
