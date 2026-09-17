import type { CheckKind, RegistryKind } from "@/domain"
import type { KindSpec, Tone } from "@/components/studio"

export const CHECK_KIND: Readonly<Record<CheckKind, KindSpec>> = {
  validator: { code: "VALIDATOR", tone: "neutral" },
  scorer: { code: "SCORER", tone: "llm" },
}

export const REGISTRY_KIND: Readonly<Record<RegistryKind, { readonly tone: Tone }>> = {
  signature: { tone: "warning" },
  profile: { tone: "llm" },
  adapter: { tone: "tool" },
  type: { tone: "success" },
}

export const REGISTRY_KINDS = ["signature", "profile", "adapter", "type"] as const satisfies readonly RegistryKind[]

export const BINDING_SOURCE_TONE: Tone = "tool"

export const NODE_LIST_WIDTH = 252

export const BINDINGS_MIN_WIDTH = 880
