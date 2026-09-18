import { Link } from "@tanstack/react-router"
import { useTranslations } from "use-intl"
import type { ApiNode } from "@/domain"
import { Matrix, StructuredValue, Surface, Tag, Text, parseValueText, type MatrixField } from "@/components/studio"
import * as ids from "@/data/ids"
import { ROUTE_PATH } from "@/lib/routes"
import { BINDING_ORIGIN_TONE, TABLE_MIN_WIDTH } from "./presets"
import { producerId, type BindingRow, type OutputRow } from "./presenters"

type NodeLinkProps = { readonly nodeId: string; readonly label?: string }

export function NodeLink({ nodeId, label }: NodeLinkProps) {
  return (
    <Tag tone="tool" size="md" wrap interactive asChild>
      <Link from={ROUTE_PATH.nodes} to="." search={{ node: ids.nodeId(nodeId) }} resetScroll={false}>
        {label ?? nodeId}
      </Link>
    </Tag>
  )
}

export function NodeLinkRow({ nodes }: { readonly nodes: readonly ApiNode[] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {nodes.map((node) => (
        <NodeLink key={node.node_id} nodeId={node.node_id} label={node.local_id} />
      ))}
    </div>
  )
}

export function NodeIdLinks({ nodeIds }: { readonly nodeIds: readonly string[] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {nodeIds.map((nodeId) => (
        <NodeLink key={nodeId} nodeId={nodeId} />
      ))}
    </div>
  )
}

export function LabelledNodeLinks({ label, nodeIds }: { readonly label: string; readonly nodeIds: readonly string[] }) {
  if (nodeIds.length === 0) return null
  return (
    <div className="flex flex-col gap-1.5">
      <Text role="label" tone="neutral">
        {label}
      </Text>
      <NodeIdLinks nodeIds={nodeIds} />
    </div>
  )
}

function BindingSource({ row }: { readonly row: BindingRow }) {
  if (row.origin === "literal") return <StructuredValue value={parseValueText(row.source)} compact />
  const producer = row.origin === "node" ? producerId(row.source) : null
  if (producer === null)
    return (
      <Text role="data" tone="neutral">
        {row.source}
      </Text>
    )
  return (
    <Text role="data" tone="default" asChild>
      <Link from={ROUTE_PATH.nodes} to="." search={{ node: ids.nodeId(producer) }} resetScroll={false} className="underline-offset-2 hover:underline">
        {row.source}
      </Link>
    </Text>
  )
}

type BindingColumn = "slot" | "type" | "origin" | "source"

type OutputColumn = "name" | "type" | "description"

const bindingFields = (column: (id: BindingColumn) => string, origin: (id: BindingRow["origin"]) => string): readonly MatrixField<BindingRow>[] => [
  {
    id: "slot",
    label: column("slot"),
    track: "minmax(120px,.6fr)",
    render: (row) => (
      <Text role="body" weight="semibold">
        {row.slot}
      </Text>
    ),
  },
  {
    id: "type",
    label: column("type"),
    track: "minmax(110px,.5fr)",
    render: (row) => (
      <Text role="data" tone="neutral">
        {row.typeLabel}
      </Text>
    ),
  },
  {
    id: "origin",
    label: column("origin"),
    track: "110px",
    render: (row) => (
      <Tag tone={BINDING_ORIGIN_TONE[row.origin]} size="sm">
        {origin(row.origin)}
      </Tag>
    ),
  },
  {
    id: "source",
    label: column("source"),
    track: "minmax(200px,1.2fr)",
    render: (row) => <BindingSource row={row} />,
  },
]

export function BindingsBody({ rows }: { readonly rows: readonly BindingRow[] }) {
  const t = useTranslations("nodes.bindings")
  const tOrigin = useTranslations("nodes.origin")
  return (
    <Surface variant="panel" radius="lg" className="overflow-x-auto">
      <Matrix
        orientation="rows"
        label={t("title")}
        minWidth={TABLE_MIN_WIDTH}
        items={rows}
        itemKey={(row) => row.slot}
        fields={bindingFields(
          (id) => t(`column.${id}`),
          (id) => tOrigin(id),
        )}
      />
    </Surface>
  )
}

const outputFields = (column: (id: OutputColumn) => string, dynamic: string): readonly MatrixField<OutputRow>[] => [
  {
    id: "name",
    label: column("name"),
    track: "minmax(140px,.6fr)",
    render: (row) => (
      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
        <Text role="body" weight="semibold">
          {row.name}
        </Text>
        {row.dynamic ? (
          <Tag tone="warning" size="micro">
            {dynamic}
          </Tag>
        ) : null}
      </div>
    ),
  },
  {
    id: "type",
    label: column("type"),
    track: "minmax(120px,.5fr)",
    render: (row) => (
      <Text role="data" tone="neutral">
        {row.typeLabel}
      </Text>
    ),
  },
  {
    id: "description",
    label: column("description"),
    track: "minmax(220px,1.4fr)",
    render: (row) => (
      <Text role="caption" tone="neutral">
        {row.description}
      </Text>
    ),
  },
]

export function OutputsBody({ rows }: { readonly rows: readonly OutputRow[] }) {
  const t = useTranslations("nodes.outputs")
  return (
    <Surface variant="panel" radius="lg" className="overflow-x-auto">
      <Matrix
        orientation="rows"
        label={t("title")}
        minWidth={TABLE_MIN_WIDTH}
        items={rows}
        itemKey={(row) => row.name}
        fields={outputFields((id) => t(`column.${id}`), t("dynamic"))}
      />
    </Surface>
  )
}
