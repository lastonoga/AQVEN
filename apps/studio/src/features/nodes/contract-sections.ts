import type { Binding, NodeCheck, NodeContract, TextLine } from "@/domain"
import { codeLines } from "@/lib/text"
import { profileReference, signatureReference, type Reference } from "./presenters"

export const REFERENCE_SECTIONS = ["signature", "profile"] as const
export const PANEL_SECTIONS = ["bindings", "writes", "code"] as const

export type ReferenceSectionId = (typeof REFERENCE_SECTIONS)[number]
export type ContractSectionId = ReferenceSectionId | (typeof PANEL_SECTIONS)[number]

export type ContractCopy = {
  readonly title: (section: ContractSectionId) => string
  readonly hint: (section: ContractSectionId) => string
  readonly none: (section: ReferenceSectionId) => string
}

type ContractBodyFields = {
  readonly text: { readonly lines: readonly TextLine[]; readonly variant?: "code" | "plain" }
  readonly reference: { readonly reference: Reference }
  readonly bindings: { readonly bindings: readonly Binding[] }
  readonly writes: { readonly lines: readonly TextLine[]; readonly checks: readonly NodeCheck[] }
}

export type ContractBodyKind = keyof ContractBodyFields

export type ContractBody<K extends ContractBodyKind = ContractBodyKind> = {
  [P in K]: { readonly kind: P } & ContractBodyFields[P]
}[K]

export type ContractSection = {
  readonly id: string
  readonly title: string
  readonly hint: string
  readonly body: ContractBody
}

type ContractBodyBuilder = (contract: NodeContract, copy: ContractCopy) => ContractBody

const referenceBody = (reference: Reference | null, none: string): ContractBody => {
  if (reference === null) return { kind: "text", lines: [[none]], variant: "plain" }
  return { kind: "reference", reference }
}

const CONTRACT_BODY: Readonly<Record<ContractSectionId, ContractBodyBuilder>> = {
  signature: (contract, copy) => referenceBody(signatureReference(contract), copy.none("signature")),
  profile: (contract, copy) => referenceBody(profileReference(contract), copy.none("profile")),
  bindings: (contract) => ({ kind: "bindings", bindings: contract.bindings }),
  writes: (contract) => ({ kind: "writes", lines: codeLines(contract.writesSource), checks: contract.checks }),
  code: (contract) => ({ kind: "text", lines: codeLines(contract.generatedSource) }),
}

export const contractSections = (
  sections: readonly ContractSectionId[],
  contract: NodeContract,
  copy: ContractCopy,
): readonly ContractSection[] =>
  sections.map((section) => ({
    id: `contract-${section}`,
    title: copy.title(section),
    hint: copy.hint(section),
    body: CONTRACT_BODY[section](contract, copy),
  }))
