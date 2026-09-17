import type { StageDescription, StageRun } from "@/domain"
import { STAGE_KIND, type TagSpec } from "@/components/studio"
import { joinMeta, rowRef, score, usd, duration } from "@/lib/format"
import type { Translator } from "@/i18n/translator"
import { TAG_STYLE } from "./blocks"
import type { TraceVariant } from "./context"

type DescriptionKind = StageDescription["kind"]
type DescriptionOf<K extends DescriptionKind> = Extract<StageDescription, { kind: K }>
type DescriptionHandler<K extends DescriptionKind> = (description: DescriptionOf<K>, t: Translator) => string
type DescriptionHandlers = { readonly [K in DescriptionKind]: DescriptionHandler<K> }

const DESCRIPTION: DescriptionHandlers = {
  toolCalls: (description, t) => t("trace.stage.desc.toolCalls", { count: description.count }),
  map: (description, t) => t("trace.stage.desc.map", { concurrency: description.concurrency, source: description.source }),
  pureFunction: (_description, t) => t("trace.stage.desc.pureFunction"),
  families: (description, t) =>
    description.row === undefined
      ? t("trace.stage.desc.families", { count: description.count })
      : t("trace.stage.desc.familiesRow", { count: description.count, row: rowRef(description.row) }),
  loop: (description, t) =>
    description.exit.kind === "threshold"
      ? t("trace.stage.desc.loopThreshold", { body: description.body, threshold: score(description.exit.value) })
      : t("trace.stage.desc.loopStagnation", { body: description.body }),
  text: (description) => description.text,
}

const describeWith = <K extends DescriptionKind>(description: DescriptionOf<K>, t: Translator): string => {
  const handle: DescriptionHandler<K> = DESCRIPTION[description.kind]
  return handle(description, t)
}

export const describeStage = (stage: StageRun, t: Translator): string => describeWith(stage.description, t)

export const kindLabel = (kind: StageRun["kind"], fanOut: number | undefined, t: Translator): string => {
  const code = STAGE_KIND[kind].code
  if (fanOut === undefined) return code
  return t("trace.stage.kindFanOut", { code, count: fanOut })
}

export const stageKindTag = (stage: StageRun, variant: TraceVariant, t: Translator): TagSpec => ({
  ...TAG_STYLE[variant],
  tone: STAGE_KIND[stage.kind].tone,
  children: kindLabel(stage.kind, stage.fanOut, t),
})

export const stageTotals = (stage: StageRun, t: Translator): string =>
  joinMeta([usd(stage.costUsd), stage.durationS === null ? t("trace.stage.waiting") : duration(stage.durationS)])
