import { useTranslations } from "use-intl"
import { DisclosureChevron, Rich, Surface, Tag, Text, Toolbar } from "@/components/studio"
import { Button } from "@/components/ui/button"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import type { ToolCardModel } from "./tool-card-model"

const TILE_GLYPH = "◆"

export function ToolCardFrame({ tone, title, lines, actions }: ToolCardModel<"card">) {
  const t = useTranslations("chat.tool")
  return (
    <Collapsible defaultOpen asChild>
      <Surface variant="well" className="overflow-hidden">
        <CollapsibleTrigger aria-label={t("toggleAria")} className="flex w-full min-w-0 items-center gap-1.75 px-2.5 py-1.75">
          <Tag tone={tone} fill="tint" shape="square" size="micro">
            {TILE_GLYPH}
          </Tag>
          <Text role="command" weight="medium" tone="default" truncate>
            <Rich value={title} />
          </Text>
          <span className="ml-auto flex">
            <DisclosureChevron />
          </span>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="px-2.5 pb-2.25">
            {lines.map((line, index) => (
              <Text key={index} as="div" role="data" tone="neutral">
                <Rich value={line} />
              </Text>
            ))}
          </div>
          {actions.length === 0 ? null : (
            <Surface variant="footer" asChild>
              <Toolbar size="sm" wrap>
                {actions.map((action) => (
                  <Button key={action.label} variant="outline" size="xs" disabled={action.disabled} onClick={action.run}>
                    {action.label}
                  </Button>
                ))}
              </Toolbar>
            </Surface>
          )}
        </CollapsibleContent>
      </Surface>
    </Collapsible>
  )
}
