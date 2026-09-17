import { Link } from "@tanstack/react-router"
import { Plus } from "lucide-react"
import { useTranslations } from "use-intl"
import type { NodeId, NodeSummary } from "@/domain"
import { Heading, NODE_KIND, Surface, Tag, Text } from "@/components/studio"
import { Button } from "@/components/ui/button"
import { count } from "@/lib/format"
import { noop } from "@/lib/noop"
import { ROUTE_ID } from "@/lib/routes"
import { nodeMeta } from "./presenters"

type NodeListProps = { readonly nodes: readonly NodeSummary[]; readonly selectedId: NodeId | null }

function NodeRow({ node, selected }: { readonly node: NodeSummary; readonly selected: boolean }) {
  const t = useTranslations("nodes")
  const kind = NODE_KIND[node.kind]
  return (
    <Surface variant="panel" radius="lg" padding="xs" interactive tone="llm" selected={selected} asChild>
      <Link from={ROUTE_ID.nodes} to="." search={{ node: node.id }} resetScroll={false}>
        <Heading
          size="cell"
          leading={
            <Tag tone={kind.tone} size="micro">
              {kind.code}
            </Tag>
          }
          title={node.id}
          below={[
            <Text key="meta" role="caption">
              {nodeMeta(node, (stage) => t("stage", { stage }))}
            </Text>,
          ]}
        />
      </Link>
    </Surface>
  )
}

export function NodeList({ nodes, selectedId }: NodeListProps) {
  const t = useTranslations("nodes.list")
  return (
    <Heading size="label" title={t("title")} description={count(nodes.length)}>
      <nav aria-label={t("title")} className="flex flex-col gap-1 pt-1">
        {nodes.map((node) => (
          <NodeRow key={node.id} node={node} selected={node.id === selectedId} />
        ))}
        <Button variant="dashed" className="mt-1.5 w-full" onClick={noop}>
          <Plus />
          {t("new")}
        </Button>
      </nav>
    </Heading>
  )
}
