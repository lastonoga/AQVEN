import { useTranslations } from "use-intl"
import type { InspectorContext } from "./inspector-sections"

export function useInspectorContext(): InspectorContext {
  const t = useTranslations()
  return {
    none: t("common.none"),
    title: (key) => t(`schema.inspector.sections.${key}`),
  }
}
