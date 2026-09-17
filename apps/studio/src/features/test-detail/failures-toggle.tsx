import { useTranslations } from "use-intl"
import { ChoiceGroup } from "@/components/studio"
import { testDetailRouteApi } from "@/lib/routes"

export type FailuresToggleProps = { readonly count: number; readonly failures: boolean }

const FAILURES = "failures"

export function FailuresToggle({ count, failures }: FailuresToggleProps) {
  const t = useTranslations("testDetail.filter")
  const navigate = testDetailRouteApi.useNavigate()
  return (
    <ChoiceGroup
      appearance="toggle"
      tone="destructive"
      deselectable
      label={t("label")}
      items={[{ value: FAILURES, label: t("failuresOnly", { count }) }]}
      value={failures ? FAILURES : null}
      onValueChange={(value) => {
        void navigate({ search: (prev) => ({ ...prev, failures: value !== null }), resetScroll: false })
      }}
    />
  )
}
