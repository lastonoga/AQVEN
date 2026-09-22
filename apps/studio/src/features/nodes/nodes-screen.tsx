import type { JSX } from "react"
import { useTranslations } from "use-intl"
import { Empty, Heading, Page } from "@/components/studio"
import { count } from "@/lib/format"
import { nodesRouteApi } from "@/lib/routes"
import { NodeList } from "./node-list"
import { NodePanel } from "./node-panel"
import { NODE_LIST_WIDTH } from "./presets"

function NodesHeader({ nodeCount }: { readonly nodeCount: number }) {
  const t = useTranslations("nodes")
  return <Heading size="page" title={t("title")} description={count(nodeCount)} below={[t("lead")]} />
}

export function NodesScreen(): JSX.Element {
  const { nodes, nodeId, detail, prompt } = nodesRouteApi.useLoaderData()
  const { tab } = nodesRouteApi.useSearch()
  const t = useTranslations("nodes.empty")
  return (
    <Page
      width="lg"
      header={<NodesHeader nodeCount={nodes.length} />}
      aside={{ content: <NodeList nodes={nodes} selectedId={nodeId} />, width: NODE_LIST_WIDTH }}
    >
      {detail === null ? (
        <Empty title={t("title")} hint={t("hint")} />
      ) : (
        <NodePanel detail={detail} prompt={prompt} nodes={nodes} tab={tab} />
      )}
    </Page>
  )
}
