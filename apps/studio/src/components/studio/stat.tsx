import type { ReactNode } from "react"
import { cn } from "cn"
import { ArrowDown, ArrowUp, type LucideIcon } from "lucide-react"
import { hasContent } from "./rich"
import { Tag, type TagSpec } from "./tag"
import { Text } from "./text"
import type { Tone } from "./tone"

export type StatArrow = "up" | "down"
export type StatBar = { readonly value: number; readonly tone: Tone }
export type StatVariant = "metric" | "stacked" | "meter"

export type StatProps = {
  readonly variant: StatVariant
  readonly label?: ReactNode
  readonly badge?: TagSpec & { readonly arrow?: StatArrow }
  readonly value: ReactNode
  readonly trail?: ReactNode
  readonly bar?: StatBar
  readonly note?: ReactNode
  readonly hint?: ReactNode
}

export type MeterProps = {
  readonly value: number
  readonly tone: Tone
  readonly track?: "border" | "muted"
  readonly label?: string
  readonly className?: string
}

const ARROW_ICON: Readonly<Record<StatArrow, LucideIcon>> = {
  up: ArrowUp,
  down: ArrowDown,
}

const TRACK: Readonly<Record<NonNullable<MeterProps["track"]>, string>> = {
  border: "bg-border",
  muted: "bg-muted",
}

const meterWidth = (value: number): string => `${String(Math.round(Math.min(1, Math.max(0, value)) * 100))}%`

export function Meter({ value, tone, track = "border", label, className }: MeterProps) {
  return (
    <div
      role="meter"
      aria-valuemin={0}
      aria-valuemax={1}
      aria-valuenow={value}
      aria-label={label}
      className={cn("h-1 overflow-hidden rounded-xs", TRACK[track], className)}
    >
      <div data-tone={tone} className="h-full rounded-xs bg-tone" style={{ width: meterWidth(value) }} />
    </div>
  )
}

function StatBadge({ badge }: { readonly badge: NonNullable<StatProps["badge"]> }) {
  const { arrow, leading, ...tag } = badge
  const Arrow = arrow === undefined ? undefined : ARROW_ICON[arrow]
  const icon = Arrow === undefined ? leading : <Arrow aria-hidden className="size-3 stroke-[2.2]" />
  return <Tag size="md" shape="pill" className="ml-auto" leading={icon} {...tag} />
}

function MetricStat({ label, badge, value, note, hint }: StatProps) {
  return (
    <div className="flex min-w-0 flex-col gap-1.75">
      <div className="flex items-start gap-2.5">
        <Text role="prose" tone="neutral" className="leading-[1.2]">
          {label}
        </Text>
        {badge === undefined ? null : <StatBadge badge={badge} />}
      </div>
      <Text role="display" weight="semibold">
        {value}
      </Text>
      {hasContent(note) ? (
        <Text role="meta" weight="medium">
          {note}
        </Text>
      ) : null}
      {hasContent(hint) ? (
        <Text role="hint" tone="neutral">
          {hint}
        </Text>
      ) : null}
    </div>
  )
}

function StackedStat({ label, value }: StatProps) {
  return (
    <div className="flex flex-col gap-0.75">
      <Text role="hint" tone="neutral" className="leading-none">
        {label}
      </Text>
      <Text role="item" weight="semibold">
        {value}
      </Text>
    </div>
  )
}

function MeterStat({ value, trail, bar, note }: StatProps) {
  return (
    <div className="min-w-0">
      <div className="flex items-baseline gap-1.5">
        <Text role="entity" weight="semibold" className="leading-none">
          {value}
        </Text>
        {hasContent(trail) ? <Text role="small">{trail}</Text> : null}
      </div>
      {bar === undefined ? null : <Meter value={bar.value} tone={bar.tone} className="mt-1.5" />}
      {hasContent(note) ? (
        <Text role="tiny" as="div" className="mt-1.25 leading-[1.4]">
          {note}
        </Text>
      ) : null}
    </div>
  )
}

const STAT_VIEW: Readonly<Record<StatVariant, (props: StatProps) => ReactNode>> = {
  metric: MetricStat,
  stacked: StackedStat,
  meter: MeterStat,
}

export function Stat(props: StatProps) {
  const View = STAT_VIEW[props.variant]
  return <View {...props} />
}
