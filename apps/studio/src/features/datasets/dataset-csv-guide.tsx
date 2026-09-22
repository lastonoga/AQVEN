import { Download } from "lucide-react"
import { useTranslations } from "use-intl"
import type { SchemaCsvTemplate, SchemaCsvTemplateField } from "@/api/schema"
import { Button } from "@/components/ui/button"

const downloadCsv = (template: SchemaCsvTemplate): void => {
  const blob = new Blob(["\uFEFF", template.csv], { type: "text/csv;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = `${template.flow_id}_dataset_example.csv`
  document.body.append(link)
  link.click()
  link.remove()
  window.setTimeout(() => { URL.revokeObjectURL(url) }, 60_000)
}

function FieldLines({ columns, fields }: { readonly columns: readonly string[]; readonly fields: ReadonlyMap<string, SchemaCsvTemplateField> }) {
  const t = useTranslations("datasets")
  return (
    <ul className="divide-y divide-border">
      {columns.map((column) => {
        const field = fields.get(column)
        return (
          <li key={column} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 py-2 first:pt-0 last:pb-0">
            <code className="break-all font-mono text-xs font-medium">{column}</code>
            <span className="text-xs text-muted-foreground">
              {field?.type ?? t("csvFieldUnknownType")}
              {field?.required ? ` · ${t("csvFieldRequired")}` : ""}
            </span>
            {field?.description ? <span className="w-full text-xs text-muted-foreground">{field.description}</span> : null}
          </li>
        )
      })}
    </ul>
  )
}

export function DatasetCsvGuide({ template }: { readonly template: SchemaCsvTemplate }) {
  const t = useTranslations("datasets")
  const fields = new Map(template.fields.map((field) => [field.column, field]))
  const contextNodes = template.nodes.filter((node) => node.context_columns.length > 0)
  const inputColumns = template.fields.filter((field) => field.kind === "input").map((field) => field.column)
  const fixtureColumns = template.fields.filter((field) => field.kind === "node_outputs").map((field) => field.column)
  const otherColumns = template.fields.filter((field) => !["name", "input", "context", "node_outputs"].includes(field.kind)).map((field) => field.column)

  return (
    <section className="rounded-lg border border-border bg-card p-4 text-sm" aria-label={t("csvFieldGuide")}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold">{t("csvFieldGuide")}</h3>
          <p className="mt-1 text-xs text-muted-foreground">{t("csvFieldGuideHelp", { count: template.fields.length })}</p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={() => { downloadCsv(template) }}>
          <Download aria-hidden className="size-3.5" />{t("csvDownloadExample")}
        </Button>
      </div>

      <div className="mt-4 border-t border-border pt-4">
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
          <h4 className="font-semibold">{t("csvContextByNode")}</h4>
          <span className="text-xs text-muted-foreground">{t("csvUniqueContextColumns", { count: new Set(contextNodes.flatMap((node) => node.context_columns)).size })}</span>
        </div>
        {contextNodes.length === 0 ? <p className="text-xs text-muted-foreground">{t("csvNoNodeContext")}</p> : (
          <div className="grid gap-2 sm:grid-cols-2">
            {contextNodes.map((node) => (
              <section key={node.node_id} aria-label={t("csvContextForNode", { node: node.node_id })} className="rounded-md border border-border bg-background px-3 py-2">
                <div className="mb-2 flex flex-wrap items-baseline gap-x-2">
                  <h5 className="font-mono text-xs font-semibold">{node.node_id}</h5>
                  {node.parent_node_id ? <span className="text-xs text-muted-foreground">{t("csvNestedIn", { node: node.parent_node_id })}</span> : null}
                </div>
                <FieldLines columns={node.context_columns} fields={fields} />
              </section>
            ))}
          </div>
        )}
      </div>

      <details className="mt-4 border-t border-border pt-3">
        <summary className="cursor-pointer font-medium">{t("csvFlowInputColumns", { count: inputColumns.length })}</summary>
        <div className="mt-3 max-h-56 overflow-y-auto rounded-md border border-border p-3">
          <FieldLines columns={inputColumns} fields={fields} />
        </div>
      </details>

      <details className="mt-3 border-t border-border pt-3">
        <summary className="cursor-pointer font-medium">{t("csvFieldsByNode", { count: template.nodes.length })}</summary>
        <div className="mt-3 max-h-64 space-y-2 overflow-y-auto">
          {template.nodes.map((node) => (
            <details key={node.node_id} className="rounded-md border border-border px-3 py-2">
              <summary className="cursor-pointer font-mono text-xs font-semibold">{node.node_id}</summary>
              <div className="mt-2 space-y-3">
                <div>
                  <p className="mb-1 text-xs text-muted-foreground">{t("csvNodeInputs")}</p>
                  {node.input_columns.length > 0 ? <FieldLines columns={node.input_columns} fields={fields} /> : <p className="text-xs text-muted-foreground">{t("csvNone")}</p>}
                </div>
                <div>
                  <p className="mb-1 text-xs text-muted-foreground">{t("csvNodeContext")}</p>
                  {node.context_columns.length > 0 ? <FieldLines columns={node.context_columns} fields={fields} /> : <p className="text-xs text-muted-foreground">{t("csvNone")}</p>}
                </div>
                {node.fixture_columns.length > 0 ? (
                  <div>
                    <p className="mb-1 text-xs text-muted-foreground">{t("csvNodeFixtures")}</p>
                    <FieldLines columns={node.fixture_columns} fields={fields} />
                  </div>
                ) : null}
              </div>
            </details>
          ))}
        </div>
      </details>

      {fixtureColumns.length > 0 || otherColumns.length > 0 ? (
        <details className="mt-3 border-t border-border pt-3">
          <summary className="cursor-pointer font-medium">{t("csvOtherColumns", { count: fixtureColumns.length + otherColumns.length })}</summary>
          <div className="mt-3 max-h-56 overflow-y-auto rounded-md border border-border p-3">
            <FieldLines columns={[...fixtureColumns, ...otherColumns]} fields={fields} />
          </div>
        </details>
      ) : null}
    </section>
  )
}
