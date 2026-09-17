import type { NestedBlock, StageKind } from "@/domain"
import { STAGE_KIND } from "@/components/studio"
import { SEPARATOR } from "@/lib/format"
import type { Translator } from "@/i18n/translator"
import { kindLabel } from "./descriptions"

type HintRule = (block: NestedBlock, t: Translator) => string | undefined

const NESTED_HINT: Partial<Readonly<Record<StageKind, HintRule>>> = {
  loop: (_block, t) => t("trace.nested.hintScrollRight"),
  parallel: (block, t) => (block.quorum === undefined ? undefined : t("trace.nested.hintQuorum", block.quorum)),
  map: (_block, t) => t("trace.nested.hintClaimPerColumn"),
}

export type NestedHeading = {
  readonly depthLabel: string
  readonly kindLabel: string
  readonly tone: (typeof STAGE_KIND)[StageKind]["tone"]
  readonly title: string
  readonly hint: string | undefined
}

export const nestedHeading = (block: NestedBlock, depth: number, t: Translator): NestedHeading => ({
  depthLabel: t("trace.nested.depth", { depth }),
  kindLabel: kindLabel(block.kind, block.fanOut, t),
  tone: STAGE_KIND[block.kind].tone,
  title: block.titleParts.join(SEPARATOR),
  hint: NESTED_HINT[block.kind]?.(block, t),
})
