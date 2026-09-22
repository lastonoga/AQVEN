import { useTranslations } from "use-intl"
import type { ApiNodeDetail } from "@/domain"
import { Empty, Matrix, SectionStack, Surface, Tag, Text, ValueDisplayProvider, ValueModeSwitch, useValueMode, type MatrixField, type SectionSpec, type ValueMode } from "@/components/studio"
import { schemaFields, type SchemaField } from "./json-schema"
import { TABLE_MIN_WIDTH } from "./presets"

type SchemasTranslator = ReturnType<typeof useTranslations<"nodes.schemas">>

type SchemaSlot = "in" | "out" | "form"

const SCHEMA_SLOTS = ["in", "out", "form"] as const

const fieldColumns = (t: SchemasTranslator): readonly MatrixField<SchemaField>[] => [
  {
    id: "name",
    label: t("column.field"),
    track: "minmax(140px,.6fr)",
    render: (field) => (
      <Text role="body" weight="semibold">
        {field.name}
      </Text>
    ),
  },
  {
    id: "type",
    label: t("column.type"),
    track: "minmax(120px,.5fr)",
    render: (field) => (
      <Text role="data" tone="neutral">
        {field.typeLabel}
      </Text>
    ),
  },
  {
    id: "required",
    label: t("column.required"),
    track: "110px",
    render: (field) =>
      field.required ? (
        <Tag tone="primary" size="sm">
          {t("required")}
        </Tag>
      ) : null,
  },
  {
    id: "description",
    label: t("column.description"),
    track: "minmax(200px,1.2fr)",
    render: (field) => (
      <Text role="caption" tone="neutral">
        {field.description}
      </Text>
    ),
  },
]

function FieldsBody({ label, fields, t }: { readonly label: string; readonly fields: readonly SchemaField[]; readonly t: SchemasTranslator }) {
  return (
    <Surface variant="panel" radius="lg" className="overflow-x-auto">
      <Matrix
        orientation="rows"
        label={label}
        minWidth={TABLE_MIN_WIDTH}
        items={fields}
        itemKey={(field) => field.name}
        fields={fieldColumns(t)}
      />
    </Surface>
  )
}

const schemaSection = (slot: SchemaSlot, schema: unknown, t: SchemasTranslator, mode: ValueMode): readonly SectionSpec[] => {
  if (schema === null || schema === undefined) return []
  const title = t(slot)
  const fields = schemaFields(schema)
  if (mode === "json" || fields.length === 0) return [{ id: `schema-${slot}`, title, body: { kind: "value", value: schema } }]
  return [{ id: `schema-${slot}`, title, count: fields.length, body: { kind: "node", node: <FieldsBody label={title} fields={fields} t={t} /> } }]
}

const SCHEMA_VALUE: Readonly<Record<SchemaSlot, (detail: ApiNodeDetail) => unknown>> = {
  in: (detail) => detail.in_schema,
  out: (detail) => detail.out_schema,
  form: (detail) => detail.form_schema,
}

function SchemasContent({ detail }: { readonly detail: ApiNodeDetail }) {
  const t = useTranslations("nodes.schemas")
  const mode = useValueMode()
  const sections = SCHEMA_SLOTS.flatMap((slot) => schemaSection(slot, SCHEMA_VALUE[slot](detail), t, mode))
  if (sections.length === 0) return <Empty title={t("empty")} />
  return (
    <div>
      <div className="mb-3 flex justify-end"><ValueModeSwitch /></div>
      <SectionStack sections={sections} framed gap="base" />
    </div>
  )
}

export function SchemasBody({ detail }: { readonly detail: ApiNodeDetail }) {
  return <ValueDisplayProvider key={detail.node_id}><SchemasContent detail={detail} /></ValueDisplayProvider>
}
