import type { ReactNode } from "react"
import { useTranslations } from "use-intl"
import type { NodeContract } from "@/domain"
import { Heading, NODE_KIND, SectionStack, Surface, Tag, type SectionBody, type SectionSpec } from "@/components/studio"
import { BindingsBody } from "./bindings-body"
import {
  contractSections,
  PANEL_SECTIONS,
  REFERENCE_SECTIONS,
  type ContractBody,
  type ContractBodyKind,
  type ContractCopy,
  type ContractSection,
} from "./contract-sections"
import { contractMeta, resolution } from "./presenters"
import { ReferenceBody } from "./reference-body"
import { WritesBody } from "./writes-body"

type ContractBodyViews = { readonly [K in ContractBodyKind]: (body: ContractBody<K>) => SectionBody }

const node = (content: ReactNode): SectionBody => ({ kind: "node", node: content })

const CONTRACT_BODY_VIEW: ContractBodyViews = {
  text: ({ kind: _kind, ...text }) => ({ kind: "text", ...text }),
  reference: ({ reference }) => node(<ReferenceBody reference={reference} />),
  bindings: ({ bindings }) => node(<BindingsBody bindings={bindings} />),
  writes: ({ lines, checks }) => node(<WritesBody lines={lines} checks={checks} />),
}

const sectionBody = <K extends ContractBodyKind>(body: ContractBody<K>): SectionBody => {
  const view: (body: ContractBody<K>) => SectionBody = CONTRACT_BODY_VIEW[body.kind]
  return view(body)
}

const toSectionSpec = (section: ContractSection): SectionSpec => ({ ...section, body: sectionBody(section.body) })

function ContractIdentity({ contract }: { readonly contract: NodeContract }) {
  const t = useTranslations("nodes")
  const kind = NODE_KIND[contract.kind]
  const status = resolution(contract.bindings)
  return (
    <Heading
      size="entity"
      wrap
      leading={
        <Tag tone={kind.tone} size="sm">
          {kind.code}
        </Tag>
      }
      title={contract.id}
      description={contractMeta(contract, (stage) => t("stage", { stage }))}
      trailing={
        <Tag tone={status.tone} size="md" shape="pill">
          {t("detail.resolve", { resolved: status.resolved, total: status.total })}
        </Tag>
      }
    />
  )
}

export function NodeContractView({ contract }: { readonly contract: NodeContract }) {
  const t = useTranslations("nodes")
  const copy: ContractCopy = {
    title: (section) => t(`${section}.title`),
    hint: (section) => t(`${section}.hint`),
    none: (section) => t(`${section}.none`),
  }
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <Surface variant="panel" padding="md">
        <ContractIdentity contract={contract} />
        <SectionStack sections={contractSections(REFERENCE_SECTIONS, contract, copy).map(toSectionSpec)} columns={2} gap="sm" className="mt-2.75" />
      </Surface>
      <SectionStack sections={contractSections(PANEL_SECTIONS, contract, copy).map(toSectionSpec)} framed gap="base" />
    </div>
  )
}
