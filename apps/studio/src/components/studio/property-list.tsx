import { Fragment, type ReactNode } from "react"
import { Rich, type Inline } from "./rich"
import { Text } from "./text"
import type { Tone } from "./tone"

export type PropertyRow = { readonly key: Inline; readonly value: Inline; readonly tone?: Tone }

export type PropertyListVariant = "split" | "grid"

export type PropertyListProps = { readonly rows: readonly PropertyRow[]; readonly variant?: PropertyListVariant }

type PropertyRowsProps = { readonly rows: readonly PropertyRow[] }

function SplitRows({ rows }: PropertyRowsProps) {
  return (
    <dl className="divide-y divide-border">
      {rows.map((row, index) => (
        <div key={index} className="grid grid-cols-[minmax(0,1fr)_auto] gap-2.5 px-2.75 py-2.25">
          <Text as="dt" role="hint" tone="neutral" className="wrap-anywhere">
            <Rich value={row.key} />
          </Text>
          <Text as="dd" role="cell" tone={row.tone ?? "default"} className="text-right wrap-anywhere">
            <Rich value={row.value} />
          </Text>
        </div>
      ))}
    </dl>
  )
}

function GridRows({ rows }: PropertyRowsProps) {
  return (
    <dl className="grid grid-cols-[120px_minmax(0,1fr)] gap-px bg-border">
      {rows.map((row, index) => (
        <Fragment key={index}>
          <Text as="dt" role="hint" weight="medium" tone="neutral" className="bg-muted px-2.5 py-2">
            <Rich value={row.key} />
          </Text>
          <Text as="dd" role="body" tone={row.tone ?? "default"} className="min-w-0 bg-card px-2.5 py-2">
            <Rich value={row.value} />
          </Text>
        </Fragment>
      ))}
    </dl>
  )
}

const PROPERTY_LAYOUT: Readonly<Record<PropertyListVariant, (props: PropertyRowsProps) => ReactNode>> = {
  split: SplitRows,
  grid: GridRows,
}

export function PropertyList({ rows, variant = "split" }: PropertyListProps) {
  const Layout = PROPERTY_LAYOUT[variant]
  return <Layout rows={rows} />
}
