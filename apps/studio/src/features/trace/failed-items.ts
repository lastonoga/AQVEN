import type { TagSize, TagSpec } from "@/components/studio"
import type { Translator } from "@/i18n/translator"
import type { ItemFailures } from "./failures"

export const failedItemsTags = (failures: ItemFailures | null, t: Translator, size: TagSize): readonly TagSpec[] =>
  failures === null ? [] : [{ tone: "destructive", fill: "solid", size, children: t("trace.failedItems", { failed: failures.failed, total: failures.total }) }]
