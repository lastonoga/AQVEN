import type { ReactNode } from "react"
import { cva } from "class-variance-authority"
import { cn } from "cn"
import { Empty } from "./empty"
import { Heading } from "./heading"
import { hasContent } from "./rich"
import { Surface } from "./surface"

export type TitledPanelSize = "section" | "block"

export type TitledPanelProps = {
  readonly size: TitledPanelSize
  readonly title: ReactNode
  readonly description?: ReactNode
  readonly below?: readonly ReactNode[]
  readonly trailing?: ReactNode
  readonly surface?: "panel" | "raised"
  readonly scroll?: boolean
  readonly empty?: ReactNode
  readonly className?: string
  readonly children: ReactNode
}

const NO_LINES: readonly ReactNode[] = []

const BODY_GAP: Readonly<Record<TitledPanelSize, string>> = {
  section: "mt-1.5",
  block: "mt-1.75",
}

const panelBodyVariants = cva("", {
  variants: {
    scroll: {
      true: "overflow-x-auto",
      false: "overflow-hidden",
    },
  },
})

type PanelBodyProps = {
  readonly surface: "panel" | "raised"
  readonly scroll: boolean
  readonly empty: ReactNode
  readonly children: ReactNode
}

function PanelBody({ surface, scroll, empty, children }: PanelBodyProps) {
  if (hasContent(empty)) return <Empty title={empty} />
  return (
    <Surface variant={surface} className={panelBodyVariants({ scroll })}>
      {children}
    </Surface>
  )
}

export function TitledPanel({ size, title, description, below = NO_LINES, trailing, surface = "panel", scroll = false, empty, className, children }: TitledPanelProps) {
  return (
    <section className={className}>
      <Heading size={size} title={title} description={description} below={below} trailing={trailing} />
      <div className={cn(BODY_GAP[size])}>
        <PanelBody surface={surface} scroll={scroll} empty={empty}>
          {children}
        </PanelBody>
      </div>
    </section>
  )
}
