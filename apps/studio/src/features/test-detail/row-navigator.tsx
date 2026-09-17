import { useTranslations } from "use-intl"
import type { DatasetRow } from "@/domain"
import { Surface, Tag, Text, Toolbar } from "@/components/studio"
import { Separator } from "@/components/ui/separator"
import { rowRef } from "@/lib/format"
import { NavigatorControls } from "./navigator-controls"
import { VerdictTag } from "./verdict-tag"

export type RowNavigatorProps = {
  readonly rows: readonly DatasetRow[]
  readonly row: DatasetRow | null
  readonly total: number
  readonly failures: boolean
}

type NavigatorBarProps = Omit<RowNavigatorProps, "row"> & { readonly row: DatasetRow }

function ContextChip({ text, identity }: { readonly text: string; readonly identity: boolean }) {
  return (
    <Tag size="md" fill="outline" tone={identity ? "primary" : "neutral"}>
      {text}
    </Tag>
  )
}

function NavigatorBar(props: NavigatorBarProps) {
  const t = useTranslations("testDetail.navigator")
  const { row } = props
  return (
    <Surface variant="bar" asChild>
      <Toolbar size="md" wrap end={<NavigatorControls {...props} />} className="sticky top-0 z-6 -mx-4 mb-3 gap-3.5 px-4 py-2.75">
        <div className="flex min-w-0 items-center gap-2.75">
          <Text role="label" tone="neutral">
            {t("label")}
          </Text>
          <Text role="display" weight="bold" tone="default">
            {rowRef(row.id)}
          </Text>
          <VerdictTag verdict={row.verdict} size="lg" />
        </div>
        <Separator orientation="vertical" className="h-6.5" />
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          {row.context.map((text, index) => (
            <ContextChip key={text} text={text} identity={index === 0} />
          ))}
        </div>
      </Toolbar>
    </Surface>
  )
}

export function RowNavigator({ row, ...rest }: RowNavigatorProps) {
  if (row === null) return null
  return <NavigatorBar {...rest} row={row} />
}
