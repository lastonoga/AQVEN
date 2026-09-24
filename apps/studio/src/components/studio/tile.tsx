import { useId, type ReactNode } from "react"
import { cn } from "cn"
import { hasContent } from "./rich"
import { Surface } from "./surface"
import { Text, type TextTone } from "./text"

export type TileVariant = "panel" | "well"

export type TileProps = {
  readonly label: string
  readonly variant?: TileVariant
  readonly className?: string
  readonly children: ReactNode
}

export type TileValueProps = {
  readonly trail?: ReactNode
  readonly title?: string | undefined
  readonly children: ReactNode
}

export type TileNoteProps = {
  readonly tone?: TextTone
  readonly title?: string | undefined
  readonly children: ReactNode
}

export function Tile({ label, variant = "panel", className, children }: TileProps) {
  const id = useId()
  return (
    <Surface variant={variant} padding="md" role="group" aria-labelledby={id} className={cn("flex min-w-0 flex-col gap-2", className)}>
      <Text id={id} role="label" tone="neutral">
        {label}
      </Text>
      {children}
    </Surface>
  )
}

export function TileValue({ trail, title, children }: TileValueProps) {
  return (
    <div className="flex min-w-0 items-baseline gap-1.5">
      <Text role="display" weight="semibold" title={title} className="min-w-0 truncate">
        {children}
      </Text>
      {hasContent(trail) ? (
        <Text role="meta" tone="neutral" className="shrink-0">
          {trail}
        </Text>
      ) : null}
    </div>
  )
}

export function TileNote({ tone = "neutral", title, children }: TileNoteProps) {
  return (
    <Text as="p" role="hint" tone={tone} title={title}>
      {children}
    </Text>
  )
}
