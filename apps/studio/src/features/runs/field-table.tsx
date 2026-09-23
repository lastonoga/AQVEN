import type { ReactNode } from "react"
import { Matrix, NO_PAINT, Tag, Text, type CellPaint, type MatrixField, type Tone } from "@/components/studio"

export type FieldTableRow = {
  readonly id: string
  readonly label: ReactNode
  readonly left: ReactNode
  readonly right: ReactNode
  readonly leftTone?: Tone
  readonly rightTone?: Tone
  readonly state?: { readonly label: string; readonly tone: Tone }
}

export type FieldTableHeads = { readonly label: string; readonly left: string; readonly right: string; readonly state?: string }

export type FieldTableProps = {
  readonly label: string
  readonly heads: FieldTableHeads
  readonly rows: readonly FieldTableRow[]
}

const LABEL_TRACK = "minmax(9rem,0.55fr)"
const STATE_TRACK = "6.5rem"

const paintOf = (tone: Tone | undefined): CellPaint => (tone === undefined ? NO_PAINT : { surface: tone })

export function FieldText({ value, absent }: { readonly value: string | null; readonly absent: string }) {
  if (value === null) return <Text role="caption" tone="neutral">{absent}</Text>
  return <Text as="div" role="data" className="whitespace-pre-wrap">{value}</Text>
}

const baseFields = (heads: FieldTableHeads): readonly MatrixField<FieldTableRow>[] => [
  { id: "label", label: heads.label, track: LABEL_TRACK, render: (row) => <Text as="div" role="data" weight="medium">{row.label}</Text> },
  { id: "left", label: heads.left, paint: (row) => paintOf(row.leftTone), render: (row) => row.left },
  { id: "right", label: heads.right, paint: (row) => paintOf(row.rightTone), render: (row) => row.right },
]

const stateField = (label: string): MatrixField<FieldTableRow> => ({
  id: "state",
  label,
  track: STATE_TRACK,
  render: (row) => (row.state === undefined ? null : <Tag size="sm" tone={row.state.tone} fill="tint">{row.state.label}</Tag>),
})

export function FieldTable({ label, heads, rows }: FieldTableProps) {
  const fields = heads.state === undefined ? baseFields(heads) : [...baseFields(heads), stateField(heads.state)]
  return <Matrix orientation="rows" label={label} items={rows} itemKey={(row) => row.id} fields={fields} />
}
