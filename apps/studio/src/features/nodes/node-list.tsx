import { Link } from "@tanstack/react-router"
import { useTranslations } from "use-intl"
import type { ApiNode, NodeId } from "@/domain"
import { Dot, Heading, NODE_KIND, Surface, Tag, Text } from "@/components/studio"
import * as ids from "@/data/ids"
import { count } from "@/lib/format"
import { ROUTE_PATH } from "@/lib/routes"
import { NODE_INDENT_STEP } from "./presets"
import { nodeSubtitle, nodeTree } from "./node-tree"

type NodeListProps = { readonly nodes: readonly ApiNode[]; readonly selectedId: NodeId | null }

type NodeRowProps = { readonly node: ApiNode; readonly depth: number; readonly selected: boolean }

function NodeRow({ node, depth, selected }: NodeRowProps) {
  const t = useTranslations("nodes.list")
  const kind = NODE_KIND[node.kind]
  const subtitle = nodeSubtitle(node)
  return (
    <div style={{ paddingLeft: depth * NODE_INDENT_STEP }}>
      <Surface variant="panel" radius="lg" padding="xs" interactive tone={kind.tone} selected={selected} asChild>
        <Link from={ROUTE_PATH.nodes} to="." search={{ node: ids.nodeId(node.node_id) }} resetScroll={false} className="block">
          <Heading
            size="cell"
            leading={
              <Tag tone={kind.tone} size="micro">
                {kind.code}
              </Tag>
            }
            title={node.local_id}
            trailing={node.problems_count > 0 ? <Dot tone="destructive" label={t("problems")} /> : null}
            below={subtitle === null ? [] : [<Text key="meta" role="caption">{subtitle}</Text>]}
          />
        </Link>
      </Surface>
    </div>
  )
}

export function NodeList({ nodes, selectedId }: NodeListProps) {
  const t = useTranslations("nodes.list")
  return (
    <Heading size="label" title={t("title")} description={count(nodes.length)}>
      <nav aria-label={t("title")} className="flex flex-col gap-1 pt-1">
        {nodeTree(nodes).map((row) => (
          <NodeRow key={row.node.node_id} node={row.node} depth={row.depth} selected={row.node.node_id === selectedId} />
        ))}
      </nav>
    </Heading>
  )
}
