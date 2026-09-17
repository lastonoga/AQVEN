import type { JSX } from "react"
import { useTranslations } from "use-intl"
import type { NodeContract, Revision } from "@/domain"
import { Actions, Empty, Heading, Page } from "@/components/studio"
import { useRichTags } from "@/i18n/format"
import { nodesRouteApi } from "@/lib/routes"
import { NodeContractView } from "./node-contract"
import { NodeList } from "./node-list"
import { NODE_LIST_WIDTH } from "./presets"
import { revisionLabel } from "./presenters"
import { Registry } from "./registry"

function NodesHeader({ revision }: { readonly revision: Revision }) {
  const t = useTranslations("nodes")
  const tStatus = useTranslations("domain.revisionStatus")
  const tags = useRichTags()
  return (
    <Heading
      size="page"
      title={t("title")}
      below={[
        <div key="lead" className="max-w-[820px]">
          {t.rich("lead", tags)}
        </div>,
      ]}
      trailing={
        <Actions
          actions={[
            { id: "revision", label: revisionLabel(revision, tStatus(revision.status)) },
            { id: "apply", label: t("apply"), variant: "default" },
          ]}
        />
      }
    />
  )
}

function ContractPane({ contract }: { readonly contract: NodeContract | null }) {
  const t = useTranslations("common.empty")
  if (contract === null) return <Empty title={t("contract")} />
  return <NodeContractView contract={contract} />
}

export function NodesScreen(): JSX.Element {
  const { overview, nodeId, contract } = nodesRouteApi.useLoaderData()
  return (
    <Page
      width="lg"
      header={<NodesHeader revision={overview.revision} />}
      aside={{ content: <NodeList nodes={overview.nodes} selectedId={nodeId} />, width: NODE_LIST_WIDTH }}
      below={<Registry registry={overview.registry} />}
    >
      <ContractPane contract={contract} />
    </Page>
  )
}
