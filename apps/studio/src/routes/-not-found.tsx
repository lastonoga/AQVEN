import { useTranslations } from "use-intl"
import { Empty, Page } from "@/components/studio"

export function NotFound() {
  const t = useTranslations("common")
  return (
    <Page>
      <Empty title={t("notFound")} />
    </Page>
  )
}
