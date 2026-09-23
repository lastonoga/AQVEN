import { useTranslations } from "use-intl"
import type { StageRangeLabels } from "./stage-range-timeline"

export function useStageRangeLabels(): StageRangeLabels {
  const t = useTranslations("common.stageRange")
  return {
    selectOnlyNode: (node) => t("selectOnlyNode", { node }),
    moveRange: t("moveRange"),
    moveRangeHint: t("moveRangeHint"),
    startNode: t("startNode"),
    endNode: t("endNode"),
  }
}
