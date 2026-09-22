import type { ReactNode } from "react"
import { useTranslations } from "use-intl"
import type { ApiDiagnostic, ApiNode, ApiNodeDetail, ApiPromptDetail } from "@/domain"
import {
  ChoiceLink,
  ChoiceList,
  Heading,
  SectionStack,
  SEVERITY_TONE,
  Surface,
  Tag,
  Text,
  NODE_KIND,
} from "@/components/studio"
import * as ids from "@/data/ids"
import { ROUTE_PATH } from "@/lib/routes"
import { childNodes } from "./node-tree"
import { specDescription } from "./node-facts"
import { nodeSections, type NodeSectionCopy } from "./node-sections"
import { availableTabs, resolveTab, type NodeTab } from "./node-tabs"
import { bindingRows, resolution } from "./presenters"
import { PromptBody } from "./prompt-body"
import { SchemasBody } from "./schemas-body"

export type NodePanelProps = {
  readonly detail: ApiNodeDetail
  readonly prompt: ApiPromptDetail | null
  readonly nodes: readonly ApiNode[]
  readonly tab: NodeTab | undefined
}

type BodyProps = Omit<NodePanelProps, "tab">

function DefinitionBody({ detail, prompt, nodes }: BodyProps) {
  const t = useTranslations("nodes")
  const copy: NodeSectionCopy = {
    title: (id) => t(`sections.${id}`),
    fact: (key) => t(`facts.${key}`),
    graph: (key) => t(`graph.${key}`),
  }
  return <SectionStack sections={nodeSections({ detail, prompt, children: childNodes(nodes, detail.node_id), copy })} framed gap="base" />
}

function PromptTab({ prompt }: BodyProps) {
  const t = useTranslations("nodes.prompt")
  if (prompt === null) return <Text role="body">{t("none")}</Text>
  return <PromptBody prompt={prompt} />
}

function SchemasTab({ detail }: BodyProps) {
  return <SchemasBody detail={detail} />
}

function ProblemRow({ problem }: { readonly problem: ApiDiagnostic }) {
  const tSeverity = useTranslations("domain.severity")
  return (
    <Surface variant="panel" radius="lg" padding="sm">
      <Heading
        size="tiny"
        leading={
          <Tag tone={SEVERITY_TONE[problem.severity]} size="micro">
            {tSeverity(problem.severity)}
          </Tag>
        }
        title={problem.code}
      below={[problem.message, problem.hint]}
      />
    </Surface>
  )
}

function ProblemsTab({ detail }: BodyProps) {
  return (
    <div className="flex flex-col gap-2">
      {detail.problems.map((problem) => (
        <ProblemRow key={`${problem.code}-${problem.path.join(".")}`} problem={problem} />
      ))}
    </div>
  )
}

const NODE_TAB_BODY: Readonly<Record<NodeTab, (props: BodyProps) => ReactNode>> = {
  definition: DefinitionBody,
  prompt: PromptTab,
  schemas: SchemasTab,
  problems: ProblemsTab,
}

function NodeTabs({ detail, prompt, active }: { readonly detail: ApiNodeDetail; readonly prompt: ApiPromptDetail | null; readonly active: NodeTab }) {
  const t = useTranslations("nodes.tabs")
  return (
    <ChoiceList appearance="segmented" label={t("aria")} className="mt-3">
      {availableTabs({ detail, prompt }).map((tab) => (
        <ChoiceLink
          key={tab}
          appearance="segmented"
          selected={tab === active}
          from={ROUTE_PATH.nodes}
          to="."
          search={{ node: ids.nodeId(detail.node_id), tab }}
          resetScroll={false}
        >
          {t(tab)}
        </ChoiceLink>
      ))}
    </ChoiceList>
  )
}

function NodeIdentity({ detail, prompt }: { readonly detail: ApiNodeDetail; readonly prompt: ApiPromptDetail | null }) {
  const t = useTranslations("nodes")
  const kind = NODE_KIND[detail.kind]
  const status = resolution(bindingRows(detail, prompt))
  const description = specDescription(detail.spec)
  return (
    <Heading
      size="entity"
      wrap
      leading={
        <Tag tone={kind.tone} size="sm">
          {kind.code}
        </Tag>
      }
      title={detail.node_id}
      below={description === "" ? [] : [description]}
      trailing={
        status.total === 0 ? null : (
          <Tag tone={status.tone} size="md" shape="pill">
            {t("detail.bound", { bound: status.bound, total: status.total })}
          </Tag>
        )
      }
    />
  )
}

export function NodePanel({ detail, prompt, nodes, tab }: NodePanelProps) {
  const active = resolveTab({ detail, prompt }, tab)
  const Body = NODE_TAB_BODY[active]
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <Surface variant="panel" padding="md">
        <NodeIdentity detail={detail} prompt={prompt} />
        <NodeTabs detail={detail} prompt={prompt} active={active} />
      </Surface>
      <Body detail={detail} prompt={prompt} nodes={nodes} />
    </div>
  )
}
