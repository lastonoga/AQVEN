import type { Binding, NodeContract, NodeSummary, RegistryEntry, Revision, SignatureRef, TextLine } from "@/domain"
import type { Tone } from "@/components/studio"
import { joinMeta } from "@/lib/format"
import { codeLines } from "@/lib/text"
import { REGISTRY_KIND } from "./presets"

export type StageLabel = (stage: number) => string

export type Reference = {
  readonly text: string
  readonly detail: string
  readonly tone: Tone
  readonly lines: readonly TextLine[]
}

export type Resolution = { readonly resolved: number; readonly total: number; readonly tone: Tone }

const signatureName = (signature: SignatureRef | undefined): string | undefined => {
  if (signature === undefined) return undefined
  return `${signature.id} ${signature.version}`
}

export const nodeMeta = (node: NodeSummary, stageLabel: StageLabel): string =>
  joinMeta([stageLabel(node.stage), ...node.path, signatureName(node.signature)])

export const contractMeta = (contract: NodeContract, stageLabel: StageLabel): string =>
  joinMeta([stageLabel(contract.stage), ...contract.context])

export const signatureReference = ({ signature }: NodeContract): Reference | null => {
  if (signature === null) return null
  return {
    text: signature.ref.id,
    detail: joinMeta([signature.ref.version, signature.ref.revision]),
    tone: REGISTRY_KIND.signature.tone,
    lines: codeLines(signature.source),
  }
}

export const profileReference = ({ profile }: NodeContract): Reference | null => {
  if (profile === null) return null
  return { text: profile.ref.id, detail: profile.ref.model, tone: REGISTRY_KIND.profile.tone, lines: codeLines(profile.source) }
}

const unresolvedTone = (unresolved: readonly Binding[]): Tone => {
  if (unresolved.length === 0) return "success"
  return unresolved.every((binding) => binding.optional) ? "warning" : "destructive"
}

export const resolution = (bindings: readonly Binding[]): Resolution => {
  const unresolved = bindings.filter((binding) => !binding.resolved)
  return { resolved: bindings.length - unresolved.length, total: bindings.length, tone: unresolvedTone(unresolved) }
}

export const inputLabel = (binding: Binding): string => `$${binding.input}`

export const typeLabel = (binding: Binding): string => `${binding.type}${binding.optional ? "?" : ""}`

export const registryTrailing = (entry: RegistryEntry, usage: string): string => joinMeta([entry.summary, usage])

export const revisionLabel = (revision: Revision, status: string): string => joinMeta([revision.id, status])
