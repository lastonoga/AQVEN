import { useEffect, useState } from "react"
import { useTranslations } from "use-intl"
import type { SchemaNodeDisplayPreview } from "@/api/schema"
import type { FlowId, NodeId } from "@/domain"
import { FormattedDocument } from "@/features/runs"
import { canvasRouteApi } from "@/lib/routes"

export function NodeDisplayExample({ flowId, nodeId }: { readonly flowId: FlowId; readonly nodeId: NodeId }) {
  const { api } = canvasRouteApi.useRouteContext()
  const t = useTranslations("flow.inspector")
  const [preview, setPreview] = useState<SchemaNodeDisplayPreview | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    void api.flow.nodeDisplayPreview(flowId, nodeId).then((result) => {
      if (active) setPreview(result)
    }).catch((reason: unknown) => {
      if (active) setError(reason instanceof Error ? reason.message : String(reason))
    })
    return () => { active = false }
  }, [api.flow, flowId, nodeId])

  if (error !== null) return <p className="text-sm text-muted-foreground">{t("displayExampleError", { reason: error })}</p>
  if (preview === null) return <p className="text-sm text-muted-foreground" role="status">{t("displayExampleLoading")}</p>
  return <div className="min-w-0 space-y-3">
    <p className="text-xs text-muted-foreground">{preview.source === "example" && preview.example_name
      ? t("displayExampleNamed", { name: preview.example_name })
      : t("displayExampleSchema")}</p>
    <FormattedDocument value={preview.sample_output} document={preview.document} compact example />
  </div>
}
