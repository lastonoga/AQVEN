import type { ReactNode } from "react"
import type { Binding, BindingSource } from "@/domain"
import { Tag, Text, type MatrixField } from "@/components/studio"
import { noop } from "@/lib/noop"
import { BINDING_SOURCE_TONE } from "./presets"
import { inputLabel, typeLabel } from "./presenters"

export const BINDING_COLUMNS = ["input", "type", "source", "resolver", "lastRun"] as const

export type BindingColumn = (typeof BINDING_COLUMNS)[number]

export type BindingCopy = {
  readonly column: (column: BindingColumn) => string
  readonly source: (source: BindingSource) => string
}

type BindingCell = (binding: Binding, copy: BindingCopy) => ReactNode

const BINDING_TRACK: Readonly<Record<BindingColumn, string>> = {
  input: "150px",
  type: "120px",
  source: "minmax(150px,.8fr)",
  resolver: "minmax(250px,1.3fr)",
  lastRun: "minmax(160px,.9fr)",
}

const BINDING_CELL: Readonly<Record<BindingColumn, BindingCell>> = {
  input: (binding) => (
    <Text role="body" tone="default" weight="semibold">
      {inputLabel(binding)}
    </Text>
  ),
  type: (binding) => (
    <Text role="data" tone="neutral">
      {typeLabel(binding)}
    </Text>
  ),
  source: (binding, copy) => (
    <Tag tone={BINDING_SOURCE_TONE} size="md" wrap interactive asChild>
      <button type="button" onClick={noop}>
        {copy.source(binding.source)}
      </button>
    </Tag>
  ),
  resolver: (binding) => (
    <Text role="data" tone="default">
      {binding.resolver}
    </Text>
  ),
  lastRun: (binding) => (
    <Text role="caption" tone="neutral">
      {binding.lastRun}
    </Text>
  ),
}

export const bindingFields = (copy: BindingCopy): readonly MatrixField<Binding>[] =>
  BINDING_COLUMNS.map((column) => ({
    id: column,
    label: copy.column(column),
    track: BINDING_TRACK[column],
    render: (binding: Binding) => BINDING_CELL[column](binding, copy),
  }))
